#endpoint: https://npucikkafr4ywr3fdv672ukuie0lqlsq.lambda-url.us-east-1.on.aws/
"""
Lambda function for Shopify webhook processing
Handles 5 webhook endpoints:
  - POST /webhooks/orders/create - Handle order creation
  - POST /webhooks/orders/update - Handle order updates
  - POST /webhooks/inventory/update - Handle inventory updates
  - POST /webhooks/fulfillment/create - Handle fulfillment creation
  - POST /webhooks/app/uninstall - Handle app uninstallation

All endpoints:
  - Use HMAC verification (NO JWT auth)
  - Log all webhooks to commercive_webhooks table
  - Return 200 even on errors (prevent Shopify retries)
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4
from boto3.dynamodb.conditions import Key

# Import shared utilities
from utils.shopify import verify_webhook_hmac
from utils.dynamodb import put_item, get_item, update_item, query
from utils.response import success, error, server_error, cors_preflight

# Environment variables
SHOPIFY_WEBHOOK_SECRET = os.environ.get('SHOPIFY_WEBHOOK_SECRET', '')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for Shopify webhook operations.
    Routes requests to appropriate handlers based on path and topic.

    IMPORTANT: Always returns 200 to prevent Shopify retries, even on errors.
    """
    try:
        # Handle CORS preflight
        method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
        if method == 'OPTIONS':
            return cors_preflight()

        # Extract routing info
        path = event.get('rawPath', '') or event.get('path', '')
        path = path.rstrip('/')

        # Get raw body for HMAC verification
        body = event.get('body', '')
        is_base64 = event.get('isBase64Encoded', False)

        # Decode if base64 encoded
        if is_base64:
            import base64
            body_bytes = base64.b64decode(body)
        else:
            body_bytes = body.encode('utf-8') if isinstance(body, str) else body

        # Verify HMAC signature
        headers = event.get('headers', {})
        hmac_header = headers.get('x-shopify-hmac-sha256') or headers.get('X-Shopify-Hmac-Sha256', '')

        if not verify_hmac_signature(body_bytes, hmac_header):
            print("WARNING: Invalid HMAC signature")
            # Still return 200 to prevent retries
            return success({'message': 'Received'})

        # Parse the webhook payload
        try:
            payload = json.loads(body) if isinstance(body, str) else json.loads(body_bytes.decode('utf-8'))
        except json.JSONDecodeError:
            print(f"ERROR: Invalid JSON payload")
            return success({'message': 'Received'})

        # Get shop domain from header
        shop_domain = headers.get('x-shopify-shop-domain') or headers.get('X-Shopify-Shop-Domain', '')
        topic = headers.get('x-shopify-topic') or headers.get('X-Shopify-Topic', '')

        # Route based on path
        if path == '/webhooks/orders/create' or 'orders/create' in topic.lower():
            return handle_orders_create(payload, shop_domain, topic, body)
        elif path == '/webhooks/orders/update' or 'orders/update' in topic.lower():
            return handle_orders_update(payload, shop_domain, topic, body)
        elif path == '/webhooks/inventory/update' or 'inventory_levels/update' in topic.lower():
            return handle_inventory_update(payload, shop_domain, topic, body)
        elif path == '/webhooks/fulfillment/create' or 'fulfillments/create' in topic.lower():
            return handle_fulfillment_create(payload, shop_domain, topic, body)
        elif path == '/webhooks/app/uninstall' or 'app/uninstalled' in topic.lower():
            return handle_app_uninstall(payload, shop_domain, topic, body)
        else:
            print(f"Unknown webhook path: {path}, topic: {topic}")
            # Still log it
            log_webhook(None, topic or path, body, False, f"Unknown webhook: {path}")
            return success({'message': 'Received'})

    except Exception as e:
        print(f"Unhandled error in webhooks handler: {str(e)}")
        import traceback
        traceback.print_exc()
        # Always return 200 to prevent Shopify retries
        return success({'message': 'Received'})


def verify_hmac_signature(body_bytes: bytes, hmac_header: str) -> bool:
    """
    Verify Shopify webhook HMAC signature

    Args:
        body_bytes: Raw request body as bytes
        hmac_header: X-Shopify-Hmac-SHA256 header value

    Returns:
        True if valid, False otherwise
    """
    if not SHOPIFY_WEBHOOK_SECRET:
        print("WARNING: SHOPIFY_WEBHOOK_SECRET not set, skipping HMAC verification")
        return True  # In dev, allow through

    if not hmac_header:
        print("WARNING: No HMAC header provided")
        return False

    return verify_webhook_hmac(body_bytes, hmac_header, SHOPIFY_WEBHOOK_SECRET)


