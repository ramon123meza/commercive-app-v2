#endpoint:https://zpomoosqyuqqi5zcdvg5gqjs6u0sxsoc.lambda-url.us-east-1.on.aws/
"""
commercive_inventory.py
Unified Lambda function for inventory management operations

Endpoints:
1. GET /inventory - List inventory for a store (with filtering)
2. GET /inventory/{id} - Get single inventory item details
3. GET /inventory/restock-analysis - Get restock recommendations
4. POST /inventory/reorder - Create reorder request
"""

import json
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from boto3.dynamodb.conditions import Key, Attr

# Import shared utilities
from utils.auth import require_auth
from utils.dynamodb import get_item, query, put_item, db_client
from utils.response import (
    success, error, bad_request, unauthorized,
    not_found, created, cors_preflight
)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for inventory operations.
    Routes requests to appropriate handlers based on path and method.
    """
    try:
        # Handle CORS preflight
        method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
        if method == 'OPTIONS':
            return cors_preflight()

        # Extract routing info
        path = event.get('rawPath', '') or event.get('path', '')
        path = path.rstrip('/')

        # Route to appropriate handler
        if path == '/inventory' and method == 'GET':
            return list_inventory(event)
        elif path == '/inventory/restock-analysis' and method == 'GET':
            return restock_analysis(event)
        elif path == '/inventory/reorder' and method == 'POST':
            return create_reorder(event)
        elif re.match(r'^/inventory/[a-zA-Z0-9_-]+$', path) and method == 'GET':
            return get_inventory_item(event, path)
        else:
            return not_found(f"Endpoint not found: {method} {path}")

    except Exception as e:
        print(f"Unhandled error in inventory handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def list_inventory(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /inventory - List inventory for a store

    Query params:
    - store_id (required): Store ID
    - page (optional): Page number (default 1)
    - limit (optional): Items per page (default 50, max 100)
    - low_stock (optional): Filter low stock items only (true/false)
    - search (optional): Search by product title or SKU
    """
    try:
        # Authenticate user
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        store_id = query_params.get('store_id')

        if not store_id:
            return bad_request('store_id query parameter is required')

        # Verify user has access to this store
        if not user_has_store_access(user['user_id'], store_id):
            return unauthorized('You do not have access to this store')

        # Pagination
        page = int(query_params.get('page', 1))
        limit = min(int(query_params.get('limit', 50)), 100)

        # Filters
        low_stock_only = query_params.get('low_stock', '').lower() == 'true'
        search_term = query_params.get('search', '').strip().lower()

        # Query inventory by store_id using GSI
        items = query(
            'commercive_inventory',
            index_name='store-inventory-index',
            key_condition=Key('store_id').eq(store_id),
            scan_forward=True  # Sort by quantity ascending
        )

        # Apply filters
        filtered_items = []
        for item in items:
            # Low stock filter
            if low_stock_only:
                quantity = item.get('quantity', 0)
                threshold = item.get('low_stock_threshold', 0)
                if quantity >= threshold:
                    continue

            # Search filter
            if search_term:
                title = (item.get('product_title', '') or '').lower()
                sku = (item.get('sku', '') or '').lower()
                if search_term not in title and search_term not in sku:
                    continue

            filtered_items.append(item)

        # Calculate pagination
        total_items = len(filtered_items)
        total_pages = (total_items + limit - 1) // limit  # Ceiling division
        start_index = (page - 1) * limit
        end_index = start_index + limit

        # Get page slice
        page_items = filtered_items[start_index:end_index]

        # Format inventory items
        inventory_list = []
        for item in page_items:
            quantity = item.get('quantity', 0)
            threshold = item.get('low_stock_threshold', 0)

            inventory_list.append({
                'inventory_id': item.get('inventory_id'),
                'product_title': item.get('product_title'),
                'variant_title': item.get('variant_title'),
                'sku': item.get('sku'),
                'image_url': item.get('image_url'),
                'quantity': quantity,
                'low_stock_threshold': threshold,
                'is_low_stock': quantity < threshold,
                'price': item.get('price'),
                'updated_at': item.get('updated_at')
            })

        return success({
            'inventory': inventory_list,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total_items,
                'pages': total_pages
            }
        })

    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in list_inventory: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def get_inventory_item(event: Dict[str, Any], path: str) -> Dict[str, Any]:
    """
    GET /inventory/{id} - Get single inventory item details
    """
    try:
        # Authenticate user
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Extract inventory_id from path
        inventory_id = path.split('/')[-1]

        # Get inventory item
        item = get_item('commercive_inventory', {'inventory_id': inventory_id})

        if not item:
            return not_found('Inventory item not found')

        # Verify user has access to the store
        store_id = item.get('store_id')
        if not user_has_store_access(user['user_id'], store_id):
            return unauthorized('You do not have access to this inventory item')

        # Calculate restock recommendation
        quantity = item.get('quantity', 0)
        threshold = item.get('low_stock_threshold', 0)
        is_low_stock = quantity < threshold

        # Simple recommendation algorithm
        restock_recommendation = None
        if is_low_stock:
            # Recommend ordering 3x the threshold amount
            recommended_quantity = max(threshold * 3, 10)
            priority = 'high' if quantity == 0 else 'medium' if quantity < threshold / 2 else 'low'

            restock_recommendation = {
                'recommended_quantity': recommended_quantity,
                'priority': priority,
                'reason': 'Below low stock threshold' if quantity > 0 else 'Out of stock'
            }

        # Return full item details
        return success({
            'item': {
                'inventory_id': item.get('inventory_id'),
                'store_id': item.get('store_id'),
                'shopify_product_id': item.get('shopify_product_id'),
                'shopify_variant_id': item.get('shopify_variant_id'),
                'shopify_inventory_item_id': item.get('shopify_inventory_item_id'),
                'product_title': item.get('product_title'),
                'variant_title': item.get('variant_title'),
                'sku': item.get('sku'),
                'barcode': item.get('barcode'),
                'image_url': item.get('image_url'),
                'quantity': quantity,
                'low_stock_threshold': threshold,
                'is_low_stock': is_low_stock,
                'price': item.get('price'),
                'cost': item.get('cost'),
                'location_id': item.get('location_id'),
                'updated_at': item.get('updated_at'),
                'restock_recommendation': restock_recommendation
            }
        })

    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in get_inventory_item: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def restock_analysis(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /inventory/restock-analysis - Get restock recommendations

    Query params:
    - store_id (required): Store ID
    """
    try:
        # Authenticate user
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        store_id = query_params.get('store_id')

        if not store_id:
            return bad_request('store_id query parameter is required')

        # Verify user has access to this store
        if not user_has_store_access(user['user_id'], store_id):
            return unauthorized('You do not have access to this store')

        # Query all inventory for the store
        items = query(
            'commercive_inventory',
            index_name='store-inventory-index',
            key_condition=Key('store_id').eq(store_id)
        )

        # Analyze inventory
        total_products = len(items)
        low_stock_items = []
        out_of_stock_items = []
        recommended_reorders = []

        for item in items:
            quantity = item.get('quantity', 0)
            threshold = item.get('low_stock_threshold', 0)

            # Count out of stock
            if quantity == 0:
                out_of_stock_items.append(item)

            # Count low stock
            if quantity < threshold:
                low_stock_items.append(item)

                # Calculate recommendation
                recommended_quantity = max(threshold * 3, 10)

                # Priority logic
                if quantity == 0:
                    priority = 'high'
                elif quantity < threshold / 2:
                    priority = 'medium'
                else:
                    priority = 'low'

                recommended_reorders.append({
                    'inventory_id': item.get('inventory_id'),
                    'product_title': item.get('product_title'),
                    'variant_title': item.get('variant_title'),
                    'sku': item.get('sku'),
                    'current_quantity': quantity,
                    'low_stock_threshold': threshold,
                    'recommended_quantity': recommended_quantity,
                    'priority': priority,
                    'image_url': item.get('image_url')
                })

        # Sort recommendations by priority (high -> medium -> low) then by quantity
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        recommended_reorders.sort(
            key=lambda x: (priority_order[x['priority']], x['current_quantity'])
        )

        return success({
            'analysis': {
                'total_products': total_products,
                'low_stock_count': len(low_stock_items),
                'out_of_stock_count': len(out_of_stock_items),
                'recommended_reorders': recommended_reorders
            }
        })

    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in restock_analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def create_reorder(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /inventory/reorder - Create reorder request

    Body:
    - inventory_id (required): Inventory item ID
    - quantity (required): Quantity to reorder
    - notes (optional): User notes
    """
    try:
        # Authenticate user
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request('Invalid JSON body')

        # Validate required fields
        inventory_id = body.get('inventory_id')
        quantity = body.get('quantity')
        notes = body.get('notes', '')

        if not inventory_id:
            return bad_request('inventory_id is required')

        if not quantity or not isinstance(quantity, (int, float)) or quantity <= 0:
            return bad_request('quantity must be a positive number')

        # Get inventory item
        item = get_item('commercive_inventory', {'inventory_id': inventory_id})

        if not item:
            return not_found('Inventory item not found')

        # Verify user has access to the store
        store_id = item.get('store_id')
        if not user_has_store_access(user['user_id'], store_id):
            return unauthorized('You do not have access to this inventory item')

        # Create reorder request
        request_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        reorder_request = {
            'request_id': request_id,
            'store_id': store_id,
            'user_id': user['user_id'],
            'inventory_id': inventory_id,
            'product_title': item.get('product_title'),
            'sku': item.get('sku'),
            'quantity': int(quantity),
            'notes': notes,
            'status': 'pending',
            'created_at': now,
            'processed_at': None,
            'processed_by': None
        }

        # Save to DynamoDB
        success_saved = put_item('commercive_reorder_requests', reorder_request)

        if not success_saved:
            return error('Failed to create reorder request', 500)

        return created({
            'request': {
                'request_id': request_id,
                'inventory_id': inventory_id,
                'product_title': item.get('product_title'),
                'sku': item.get('sku'),
                'quantity': int(quantity),
                'status': 'pending',
                'created_at': now
            }
        }, 'Reorder request created successfully')

    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in create_reorder: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


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
        # Check if user is admin
        user = get_item('commercive_users', {'user_id': user_id})
        if user and user.get('role') == 'admin':
            return True

        # Check store_users table for access
        links = query(
            'commercive_store_users',
            index_name='user-stores-index',
            key_condition=Key('user_id').eq(user_id)
        )

        # Check if any link matches the store_id
        for link in links:
            if link.get('store_id') == store_id:
                return True

        return False

    except Exception as e:
        print(f"Error checking store access: {str(e)}")
        return False
