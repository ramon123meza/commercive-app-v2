#endpoint: https://oyerbhhyxxomzgowei6ysfnjg40amtmr.lambda-url.us-east-1.on.aws/
"""
Commercive Admin Lambda Function
Handles all administrative operations (requires admin role)

15 Endpoints:
1. GET /admin/users - List all users
2. POST /admin/users/{id}/approve - Approve pending signup
3. POST /admin/users/{id}/reject - Reject pending signup
4. PUT /admin/users/{id}/permissions - Update user permissions
5. GET /admin/pending-signups - List pending signups
6. GET /admin/stores - List all stores
7. GET /admin/stores/{id}/inventory - Get store inventory
8. GET /admin/leads - List all leads
9. POST /admin/payouts/{id}/process - Process affiliate payout
10. GET /admin/payouts - List all payouts
11. POST /admin/affiliates/import - Import affiliates from CSV
12. POST /admin/affiliates/link - Link affiliate to user
13. POST /admin/invite - Invite new admin
14. GET /admin/dashboard - Dashboard statistics
15. POST /admin/support/{id}/message - Send message to ticket
"""

import json
import re
import csv
import io
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from uuid import uuid4

from utils.auth import require_admin, generate_reset_token, hash_password
from utils.dynamodb import get_item, put_item, update_item, delete_item, query, db_client
from utils.response import (
    success, error, bad_request, not_found, server_error,
    created, forbidden, cors_preflight
)
from utils.email import (
    send_welcome_email, send_admin_invitation_email, send_email
)
from boto3.dynamodb.conditions import Key, Attr


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for admin operations.
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

        print(f"Admin Lambda - Method: {method}, Path: {path}")

        # Route to appropriate handler
        # User management endpoints
        if path == '/admin/users' and method == 'GET':
            return list_users(event)
        elif re.match(r'^/admin/users/[\w-]+/approve$', path) and method == 'POST':
            user_id = path.split('/')[-2]
            return approve_user(event, user_id)
        elif re.match(r'^/admin/users/[\w-]+/reject$', path) and method == 'POST':
            user_id = path.split('/')[-2]
            return reject_user(event, user_id)
        elif re.match(r'^/admin/users/[\w-]+/permissions$', path) and method == 'PUT':
            user_id = path.split('/')[-2]
            return update_permissions(event, user_id)
        elif path == '/admin/pending-signups' and method == 'GET':
            return list_pending_signups(event)

        # Store management endpoints
        elif path == '/admin/stores' and method == 'GET':
            return list_all_stores(event)
        elif re.match(r'^/admin/stores/[\w-]+/inventory$', path) and method == 'GET':
            store_id = path.split('/')[-2]
            return get_store_inventory(event, store_id)

        # Lead management endpoints
        elif path == '/admin/leads' and method == 'GET':
            return list_all_leads(event)

        # Payout management endpoints
        elif path == '/admin/payouts' and method == 'GET':
            return list_all_payouts(event)
        elif re.match(r'^/admin/payouts/[\w-]+/process$', path) and method == 'POST':
            payout_id = path.split('/')[-2]
            return process_payout(event, payout_id)

        # Affiliate management endpoints
        elif path == '/admin/affiliates/import' and method == 'POST':
            return import_affiliates_csv(event)
        elif path == '/admin/affiliates/link' and method == 'POST':
            return link_affiliate_to_user(event)

        # Admin invitation
        elif path == '/admin/invite' and method == 'POST':
            return invite_admin(event)

        # Dashboard stats
        elif path == '/admin/dashboard' and method == 'GET':
            return get_dashboard_stats(event)

        # Support ticket message
        elif re.match(r'^/admin/support/[\w-]+/message$', path) and method == 'POST':
            ticket_id = path.split('/')[-2]
            return send_support_message(event, ticket_id)

        else:
            return not_found("Endpoint not found")

    except Exception as e:
        print(f"Unhandled error in admin Lambda: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Internal server error")


# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

