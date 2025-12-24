#endpoint: https://yc3j2t47wqsbgpjclgdi76a6pi0lhzfg.lambda-url.us-east-1.on.aws/
"""
Lambda function for order management operations
Handles 3 endpoints:
  - GET /orders - List orders for a store
  - GET /orders/{id} - Get order details with line items
  - GET /orders/{id}/tracking - Get tracking information
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional, List
from boto3.dynamodb.conditions import Key, Attr

# Import shared utilities
from utils.auth import require_auth
from utils.dynamodb import get_item, query
from utils.response import (
    success, error, bad_request, unauthorized,
    not_found, server_error, cors_preflight
)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for order operations.
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
        if path == '/orders' and method == 'GET':
            return handle_list_orders(event)

        # Match /orders/{order_id}
        order_detail_match = re.match(r'^/orders/([\w-]+)$', path)
        if order_detail_match and method == 'GET':
            order_id = order_detail_match.group(1)
            return handle_get_order(event, order_id)

        # Match /orders/{order_id}/tracking
        tracking_match = re.match(r'^/orders/([\w-]+)/tracking$', path)
        if tracking_match and method == 'GET':
            order_id = tracking_match.group(1)
            return handle_get_tracking(event, order_id)

        return not_found('Endpoint not found')

    except Exception as e:
        print(f"Unhandled error in orders handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Internal server error')


def handle_list_orders(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /orders
    List orders for a store with pagination and filtering
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        store_id = query_params.get('store_id')

        if not store_id:
            return bad_request('store_id query parameter is required')

        # Verify user has access to this store
        if not has_store_access(user['user_id'], store_id):
            return unauthorized('You do not have access to this store')

        # Get pagination parameters
        page = int(query_params.get('page', '1'))
        limit = int(query_params.get('limit', '50'))
        status_filter = query_params.get('status')  # fulfillment_status filter
        date_from = query_params.get('date_from')
        date_to = query_params.get('date_to')

        # Query orders by store_id using GSI
        query_params_db = {
            'index_name': 'store-orders-index',
            'key_condition': Key('store_id').eq(store_id),
            'scan_forward': False  # Most recent first
        }

        # Add filter expression if status is provided
        filter_expressions = []
        if status_filter:
            filter_expressions.append(Attr('fulfillment_status').eq(status_filter))
        if date_from:
            filter_expressions.append(Attr('created_at').gte(date_from))
        if date_to:
            filter_expressions.append(Attr('created_at').lte(date_to))

        if filter_expressions:
            filter_expr = filter_expressions[0]
            for expr in filter_expressions[1:]:
                filter_expr = filter_expr & expr
            query_params_db['filter_expression'] = filter_expr

        # Query all matching orders
        all_orders = query('commercive_orders', **query_params_db)

        # Calculate pagination
        total = len(all_orders)
        total_pages = (total + limit - 1) // limit if total > 0 else 0
        start = (page - 1) * limit
        end = start + limit

        # Get page of orders
        orders_page = all_orders[start:end]

        # Format orders for response
        formatted_orders = []
        for order in orders_page:
            formatted_orders.append({
                'order_id': order.get('order_id'),
                'order_number': order.get('order_number'),
                'customer_name': order.get('customer_name'),
                'customer_email': order.get('customer_email'),
                'total_price': order.get('total_price'),
                'currency': order.get('currency'),
                'financial_status': order.get('financial_status'),
                'fulfillment_status': order.get('fulfillment_status'),
                'line_items_count': order.get('line_items_count', 0),
                'created_at': order.get('created_at'),
                'updated_at': order.get('updated_at')
            })

        return success({
            'orders': formatted_orders,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': total_pages
            }
        })

    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in handle_list_orders: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to list orders')


def handle_get_order(event: Dict[str, Any], order_id: str) -> Dict[str, Any]:
    """
    Handle GET /orders/{order_id}
    Get order details with line items
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get order from database
        order = get_item('commercive_orders', {'order_id': order_id})

        if not order:
            return not_found('Order not found')

        # Verify user has access to this order's store
        if not has_store_access(user['user_id'], order['store_id']):
            return unauthorized('You do not have access to this order')

        # Get line items for this order
        line_items = query(
            'commercive_order_items',
            index_name='order-items-index',
            key_condition=Key('order_id').eq(order_id)
        )

        # Format line items
        formatted_items = []
        for item in line_items:
            formatted_items.append({
                'item_id': item.get('item_id'),
                'product_title': item.get('product_title'),
                'variant_title': item.get('variant_title'),
                'sku': item.get('sku'),
                'quantity': item.get('quantity'),
                'price': item.get('price'),
                'total': item.get('total')
            })

        # Get tracking info if available
        tracking_info = None
        trackings = query(
            'commercive_trackings',
            index_name='order-tracking-index',
            key_condition=Key('order_id').eq(order_id),
            limit=1
        )

        if trackings:
            tracking = trackings[0]
            tracking_info = {
                'tracking_number': tracking.get('tracking_number'),
                'tracking_company': tracking.get('tracking_company'),
                'tracking_url': tracking.get('tracking_url'),
                'status': tracking.get('status'),
                'shipped_at': tracking.get('shipped_at')
            }

        # Build complete order response
        order_response = {
            'order_id': order.get('order_id'),
            'order_number': order.get('order_number'),
            'shopify_order_id': order.get('shopify_order_id'),
            'customer_name': order.get('customer_name'),
            'customer_email': order.get('customer_email'),
            'total_price': order.get('total_price'),
            'currency': order.get('currency'),
            'financial_status': order.get('financial_status'),
            'fulfillment_status': order.get('fulfillment_status'),
            'line_items_count': order.get('line_items_count', 0),
            'created_at': order.get('created_at'),
            'updated_at': order.get('updated_at'),
            'line_items': formatted_items,
            'tracking': tracking_info
        }

        return success({'order': order_response})

    except Exception as e:
        print(f"Error in handle_get_order: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to get order details')


def handle_get_tracking(event: Dict[str, Any], order_id: str) -> Dict[str, Any]:
    """
    Handle GET /orders/{order_id}/tracking
    Get tracking information for an order
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get order to verify access
        order = get_item('commercive_orders', {'order_id': order_id})

        if not order:
            return not_found('Order not found')

        # Verify user has access to this order's store
        if not has_store_access(user['user_id'], order['store_id']):
            return unauthorized('You do not have access to this order')

        # Get all tracking records for this order
        trackings = query(
            'commercive_trackings',
            index_name='order-tracking-index',
            key_condition=Key('order_id').eq(order_id),
            scan_forward=False  # Most recent first
        )

        if not trackings:
            return success({
                'tracking': None,
                'message': 'No tracking information available for this order'
            })

        # Format tracking info (usually just one, but could be multiple shipments)
        formatted_trackings = []
        for tracking in trackings:
            formatted_trackings.append({
                'tracking_id': tracking.get('tracking_id'),
                'tracking_number': tracking.get('tracking_number'),
                'tracking_company': tracking.get('tracking_company'),
                'tracking_url': tracking.get('tracking_url'),
                'status': tracking.get('status'),
                'shipped_at': tracking.get('shipped_at'),
                'created_at': tracking.get('created_at')
            })

        # Return the most recent tracking as main, with all trackings in array
        return success({
            'tracking': formatted_trackings[0] if formatted_trackings else None,
            'all_trackings': formatted_trackings,
            'order': {
                'order_id': order.get('order_id'),
                'order_number': order.get('order_number'),
                'fulfillment_status': order.get('fulfillment_status')
            }
        })

    except Exception as e:
        print(f"Error in handle_get_tracking: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to get tracking information')


def has_store_access(user_id: str, store_id: str) -> bool:
    """
    Check if user has access to a specific store

    Args:
        user_id: User ID to check
        store_id: Store ID to check access for

    Returns:
        True if user has access, False otherwise
    """
    try:
        # Query store_users table to check if user is linked to this store
        store_users = query(
            'commercive_store_users',
            index_name='user-stores-index',
            key_condition=Key('user_id').eq(user_id)
        )

        # Check if any of the user's stores match the requested store_id
        for link in store_users:
            if link.get('store_id') == store_id:
                return True

        return False

    except Exception as e:
        print(f"Error checking store access: {str(e)}")
        return False
