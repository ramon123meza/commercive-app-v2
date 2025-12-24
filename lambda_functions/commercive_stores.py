#endpoint: https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws/
"""
commercive_stores.py - Store operations Lambda function

Handles store management operations:
- GET /stores - List user's connected stores
- GET /stores/{store_id} - Get store details
- POST /stores/{store_id}/disconnect - Disconnect a store
- POST /stores/{store_id}/sync - Force inventory sync

Author: Commercive Platform
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional, List
from boto3.dynamodb.conditions import Key

# Import shared utilities
from utils.auth import require_auth
from utils.dynamodb import get_item, query, update_item
from utils.response import (
    success, error, bad_request, unauthorized,
    forbidden, not_found, server_error, cors_preflight
)
from utils.shopify import fetch_inventory_graphql, transform_shopify_id

# Environment variables
TABLE_PREFIX = os.environ.get('DYNAMODB_TABLE_PREFIX', 'commercive_')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for store operations.
    Routes requests to appropriate handlers based on path and method.

    Args:
        event: Lambda event containing request data
        context: Lambda context object

    Returns:
        HTTP response with CORS headers
    """
    try:
        # Handle CORS preflight
        method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
        if method == 'OPTIONS':
            return cors_preflight()

        # Extract routing info
        path = event.get('rawPath', '') or event.get('path', '')
        path = path.rstrip('/')  # Remove trailing slash

        # Route to appropriate handler
        if path == '/stores' and method == 'GET':
            return handle_list_stores(event)

        # Match /stores/{store_id}
        elif re.match(r'^/stores/[a-zA-Z0-9-]+$', path):
            store_id = path.split('/')[-1]

            if method == 'GET':
                return handle_get_store(event, store_id)
            elif method == 'DELETE':
                return handle_disconnect_store(event, store_id)
            else:
                return error('Method not allowed', 405)

        # Match /stores/{store_id}/disconnect
        elif re.match(r'^/stores/[a-zA-Z0-9-]+/disconnect$', path) and method == 'POST':
            store_id = path.split('/')[-2]
            return handle_disconnect_store(event, store_id)

        # Match /stores/{store_id}/sync
        elif re.match(r'^/stores/[a-zA-Z0-9-]+/sync$', path) and method == 'POST':
            store_id = path.split('/')[-2]
            return handle_sync_inventory(event, store_id)

        else:
            return not_found('Endpoint not found')

    except Exception as e:
        print(f"Unhandled error in stores handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Internal server error')


def handle_list_stores(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /stores - List user's connected stores

    Returns array of stores with connection status, product counts, etc.
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user.get('user_id')

        # Query commercive_store_users to get user's store links
        store_links = query(
            f"{TABLE_PREFIX}store_users",
            index_name='user-stores-index',
            key_condition=Key('user_id').eq(user_id)
        )

        if not store_links:
            return success({'stores': []})

        # Get full store details for each linked store
        stores = []
        for link in store_links:
            store_id = link.get('store_id')

            # Get store data
            store = get_item(
                f"{TABLE_PREFIX}stores",
                {'store_id': store_id}
            )

            if not store:
                continue

            # Count products and orders for this store
            inventory_items = query(
                f"{TABLE_PREFIX}inventory",
                index_name='store-inventory-index',
                key_condition=Key('store_id').eq(store_id)
            )

            orders = query(
                f"{TABLE_PREFIX}orders",
                index_name='store-orders-index',
                key_condition=Key('store_id').eq(store_id),
                limit=1000  # Just for counting
            )

            # Build store response
            stores.append({
                'store_id': store.get('store_id'),
                'shop_domain': store.get('shop_domain'),
                'shop_name': store.get('shop_name'),
                'is_active': store.get('is_active', True),
                'inventory_synced_at': store.get('inventory_synced_at'),
                'webhooks_registered': store.get('webhooks_registered', False),
                'created_at': store.get('created_at'),
                'product_count': len(inventory_items),
                'order_count': len(orders),
                'is_owner': link.get('is_owner', False)
            })

        return success({'stores': stores})

    except Exception as e:
        print(f"Error in handle_list_stores: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to list stores')


def handle_get_store(event: Dict[str, Any], store_id: str) -> Dict[str, Any]:
    """
    GET /stores/{store_id} - Get store details

    Returns detailed store information including stats and sync status.
    Verifies user has access to this store.
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user.get('user_id')

        # Verify user has access to this store
        if not user_has_store_access(user_id, store_id):
            return forbidden('You do not have access to this store')

        # Get store data
        store = get_item(
            f"{TABLE_PREFIX}stores",
            {'store_id': store_id}
        )

        if not store:
            return not_found('Store not found')

        # Calculate stats
        stats = calculate_store_stats(store_id)

        # Build response (sanitize OAuth info)
        store_data = {
            'store_id': store.get('store_id'),
            'shop_domain': store.get('shop_domain'),
            'shop_name': store.get('shop_name'),
            'is_active': store.get('is_active', True),
            'inventory_synced_at': store.get('inventory_synced_at'),
            'webhooks_registered': store.get('webhooks_registered', False),
            'created_at': store.get('created_at'),
            'updated_at': store.get('updated_at'),
            'scopes': store.get('scopes'),  # Show granted scopes
            'stats': stats
        }

        # Note: Do NOT return access_token in response

        return success({'store': store_data})

    except Exception as e:
        print(f"Error in handle_get_store: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to get store details')


def handle_disconnect_store(event: Dict[str, Any], store_id: str) -> Dict[str, Any]:
    """
    POST /stores/{store_id}/disconnect or DELETE /stores/{store_id}

    Disconnects a store by setting is_active=false.
    Keeps historical data for records.
    Only the store owner can disconnect.
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user.get('user_id')

        # Verify user is the owner of this store
        if not user_is_store_owner(user_id, store_id):
            return forbidden('Only the store owner can disconnect this store')

        # Get store data
        store = get_item(
            f"{TABLE_PREFIX}stores",
            {'store_id': store_id}
        )

        if not store:
            return not_found('Store not found')

        # Update store to inactive
        success_flag = update_item(
            f"{TABLE_PREFIX}stores",
            {'store_id': store_id},
            {
                'is_active': False,
                'updated_at': datetime.utcnow().isoformat()
            }
        )

        if not success_flag:
            return server_error('Failed to disconnect store')

        return success({
            'message': 'Store disconnected successfully',
            'store_id': store_id
        })

    except Exception as e:
        print(f"Error in handle_disconnect_store: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to disconnect store')


def handle_sync_inventory(event: Dict[str, Any], store_id: str) -> Dict[str, Any]:
    """
    POST /stores/{store_id}/sync - Force inventory sync from Shopify

    Fetches inventory data from Shopify GraphQL API and updates DynamoDB.
    Updates inventory_synced_at timestamp.
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user.get('user_id')

        # Verify user has access to this store
        if not user_has_store_access(user_id, store_id):
            return forbidden('You do not have access to this store')

        # Get store data (need access token)
        store = get_item(
            f"{TABLE_PREFIX}stores",
            {'store_id': store_id}
        )

        if not store:
            return not_found('Store not found')

        if not store.get('is_active', True):
            return bad_request('Store is disconnected')

        # Get Shopify credentials
        shop_domain = store.get('shop_domain')
        access_token = store.get('access_token')

        if not shop_domain or not access_token:
            return server_error('Store credentials missing')

        # Fetch inventory from Shopify using GraphQL
        products_synced = 0
        cursor = None
        has_next_page = True

        from utils.dynamodb import put_item

        while has_next_page:
            # Fetch page of inventory
            result = fetch_inventory_graphql(shop_domain, access_token, cursor, limit=50)

            if not result or 'products' not in result:
                print(f"Failed to fetch inventory page (cursor: {cursor})")
                break

            products_data = result['products']
            page_info = products_data.get('pageInfo', {})
            has_next_page = page_info.get('hasNextPage', False)
            cursor = page_info.get('endCursor')

            # Process each product
            for product_edge in products_data.get('edges', []):
                product = product_edge.get('node', {})
                product_id = transform_shopify_id(product.get('id', ''))
                product_title = product.get('title', '')

                # Process each variant
                for variant_edge in product.get('variants', {}).get('edges', []):
                    variant = variant_edge.get('node', {})
                    variant_id = transform_shopify_id(variant.get('id', ''))
                    variant_title = variant.get('title', '')

                    inventory_item = variant.get('inventoryItem', {})
                    inventory_item_id = transform_shopify_id(inventory_item.get('id', ''))

                    # Get inventory levels
                    inventory_levels = inventory_item.get('inventoryLevels', {}).get('edges', [])

                    for level_edge in inventory_levels:
                        level = level_edge.get('node', {})
                        location = level.get('location', {})
                        location_id = transform_shopify_id(location.get('id', ''))

                        # Get variant image
                        image_url = None
                        if variant.get('image'):
                            image_url = variant['image'].get('url')

                        # Create inventory record
                        import uuid
                        inventory_record = {
                            'inventory_id': str(uuid.uuid4()),
                            'store_id': store_id,
                            'shopify_product_id': product_id,
                            'shopify_variant_id': variant_id,
                            'shopify_inventory_item_id': inventory_item_id,
                            'product_title': product_title,
                            'variant_title': variant_title,
                            'sku': variant.get('sku', ''),
                            'barcode': variant.get('barcode', ''),
                            'image_url': image_url,
                            'quantity': level.get('available', 0),
                            'low_stock_threshold': 10,  # Default threshold
                            'price': variant.get('price', '0.00'),
                            'cost': '0.00',  # Not available in basic query
                            'location_id': location_id,
                            'updated_at': datetime.utcnow().isoformat()
                        }

                        # Save to DynamoDB
                        put_item(f"{TABLE_PREFIX}inventory", inventory_record)
                        products_synced += 1

        # Update store's last sync timestamp
        update_item(
            f"{TABLE_PREFIX}stores",
            {'store_id': store_id},
            {
                'inventory_synced_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
        )

        return success({
            'message': 'Inventory sync completed',
            'products_synced': products_synced,
            'synced_at': datetime.utcnow().isoformat()
        })

    except Exception as e:
        print(f"Error in handle_sync_inventory: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to sync inventory')


# Helper functions

def user_has_store_access(user_id: str, store_id: str) -> bool:
    """
    Check if user has access to a store

    Args:
        user_id: User ID
        store_id: Store ID

    Returns:
        True if user has access, False otherwise
    """
    try:
        # Query store_users link table
        links = query(
            f"{TABLE_PREFIX}store_users",
            index_name='user-stores-index',
            key_condition=Key('user_id').eq(user_id)
        )

        # Check if any link matches this store
        for link in links:
            if link.get('store_id') == store_id:
                return True

        return False

    except Exception as e:
        print(f"Error checking store access: {str(e)}")
        return False


def user_is_store_owner(user_id: str, store_id: str) -> bool:
    """
    Check if user is the owner of a store

    Args:
        user_id: User ID
        store_id: Store ID

    Returns:
        True if user is owner, False otherwise
    """
    try:
        # Query store_users link table
        links = query(
            f"{TABLE_PREFIX}store_users",
            index_name='user-stores-index',
            key_condition=Key('user_id').eq(user_id)
        )

        # Check if any link matches this store AND is_owner is True
        for link in links:
            if link.get('store_id') == store_id and link.get('is_owner', False):
                return True

        return False

    except Exception as e:
        print(f"Error checking store ownership: {str(e)}")
        return False


def calculate_store_stats(store_id: str) -> Dict[str, Any]:
    """
    Calculate statistics for a store

    Args:
        store_id: Store ID

    Returns:
        Dict with store statistics
    """
    try:
        # Count total products
        inventory_items = query(
            f"{TABLE_PREFIX}inventory",
            index_name='store-inventory-index',
            key_condition=Key('store_id').eq(store_id)
        )

        total_products = len(inventory_items)

        # Count low stock products (quantity < low_stock_threshold)
        low_stock_products = sum(
            1 for item in inventory_items
            if item.get('quantity', 0) < item.get('low_stock_threshold', 10)
        )

        # Count total orders
        orders = query(
            f"{TABLE_PREFIX}orders",
            index_name='store-orders-index',
            key_condition=Key('store_id').eq(store_id)
        )

        total_orders = len(orders)

        # Count pending orders (unfulfilled or partially fulfilled)
        pending_orders = sum(
            1 for order in orders
            if order.get('fulfillment_status') in ['unfulfilled', 'partial', None]
        )

        return {
            'total_products': total_products,
            'low_stock_products': low_stock_products,
            'total_orders': total_orders,
            'pending_orders': pending_orders
        }

    except Exception as e:
        print(f"Error calculating store stats: {str(e)}")
        return {
            'total_products': 0,
            'low_stock_products': 0,
            'total_orders': 0,
            'pending_orders': 0
        }