def list_users(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /admin/users
    List all users with filtering and pagination
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse query parameters
        params = event.get('queryStringParameters') or {}
        status_filter = params.get('status')  # 'active', 'pending', 'inactive'
        role_filter = params.get('role')  # 'user', 'admin'
        search_query = params.get('search')  # Search by name or email
        page = int(params.get('page', 1))
        limit = int(params.get('limit', 50))

        # Query users
        if status_filter:
            # Query by status index
            users = query(
                'commercive_users',
                index_name='status-index',
                key_condition=Key('status').eq(status_filter),
                scan_forward=False
            )
        elif role_filter:
            # Query by role index
            users = query(
                'commercive_users',
                index_name='role-index',
                key_condition=Key('role').eq(role_filter),
                scan_forward=False
            )
        else:
            # Scan all users (not ideal for large datasets)
            users = db_client.scan('commercive_users', limit=1000)

        # Filter by search query if provided
        if search_query:
            search_lower = search_query.lower()
            users = [
                u for u in users
                if search_lower in u.get('email', '').lower() or
                   search_lower in u.get('first_name', '').lower() or
                   search_lower in u.get('last_name', '').lower()
            ]

        # Get store counts for each user
        for user in users:
            user_id = user.get('user_id')
            # Query store_users to get store count
            store_links = query(
                'commercive_store_users',
                index_name='user-stores-index',
                key_condition=Key('user_id').eq(user_id)
            )
            user['stores_count'] = len(store_links)

            # Remove sensitive data
            user.pop('password_hash', None)

        # Sort by created_at (newest first)
        users.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        # Pagination
        total = len(users)
        start = (page - 1) * limit
        end = start + limit
        paginated_users = users[start:end]

        return success({
            'users': paginated_users,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })

    except Exception as e:
        print(f"Error listing users: {str(e)}")
        return server_error("Failed to list users")


def approve_user(event: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """
    POST /admin/users/{id}/approve
    Approve pending user signup
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        is_affiliate = body.get('is_affiliate', False)
        is_store_owner = body.get('is_store_owner', False)
        visible_pages = body.get('visible_pages', [])

        # Get user
        user = get_item('commercive_users', {'user_id': user_id})
        if not user:
            return not_found("User not found")

        if user.get('status') != 'pending':
            return bad_request("User is not pending approval")

        # Update user status
        now = datetime.utcnow().isoformat()
        updates = {
            'status': 'active',
            'is_approved': True,
            'is_affiliate': is_affiliate,
            'is_store_owner': is_store_owner,
            'visible_pages': visible_pages,
            'updated_at': now
        }

        success_update = update_item('commercive_users', {'user_id': user_id}, updates)
        if not success_update:
            return server_error("Failed to update user")

        # If approved as affiliate, create affiliate record
        if is_affiliate:
            affiliate_data = {
                'affiliate_id': str(uuid4()),
                'user_id': user_id,
                'name': f"{user.get('first_name', '')} {user.get('last_name', '')}",
                'email': user.get('email'),
                'phone': user.get('phone', ''),
                'status': 'active',
                'commission_rate': 10,  # Default 10%
                'total_leads': 0,
                'total_conversions': 0,
                'total_earned': 0,
                'total_paid': 0,
                'payment_method': user.get('payment_method', 'paypal'),
                'payment_email': user.get('payment_email', user.get('email')),
                'is_linked_to_user': True,
                'imported_from_csv': False,
                'created_at': now,
                'updated_at': now
            }
            put_item('commercive_affiliates', affiliate_data)

        # Send welcome email
        send_welcome_email(
            user.get('email'),
            user.get('first_name', 'User')
        )

        return success({'message': 'User approved successfully'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error approving user: {str(e)}")
        return server_error("Failed to approve user")


def reject_user(event: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """
    POST /admin/users/{id}/reject
    Reject pending user signup (delete user record)
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body (optional rejection message)
        body = json.loads(event.get('body', '{}'))
        rejection_message = body.get('message', '')

        # Get user
        user = get_item('commercive_users', {'user_id': user_id})
        if not user:
            return not_found("User not found")

        if user.get('status') != 'pending':
            return bad_request("User is not pending approval")

        # Optionally send rejection email
        if rejection_message:
            send_email(
                user.get('email'),
                "Commercive Account Application",
                f"""
                <p>Hi {user.get('first_name', 'User')},</p>
                <p>Thank you for your interest in Commercive.</p>
                <p>{rejection_message}</p>
                <p>If you have any questions, please contact our support team.</p>
                """
            )

        # Delete user record
        delete_item('commercive_users', {'user_id': user_id})

        return success({'message': 'User rejected and deleted'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error rejecting user: {str(e)}")
        return server_error("Failed to reject user")


def update_permissions(event: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """
    PUT /admin/users/{id}/permissions
    Update user permissions
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))

        # Get user
        user = get_item('commercive_users', {'user_id': user_id})
        if not user:
            return not_found("User not found")

        # Build updates
        updates = {}

        if 'is_affiliate' in body:
            updates['is_affiliate'] = body['is_affiliate']
        if 'is_store_owner' in body:
            updates['is_store_owner'] = body['is_store_owner']
        if 'visible_pages' in body:
            updates['visible_pages'] = body['visible_pages']
        if 'visible_stores' in body:
            updates['visible_stores'] = body.get('visible_stores', [])

        updates['updated_at'] = datetime.utcnow().isoformat()

        # Update user
        success_update = update_item('commercive_users', {'user_id': user_id}, updates)
        if not success_update:
            return server_error("Failed to update permissions")

        return success({'message': 'Permissions updated successfully'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error updating permissions: {str(e)}")
        return server_error("Failed to update permissions")


def list_pending_signups(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /admin/pending-signups
    List all pending signups
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Query pending users
        pending_users = query(
            'commercive_users',
            index_name='status-index',
            key_condition=Key('status').eq('pending'),
            scan_forward=False
        )

        # Remove sensitive data
        for user in pending_users:
            user.pop('password_hash', None)

        return success({'pending': pending_users})

    except Exception as e:
        print(f"Error listing pending signups: {str(e)}")
        return server_error("Failed to list pending signups")


# ============================================================================
# STORE MANAGEMENT ENDPOINTS
# ============================================================================

def list_all_stores(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /admin/stores
    List all connected stores
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Scan all stores
        stores = db_client.scan('commercive_stores', limit=1000)

        # Enrich with owner info and stats
        for store in stores:
            store_id = store.get('store_id')

            # Get store owners
            store_users = query(
                'commercive_store_users',
                index_name='store-users-index',
                key_condition=Key('store_id').eq(store_id)
            )

            owners = []
            for link in store_users:
                if link.get('is_owner'):
                    user = get_item('commercive_users', {'user_id': link.get('user_id')})
                    if user:
                        owners.append({
                            'name': f"{user.get('first_name', '')} {user.get('last_name', '')}",
                            'email': user.get('email')
                        })

            store['owners'] = owners
            store['owner_name'] = owners[0]['name'] if owners else 'Unknown'
            store['owner_email'] = owners[0]['email'] if owners else 'Unknown'

            # Get product count
            inventory = query(
                'commercive_inventory',
                index_name='store-inventory-index',
                key_condition=Key('store_id').eq(store_id)
            )
            store['product_count'] = len(inventory)

            # Count low stock items
            low_stock = [i for i in inventory if i.get('quantity', 0) <= i.get('low_stock_threshold', 10)]
            store['low_stock_count'] = len(low_stock)

            # Remove access token
            store.pop('access_token', None)

        # Sort by created_at
        stores.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return success({'stores': stores})

    except Exception as e:
        print(f"Error listing stores: {str(e)}")
        return server_error("Failed to list stores")


def get_store_inventory(event: Dict[str, Any], store_id: str) -> Dict[str, Any]:
    """
    GET /admin/stores/{id}/inventory
    Get any store's inventory
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse query parameters
        params = event.get('queryStringParameters') or {}
        page = int(params.get('page', 1))
        limit = int(params.get('limit', 50))
        low_stock_only = params.get('low_stock') == 'true'
        search_query = params.get('search')

        # Verify store exists
        store = get_item('commercive_stores', {'store_id': store_id})
        if not store:
            return not_found("Store not found")

        # Query inventory
        inventory = query(
            'commercive_inventory',
            index_name='store-inventory-index',
            key_condition=Key('store_id').eq(store_id)
        )

        # Filter by low stock
        if low_stock_only:
            inventory = [
                i for i in inventory
                if i.get('quantity', 0) <= i.get('low_stock_threshold', 10)
            ]

        # Filter by search query
        if search_query:
            search_lower = search_query.lower()
            inventory = [
                i for i in inventory
                if search_lower in i.get('product_title', '').lower() or
                   search_lower in i.get('sku', '').lower()
            ]

        # Add low stock flag
        for item in inventory:
            item['is_low_stock'] = item.get('quantity', 0) <= item.get('low_stock_threshold', 10)

        # Pagination
        total = len(inventory)
        start = (page - 1) * limit
        end = start + limit
        paginated_inventory = inventory[start:end]

        return success({
            'inventory': paginated_inventory,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })

    except Exception as e:
        print(f"Error getting store inventory: {str(e)}")
        return server_error("Failed to get store inventory")


# ============================================================================
# LEAD MANAGEMENT ENDPOINTS
# ============================================================================

def list_all_leads(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /admin/leads
    List all leads from all affiliates
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse query parameters
        params = event.get('queryStringParameters') or {}
        affiliate_id = params.get('affiliate_id')
        status_filter = params.get('status')  # 'new', 'contacted', 'converted', 'lost'
        page = int(params.get('page', 1))
        limit = int(params.get('limit', 50))

        # Query leads
        if affiliate_id:
            leads = query(
                'commercive_leads',
                index_name='affiliate-leads-index',
                key_condition=Key('affiliate_id').eq(affiliate_id),
                scan_forward=False
            )
        elif status_filter:
            leads = query(
                'commercive_leads',
                index_name='status-index',
                key_condition=Key('status').eq(status_filter),
                scan_forward=False
            )
        else:
            leads = db_client.scan('commercive_leads', limit=1000)

        # Enrich with affiliate info
        for lead in leads:
            aff_id = lead.get('affiliate_id')
            if aff_id:
                affiliate = get_item('commercive_affiliates', {'affiliate_id': aff_id})
                if affiliate:
                    lead['affiliate'] = {
                        'affiliate_id': aff_id,
                        'name': affiliate.get('name'),
                        'email': affiliate.get('email')
                    }

        # Sort by created_at
        leads.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        # Pagination
        total = len(leads)
        start = (page - 1) * limit
        end = start + limit
        paginated_leads = leads[start:end]

        return success({
            'leads': paginated_leads,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })

    except Exception as e:
        print(f"Error listing leads: {str(e)}")
        return server_error("Failed to list leads")


# ============================================================================
# PAYOUT MANAGEMENT ENDPOINTS
# ============================================================================

def list_all_payouts(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /admin/payouts
    List all payouts from all affiliates
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse query parameters
        params = event.get('queryStringParameters') or {}
        status_filter = params.get('status')  # 'pending', 'processing', 'completed', 'failed'
        affiliate_id = params.get('affiliate_id')
        page = int(params.get('page', 1))
        limit = int(params.get('limit', 50))

        # Query payouts
        if status_filter:
            payouts = query(
                'commercive_payouts',
                index_name='status-index',
                key_condition=Key('status').eq(status_filter),
                scan_forward=False
            )
        elif affiliate_id:
            payouts = query(
                'commercive_payouts',
                index_name='affiliate-payouts-index',
                key_condition=Key('affiliate_id').eq(affiliate_id),
                scan_forward=False
            )
        else:
            payouts = db_client.scan('commercive_payouts', limit=1000)

        # Enrich with affiliate info
        for payout in payouts:
            aff_id = payout.get('affiliate_id')
            if aff_id:
                affiliate = get_item('commercive_affiliates', {'affiliate_id': aff_id})
                if affiliate:
                    payout['affiliate'] = {
                        'affiliate_id': aff_id,
                        'name': affiliate.get('name'),
                        'email': affiliate.get('email')
                    }

        # Sort by requested_at
        payouts.sort(key=lambda x: x.get('requested_at', ''), reverse=True)

        # Pagination
        total = len(payouts)
        start = (page - 1) * limit
        end = start + limit
        paginated_payouts = payouts[start:end]

        return success({
            'payouts': paginated_payouts,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })

    except Exception as e:
        print(f"Error listing payouts: {str(e)}")
        return server_error("Failed to list payouts")


def process_payout(event: Dict[str, Any], payout_id: str) -> Dict[str, Any]:
    """
    POST /admin/payouts/{id}/process
    Process affiliate payout
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        transaction_id = body.get('transaction_id', '')
        notes = body.get('notes', '')

        # Get payout
        payout = get_item('commercive_payouts', {'payout_id': payout_id})
        if not payout:
            return not_found("Payout not found")

        if payout.get('status') not in ['pending', 'processing']:
            return bad_request("Payout has already been processed")

        # Update payout
        now = datetime.utcnow().isoformat()
        updates = {
            'status': 'completed',
            'transaction_id': transaction_id,
            'notes': notes,
            'processed_at': now,
            'processed_by': admin.get('user_id')
        }

        success_update = update_item('commercive_payouts', {'payout_id': payout_id}, updates)
        if not success_update:
            return server_error("Failed to update payout")

        # Update affiliate total_paid
        affiliate_id = payout.get('affiliate_id')
        affiliate = get_item('commercive_affiliates', {'affiliate_id': affiliate_id})
        if affiliate:
            new_total_paid = affiliate.get('total_paid', 0) + payout.get('amount', 0)
            update_item(
                'commercive_affiliates',
                {'affiliate_id': affiliate_id},
                {'total_paid': new_total_paid}
            )

        # Update commissions status to 'paid'
        commissions = query(
            'commercive_commissions',
            index_name='payout-index',
            key_condition=Key('payout_id').eq(payout_id)
        )
        for commission in commissions:
            update_item(
                'commercive_commissions',
                {'commission_id': commission.get('commission_id')},
                {'status': 'paid'}
            )

        return success({'message': 'Payout processed successfully'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error processing payout: {str(e)}")
        return server_error("Failed to process payout")


# ============================================================================
# AFFILIATE MANAGEMENT ENDPOINTS
# ============================================================================

def import_affiliates_csv(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /admin/affiliates/import
    Import affiliates from CSV file
    CSV format: name,email,phone,commission_rate
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse multipart form data (simplified - in production use a proper parser)
        body = event.get('body', '')
        is_base64 = event.get('isBase64Encoded', False)

        if is_base64:
            body = base64.b64decode(body).decode('utf-8')

        # Extract CSV data (this is a simplified approach)
        # In production, use a proper multipart parser
        csv_data = body

        # Parse CSV
        csv_file = io.StringIO(csv_data)
        reader = csv.DictReader(csv_file)

        imported = 0
        skipped = 0
        errors = []

        now = datetime.utcnow().isoformat()

        for row_num, row in enumerate(reader, start=2):
            try:
                name = row.get('name', '').strip()
                email = row.get('email', '').strip()
                phone = row.get('phone', '').strip()
                commission_rate = float(row.get('commission_rate', 10))

                # Validate
                if not name or not email:
                    errors.append(f"Row {row_num}: Name and email are required")
                    skipped += 1
                    continue

                # Check if email already exists
                existing = query(
                    'commercive_affiliates',
                    index_name='email-affiliate-index',
                    key_condition=Key('email').eq(email)
                )

                if existing:
                    errors.append(f"Row {row_num}: Email {email} already exists")
                    skipped += 1
                    continue

                # Create affiliate
                affiliate_data = {
                    'affiliate_id': str(uuid4()),
                    'user_id': None,
                    'name': name,
                    'email': email,
                    'phone': phone,
                    'status': 'active',
                    'commission_rate': commission_rate,
                    'total_leads': 0,
                    'total_conversions': 0,
                    'total_earned': 0,
                    'total_paid': 0,
                    'payment_method': 'paypal',
                    'payment_email': email,
                    'is_linked_to_user': False,
                    'imported_from_csv': True,
                    'created_at': now,
                    'updated_at': now
                }

                put_item('commercive_affiliates', affiliate_data)
                imported += 1

            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
                skipped += 1

        return success({
            'imported': imported,
            'skipped': skipped,
            'errors': errors
        })

    except Exception as e:
        print(f"Error importing affiliates: {str(e)}")
        return server_error("Failed to import affiliates")


def link_affiliate_to_user(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /admin/affiliates/link
    Link existing affiliate to user account
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        affiliate_id = body.get('affiliate_id')
        user_id = body.get('user_id')

        if not affiliate_id or not user_id:
            return bad_request("affiliate_id and user_id are required")

        # Verify affiliate exists
        affiliate = get_item('commercive_affiliates', {'affiliate_id': affiliate_id})
        if not affiliate:
            return not_found("Affiliate not found")

        # Verify user exists
        user = get_item('commercive_users', {'user_id': user_id})
        if not user:
            return not_found("User not found")

        # Link affiliate to user
        updates = {
            'user_id': user_id,
            'is_linked_to_user': True,
            'updated_at': datetime.utcnow().isoformat()
        }

        success_update = update_item('commercive_affiliates', {'affiliate_id': affiliate_id}, updates)
        if not success_update:
            return server_error("Failed to link affiliate")

        # Update user to be affiliate
        update_item('commercive_users', {'user_id': user_id}, {'is_affiliate': True})

        return success({'message': 'Affiliate linked to user successfully'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error linking affiliate: {str(e)}")
        return server_error("Failed to link affiliate")


# ============================================================================
# ADMIN INVITATION
# ============================================================================

def invite_admin(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /admin/invite
    Invite new admin user
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        email = body.get('email', '').strip()

        if not email:
            return bad_request("Email is required")

        # Check if user already exists
        existing = query(
            'commercive_users',
            index_name='email-index',
            key_condition=Key('email').eq(email)
        )

        if existing:
            return bad_request("User with this email already exists")

        # Create invitation
        now = datetime.utcnow().isoformat()
        expiry = (datetime.utcnow() + timedelta(hours=48)).isoformat()
        invitation_token = str(uuid4())

        invitation_data = {
            'invitation_id': str(uuid4()),
            'email': email,
            'token_hash': hash_password(invitation_token),  # Hash the token
            'invited_by': admin.get('user_id'),
            'status': 'pending',
            'expires_at': expiry,
            'created_at': now,
            'accepted_at': None
        }

        put_item('commercive_admin_invitations', invitation_data)

        # Send invitation email
        admin_user = get_item('commercive_users', {'user_id': admin.get('user_id')})
        admin_name = f"{admin_user.get('first_name', '')} {admin_user.get('last_name', '')}".strip()

        send_admin_invitation_email(email, admin_name or 'Commercive Admin', invitation_token)

        return success({'message': 'Admin invitation sent successfully'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error sending admin invitation: {str(e)}")
        return server_error("Failed to send invitation")


# ============================================================================
# DASHBOARD STATISTICS
# ============================================================================

def get_dashboard_stats(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /admin/dashboard
    Get admin dashboard statistics
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Count users
        all_users = db_client.scan('commercive_users', limit=10000)
        total_users = len(all_users)
        active_users = len([u for u in all_users if u.get('status') == 'active'])
        pending_users = len([u for u in all_users if u.get('status') == 'pending'])

        # Count stores
        all_stores = db_client.scan('commercive_stores', limit=10000)
        total_stores = len(all_stores)
        active_stores = len([s for s in all_stores if s.get('is_active')])

        # Count affiliates
        all_affiliates = db_client.scan('commercive_affiliates', limit=10000)
        total_affiliates = len(all_affiliates)

        # Count leads
        all_leads = db_client.scan('commercive_leads', limit=10000)
        total_leads = len(all_leads)

        # This month's leads
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        leads_this_month = len([l for l in all_leads if l.get('created_at', '') >= month_start])

        # Calculate total commissions
        all_commissions = db_client.scan('commercive_commissions', limit=10000)
        total_commissions = sum(c.get('amount', 0) for c in all_commissions)

        # Pending payouts
        pending_payouts_list = query(
            'commercive_payouts',
            index_name='status-index',
            key_condition=Key('status').eq('pending')
        )
        pending_payouts_amount = sum(p.get('amount', 0) for p in pending_payouts_list)

        # Low stock alerts
        all_inventory = db_client.scan('commercive_inventory', limit=10000)
        low_stock_alerts = len([
            i for i in all_inventory
            if i.get('quantity', 0) <= i.get('low_stock_threshold', 10)
        ])

        stats = {
            'total_users': total_users,
            'active_users': active_users,
            'pending_users': pending_users,
            'total_stores': total_stores,
            'active_stores': active_stores,
            'total_affiliates': total_affiliates,
            'total_leads': total_leads,
            'leads_this_month': leads_this_month,
            'total_commissions': total_commissions,
            'pending_payouts': pending_payouts_amount,
            'low_stock_alerts': low_stock_alerts
        }

        return success({'stats': stats})

    except Exception as e:
        print(f"Error getting dashboard stats: {str(e)}")
        return server_error("Failed to get dashboard stats")


# ============================================================================
# SUPPORT TICKET MESSAGE
# ============================================================================

def send_support_message(event: Dict[str, Any], ticket_id: str) -> Dict[str, Any]:
    """
    POST /admin/support/{id}/message
    Admin send message to support ticket
    """
    admin, error_response = require_admin(event)
    if error_response:
        return error_response

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        message = body.get('message', '').strip()
        close_ticket = body.get('close_ticket', False)

        if not message:
            return bad_request("Message is required")

        # Verify ticket exists
        ticket = get_item('commercive_support_tickets', {'ticket_id': ticket_id})
        if not ticket:
            return not_found("Ticket not found")

        # Create message
        now = datetime.utcnow().isoformat()
        message_data = {
            'message_id': str(uuid4()),
            'ticket_id': ticket_id,
            'sender_id': admin.get('user_id'),
            'sender_type': 'admin',
            'message': message,
            'attachment_url': None,
            'is_ai_response': False,
            'created_at': now
        }

        put_item('commercive_support_messages', message_data)

        # Update ticket status and updated_at
        updates = {
            'updated_at': now,
            'status': 'pending'  # Mark as pending response from user
        }

        if close_ticket:
            updates['status'] = 'closed'
            updates['closed_at'] = now

        update_item('commercive_support_tickets', {'ticket_id': ticket_id}, updates)

        # Optionally send email notification to user
        user = get_item('commercive_users', {'user_id': ticket.get('user_id')})
        if user:
            send_email(
                user.get('email'),
                f"Support Ticket Update: {ticket.get('subject')}",
                f"""
                <p>Hi {user.get('first_name', 'User')},</p>
                <p>Your support ticket has been updated:</p>
                <blockquote>{message}</blockquote>
                <p>Status: {'Closed' if close_ticket else 'Pending your response'}</p>
                """
            )

        return success({'message': 'Support message sent successfully'})

    except json.JSONDecodeError:
        return bad_request("Invalid JSON body")
    except Exception as e:
        print(f"Error sending support message: {str(e)}")
        return server_error("Failed to send message")