def get_store_by_domain(shop_domain: str) -> Optional[Dict[str, Any]]:
    """
    Get store record by Shopify domain

    Args:
        shop_domain: Shop domain (e.g., "mystore.myshopify.com")

    Returns:
        Store record if found, None otherwise
    """
    try:
        stores = query(
            'commercive_stores',
            index_name='domain-index',
            key_condition=Key('shop_domain').eq(shop_domain),
            limit=1
        )
        return stores[0] if stores else None
    except Exception as e:
        print(f"Error getting store by domain: {str(e)}")
        return None


def log_webhook(
    store_id: Optional[str],
    topic: str,
    payload: str,
    processed: bool,
    error_msg: Optional[str] = None
) -> None:
    """
    Log webhook to commercive_webhooks table

    Args:
        store_id: Store ID (if known)
        topic: Webhook topic
        payload: Webhook payload (JSON string)
        processed: Whether webhook was processed successfully
        error_msg: Error message if processing failed
    """
    try:
        webhook_record = {
            'webhook_id': str(uuid4()),
            'store_id': store_id or 'unknown',
            'topic': topic,
            'payload': payload if isinstance(payload, str) else json.dumps(payload),
            'processed': processed,
            'error': error_msg or '',
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        put_item('commercive_webhooks', webhook_record)
    except Exception as e:
        print(f"Error logging webhook: {str(e)}")


def handle_orders_create(
    payload: Dict[str, Any],
    shop_domain: str,
    topic: str,
    raw_body: str
) -> Dict[str, Any]:
    """
    Handle POST /webhooks/orders/create
    Creates order and line item records in DynamoDB
    """
    try:
        print(f"Processing orders/create webhook for {shop_domain}")

        # Get store by domain
        store = get_store_by_domain(shop_domain)
        if not store:
            error_msg = f"Store not found for domain: {shop_domain}"
            print(error_msg)
            log_webhook(None, topic, raw_body, False, error_msg)
            return success({'message': 'Received'})

        store_id = store['store_id']

        # Extract order data from Shopify payload
        order_id = str(uuid4())
        shopify_order_id = str(payload.get('id', ''))
        order_number = payload.get('name', '')  # e.g., "#1001"

        # Customer info
        customer = payload.get('customer', {})
        customer_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
        customer_email = payload.get('email', customer.get('email', ''))

        # Order totals
        total_price = str(payload.get('total_price', '0'))
        currency = payload.get('currency', 'USD')

        # Status
        financial_status = payload.get('financial_status', 'pending')
        fulfillment_status = payload.get('fulfillment_status') or 'unfulfilled'

        # Line items
        line_items = payload.get('line_items', [])
        line_items_count = len(line_items)

        # Create order record
        order_record = {
            'order_id': order_id,
            'store_id': store_id,
            'shopify_order_id': shopify_order_id,
            'order_number': order_number,
            'customer_name': customer_name,
            'customer_email': customer_email,
            'total_price': total_price,
            'currency': currency,
            'financial_status': financial_status,
            'fulfillment_status': fulfillment_status,
            'line_items_count': line_items_count,
            'created_at': payload.get('created_at', datetime.utcnow().isoformat() + 'Z'),
            'updated_at': datetime.utcnow().isoformat() + 'Z'
        }

        put_item('commercive_orders', order_record)
        print(f"Created order record: {order_id}")

        # Create line item records
        for item in line_items:
            item_id = str(uuid4())
            line_item_record = {
                'item_id': item_id,
                'order_id': order_id,
                'store_id': store_id,
                'shopify_line_item_id': str(item.get('id', '')),
                'product_title': item.get('title', ''),
                'variant_title': item.get('variant_title', ''),
                'sku': item.get('sku', ''),
                'quantity': item.get('quantity', 1),
                'price': str(item.get('price', '0')),
                'total': str(float(item.get('price', 0)) * item.get('quantity', 1))
            }

            put_item('commercive_order_items', line_item_record)

        print(f"Created {len(line_items)} line item records")

        # Log success
        log_webhook(store_id, topic, raw_body, True)

        return success({'message': 'Order created successfully'})

    except Exception as e:
        error_msg = f"Error processing orders/create: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()

        log_webhook(
            store.get('store_id') if 'store' in locals() else None,
            topic,
            raw_body,
            False,
            error_msg
        )

        # Still return 200
        return success({'message': 'Received'})


def handle_orders_update(
    payload: Dict[str, Any],
    shop_domain: str,
    topic: str,
    raw_body: str
) -> Dict[str, Any]:
    """
    Handle POST /webhooks/orders/update
    Updates existing order record
    """
    try:
        print(f"Processing orders/update webhook for {shop_domain}")

        # Get store by domain
        store = get_store_by_domain(shop_domain)
        if not store:
            error_msg = f"Store not found for domain: {shop_domain}"
            print(error_msg)
            log_webhook(None, topic, raw_body, False, error_msg)
            return success({'message': 'Received'})

        store_id = store['store_id']
        shopify_order_id = str(payload.get('id', ''))

        # Find existing order by shopify_order_id
        orders = query(
            'commercive_orders',
            index_name='shopify-order-index',
            key_condition=Key('shopify_order_id').eq(shopify_order_id),
            limit=1
        )

        if not orders:
            print(f"Order not found for Shopify ID: {shopify_order_id}")
            # Might be a new order, treat as create
            return handle_orders_create(payload, shop_domain, topic, raw_body)

        order = orders[0]
        order_id = order['order_id']

        # Update order fields
        updates = {
            'financial_status': payload.get('financial_status', 'pending'),
            'fulfillment_status': payload.get('fulfillment_status') or 'unfulfilled',
            'updated_at': datetime.utcnow().isoformat() + 'Z'
        }

        # Update customer info if changed
        customer = payload.get('customer', {})
        customer_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
        if customer_name:
            updates['customer_name'] = customer_name

        customer_email = payload.get('email', customer.get('email', ''))
        if customer_email:
            updates['customer_email'] = customer_email

        update_item('commercive_orders', {'order_id': order_id}, updates)
        print(f"Updated order: {order_id}")

        # Update line items if changed
        line_items = payload.get('line_items', [])
        if line_items:
            # Get existing line items
            existing_items = query(
                'commercive_order_items',
                index_name='order-items-index',
                key_condition=Key('order_id').eq(order_id)
            )

            # Create a map of shopify_line_item_id to item_id
            existing_map = {item['shopify_line_item_id']: item for item in existing_items}

            # Update or create line items
            for item in line_items:
                shopify_line_item_id = str(item.get('id', ''))

                if shopify_line_item_id in existing_map:
                    # Update existing
                    existing_item = existing_map[shopify_line_item_id]
                    item_updates = {
                        'quantity': item.get('quantity', 1),
                        'price': str(item.get('price', '0')),
                        'total': str(float(item.get('price', 0)) * item.get('quantity', 1))
                    }
                    update_item('commercive_order_items', {'item_id': existing_item['item_id']}, item_updates)
                else:
                    # Create new
                    item_id = str(uuid4())
                    line_item_record = {
                        'item_id': item_id,
                        'order_id': order_id,
                        'store_id': store_id,
                        'shopify_line_item_id': shopify_line_item_id,
                        'product_title': item.get('title', ''),
                        'variant_title': item.get('variant_title', ''),
                        'sku': item.get('sku', ''),
                        'quantity': item.get('quantity', 1),
                        'price': str(item.get('price', '0')),
                        'total': str(float(item.get('price', 0)) * item.get('quantity', 1))
                    }
                    put_item('commercive_order_items', line_item_record)

        # Log success
        log_webhook(store_id, topic, raw_body, True)

        return success({'message': 'Order updated successfully'})

    except Exception as e:
        error_msg = f"Error processing orders/update: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()

        log_webhook(
            store.get('store_id') if 'store' in locals() else None,
            topic,
            raw_body,
            False,
            error_msg
        )

        return success({'message': 'Received'})


def handle_inventory_update(
    payload: Dict[str, Any],
    shop_domain: str,
    topic: str,
    raw_body: str
) -> Dict[str, Any]:
    """
    Handle POST /webhooks/inventory/update
    Updates inventory quantity in commercive_inventory
    """
    try:
        print(f"Processing inventory/update webhook for {shop_domain}")

        # Get store by domain
        store = get_store_by_domain(shop_domain)
        if not store:
            error_msg = f"Store not found for domain: {shop_domain}"
            print(error_msg)
            log_webhook(None, topic, raw_body, False, error_msg)
            return success({'message': 'Received'})

        store_id = store['store_id']

        # Extract inventory data
        inventory_item_id = str(payload.get('inventory_item_id', ''))
        available = payload.get('available', 0)

        if not inventory_item_id:
            print("No inventory_item_id in payload")
            log_webhook(store_id, topic, raw_body, False, "Missing inventory_item_id")
            return success({'message': 'Received'})

        # Find inventory record by shopify_inventory_item_id
        inventory_items = query(
            'commercive_inventory',
            index_name='store-inventory-index',
            key_condition=Key('store_id').eq(store_id)
        )

        # Find matching item
        found = False
        for inv_item in inventory_items:
            if inv_item.get('shopify_inventory_item_id') == inventory_item_id:
                # Update quantity
                update_item(
                    'commercive_inventory',
                    {'inventory_id': inv_item['inventory_id']},
                    {
                        'quantity': available,
                        'updated_at': datetime.utcnow().isoformat() + 'Z'
                    }
                )
                print(f"Updated inventory: {inv_item['inventory_id']} to quantity {available}")
                found = True
                break

        if not found:
            print(f"Inventory item not found for shopify_inventory_item_id: {inventory_item_id}")
            # This is ok - might not have synced this item yet

        # Log success
        log_webhook(store_id, topic, raw_body, True)

        return success({'message': 'Inventory updated successfully'})

    except Exception as e:
        error_msg = f"Error processing inventory/update: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()

        log_webhook(
            store.get('store_id') if 'store' in locals() else None,
            topic,
            raw_body,
            False,
            error_msg
        )

        return success({'message': 'Received'})


def handle_fulfillment_create(
    payload: Dict[str, Any],
    shop_domain: str,
    topic: str,
    raw_body: str
) -> Dict[str, Any]:
    """
    Handle POST /webhooks/fulfillment/create
    Creates tracking records in commercive_trackings
    """
    try:
        print(f"Processing fulfillment/create webhook for {shop_domain}")

        # Get store by domain
        store = get_store_by_domain(shop_domain)
        if not store:
            error_msg = f"Store not found for domain: {shop_domain}"
            print(error_msg)
            log_webhook(None, topic, raw_body, False, error_msg)
            return success({'message': 'Received'})

        store_id = store['store_id']

        # Extract fulfillment data
        shopify_fulfillment_id = str(payload.get('id', ''))
        shopify_order_id = str(payload.get('order_id', ''))

        # Find our order by shopify_order_id
        orders = query(
            'commercive_orders',
            index_name='shopify-order-index',
            key_condition=Key('shopify_order_id').eq(shopify_order_id),
            limit=1
        )

        if not orders:
            error_msg = f"Order not found for Shopify ID: {shopify_order_id}"
            print(error_msg)
            log_webhook(store_id, topic, raw_body, False, error_msg)
            return success({'message': 'Received'})

        order = orders[0]
        order_id = order['order_id']

        # Extract tracking info
        tracking_info = payload.get('tracking_info', {})
        tracking_number = payload.get('tracking_number', tracking_info.get('number', ''))
        tracking_company = payload.get('tracking_company', tracking_info.get('company', ''))
        tracking_url = payload.get('tracking_url', tracking_info.get('url', ''))
        tracking_urls = payload.get('tracking_urls', [])

        # Use first tracking URL if available
        if not tracking_url and tracking_urls:
            tracking_url = tracking_urls[0]

        status = payload.get('status', 'fulfilled')
        shipped_at = payload.get('updated_at', datetime.utcnow().isoformat() + 'Z')

        # Create tracking record
        tracking_id = str(uuid4())
        tracking_record = {
            'tracking_id': tracking_id,
            'order_id': order_id,
            'store_id': store_id,
            'shopify_fulfillment_id': shopify_fulfillment_id,
            'tracking_number': tracking_number,
            'tracking_company': tracking_company,
            'tracking_url': tracking_url,
            'status': status,
            'shipped_at': shipped_at,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        put_item('commercive_trackings', tracking_record)
        print(f"Created tracking record: {tracking_id}")

        # Update order fulfillment status
        update_item(
            'commercive_orders',
            {'order_id': order_id},
            {
                'fulfillment_status': 'fulfilled',
                'updated_at': datetime.utcnow().isoformat() + 'Z'
            }
        )

        # Log success
        log_webhook(store_id, topic, raw_body, True)

        return success({'message': 'Fulfillment created successfully'})

    except Exception as e:
        error_msg = f"Error processing fulfillment/create: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()

        log_webhook(
            store.get('store_id') if 'store' in locals() else None,
            topic,
            raw_body,
            False,
            error_msg
        )

        return success({'message': 'Received'})


def handle_app_uninstall(
    payload: Dict[str, Any],
    shop_domain: str,
    topic: str,
    raw_body: str
) -> Dict[str, Any]:
    """
    Handle POST /webhooks/app/uninstall
    Sets store is_active=false (keeps data for historical records)
    """
    try:
        print(f"Processing app/uninstall webhook for {shop_domain}")

        # Get store by domain
        store = get_store_by_domain(shop_domain)
        if not store:
            error_msg = f"Store not found for domain: {shop_domain}"
            print(error_msg)
            log_webhook(None, topic, raw_body, False, error_msg)
            return success({'message': 'Received'})

        store_id = store['store_id']

        # Mark store as inactive (don't delete - keep historical data)
        update_item(
            'commercive_stores',
            {'store_id': store_id},
            {
                'is_active': False,
                'updated_at': datetime.utcnow().isoformat() + 'Z'
            }
        )

        print(f"Marked store as inactive: {store_id}")

        # Log success
        log_webhook(store_id, topic, raw_body, True)

        return success({'message': 'App uninstalled successfully'})

    except Exception as e:
        error_msg = f"Error processing app/uninstall: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()

        log_webhook(
            store.get('store_id') if 'store' in locals() else None,
            topic,
            raw_body,
            False,
            error_msg
        )

        return success({'message': 'Received'})
