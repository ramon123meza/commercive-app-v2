#endpoint: https://ktncswuqqjzgnlfkjhiiwu3ljm0jnyqx.lambda-url.us-east-1.on.aws/

"""
commercive_users.py - User Profile Management Lambda

Handles user profile operations with internal routing:
- GET /profile - Get user profile with connected stores and affiliate info
- PUT /profile - Update user profile information
- POST /avatar - Upload profile picture to S3
- GET /permissions - Get user permissions and visible pages

All endpoints require JWT authentication.
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional
from boto3.dynamodb.conditions import Key

# Import shared utilities
from utils.auth import require_auth
from utils.dynamodb import get_item, update_item, query
from utils.response import success, error, bad_request, unauthorized, not_found, cors_preflight
from utils.s3 import upload_base64_image, delete_file, validate_image_file
import base64


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for user profile operations.
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
        if path == '/profile' and method == 'GET':
            return handle_get_profile(event)
        elif path == '/profile' and method == 'PUT':
            return handle_update_profile(event)
        elif path == '/avatar' and method == 'POST':
            return handle_upload_avatar(event)
        elif path == '/permissions' and method == 'GET':
            return handle_get_permissions(event)
        else:
            return not_found('Endpoint not found')

    except Exception as e:
        print(f"Unhandled error in handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def handle_get_profile(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /profile - Get current user profile with stores and affiliate info

    Returns:
        - User basic info
        - Connected stores
        - Affiliate data (if is_affiliate=true)
    """
    try:
        # Verify authentication
        user_payload, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user_payload.get('user_id')

        # Get user data from DynamoDB
        user = get_item('commercive_users', {'user_id': user_id})

        if not user:
            return not_found('User not found')

        # Remove password hash from response
        if 'password_hash' in user:
            del user['password_hash']

        # Get connected stores
        stores = []
        if user.get('is_store_owner'):
            store_links = query(
                'commercive_store_users',
                index_name='user-stores-index',
                key_condition=Key('user_id').eq(user_id)
            )

            # Fetch store details for each link
            for link in store_links:
                store = get_item('commercive_stores', {'store_id': link['store_id']})
                if store:
                    stores.append({
                        'store_id': store['store_id'],
                        'shop_name': store.get('shop_name', ''),
                        'shop_domain': store.get('shop_domain', ''),
                        'is_active': store.get('is_active', False),
                        'created_at': store.get('created_at', '')
                    })

        user['stores'] = stores

        # Get affiliate data if user is affiliate
        affiliate_data = None
        if user.get('is_affiliate'):
            affiliates = query(
                'commercive_affiliates',
                index_name='user-affiliate-index',
                key_condition=Key('user_id').eq(user_id)
            )

            if affiliates and len(affiliates) > 0:
                affiliate = affiliates[0]
                affiliate_data = {
                    'affiliate_id': affiliate.get('affiliate_id', ''),
                    'total_leads': affiliate.get('total_leads', 0),
                    'total_conversions': affiliate.get('total_conversions', 0),
                    'total_earned': affiliate.get('total_earned', 0),
                    'total_paid': affiliate.get('total_paid', 0),
                    'available_balance': affiliate.get('total_earned', 0) - affiliate.get('total_paid', 0),
                    'commission_rate': affiliate.get('commission_rate', 0),
                    'status': affiliate.get('status', 'inactive')
                }

        user['affiliate'] = affiliate_data

        return success({'user': user})

    except Exception as e:
        print(f"Error in handle_get_profile: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def handle_update_profile(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    PUT /profile - Update user profile

    Allowed updates:
    - first_name
    - last_name
    - phone
    - payment_method
    - payment_email

    Cannot change: email, role, is_affiliate, is_store_owner
    """
    try:
        # Verify authentication
        user_payload, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user_payload.get('user_id')

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request('Invalid JSON body')

        # Validate allowed fields
        allowed_fields = ['first_name', 'last_name', 'phone', 'payment_method', 'payment_email']
        updates = {}

        for field in allowed_fields:
            if field in body:
                updates[field] = body[field]

        if not updates:
            return bad_request('No valid fields to update')

        # Validate specific fields
        if 'first_name' in updates:
            if not updates['first_name'] or len(updates['first_name'].strip()) < 2:
                return bad_request('First name must be at least 2 characters')
            updates['first_name'] = updates['first_name'].strip()

        if 'last_name' in updates:
            if not updates['last_name'] or len(updates['last_name'].strip()) < 2:
                return bad_request('Last name must be at least 2 characters')
            updates['last_name'] = updates['last_name'].strip()

        if 'phone' in updates:
            # Basic phone validation
            phone = updates['phone'].strip()
            if not phone:
                return bad_request('Phone cannot be empty')
            updates['phone'] = phone

        if 'payment_method' in updates:
            if updates['payment_method'] not in ['paypal', 'zelle', None]:
                return bad_request('Payment method must be "paypal" or "zelle"')

        if 'payment_email' in updates:
            # Basic email validation
            email = updates['payment_email'].strip()
            if email and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
                return bad_request('Invalid payment email format')
            updates['payment_email'] = email if email else None

        # Add updated timestamp
        updates['updated_at'] = datetime.utcnow().isoformat()

        # Update user in database
        success_update = update_item(
            'commercive_users',
            {'user_id': user_id},
            updates
        )

        if not success_update:
            return error('Failed to update profile', 500)

        # Get updated user data
        updated_user = get_item('commercive_users', {'user_id': user_id})

        if updated_user and 'password_hash' in updated_user:
            del updated_user['password_hash']

        return success({'user': updated_user}, 'Profile updated successfully')

    except Exception as e:
        print(f"Error in handle_update_profile: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def handle_upload_avatar(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /avatar - Upload profile picture

    Expects:
    - base64-encoded image in request body
    - JSON format: {"image": "base64data...", "filename": "avatar.jpg"}

    Process:
    1. Validate image
    2. Upload to S3
    3. Delete old image if exists
    4. Update user profile_image_url
    """
    try:
        # Verify authentication
        user_payload, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user_payload.get('user_id')

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request('Invalid JSON body')

        # Get base64 image data
        image_data = body.get('image')
        if not image_data:
            return bad_request('Missing image data')

        # Get filename (optional)
        filename = body.get('filename', 'avatar.jpg')

        # Decode and validate image
        try:
            # Handle data URI format (data:image/png;base64,...)
            if image_data.startswith('data:'):
                image_data = image_data.split(',', 1)[1]

            # Decode base64
            image_bytes = base64.b64decode(image_data)

            # Validate image
            is_valid, validation_error = validate_image_file(image_bytes, max_size_mb=5)
            if not is_valid:
                return bad_request(validation_error)

        except Exception as e:
            print(f"Error decoding image: {str(e)}")
            return bad_request('Invalid base64 image data')

        # Get current user to check for existing avatar
        user = get_item('commercive_users', {'user_id': user_id})
        if not user:
            return not_found('User not found')

        old_image_url = user.get('profile_image_url')

        # Upload to S3
        new_image_url = upload_base64_image(
            base64_data=image_data,
            file_name=filename,
            folder='avatars'
        )

        if not new_image_url:
            return error('Failed to upload image to S3', 500)

        # Update user profile with new image URL
        success_update = update_item(
            'commercive_users',
            {'user_id': user_id},
            {
                'profile_image_url': new_image_url,
                'updated_at': datetime.utcnow().isoformat()
            }
        )

        if not success_update:
            # Try to delete the uploaded image since profile update failed
            delete_file(new_image_url)
            return error('Failed to update profile with new image', 500)

        # Delete old image if it exists and is in our bucket
        if old_image_url and 'prompt-images-nerd' in old_image_url:
            delete_file(old_image_url)
            print(f"Deleted old avatar: {old_image_url}")

        return success(
            {'profile_image_url': new_image_url},
            'Profile picture uploaded successfully'
        )

    except Exception as e:
        print(f"Error in handle_upload_avatar: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


def handle_get_permissions(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /permissions - Get user permissions and visible pages

    Returns:
    - role
    - is_affiliate
    - is_store_owner
    - visible_pages (array)
    - visible_stores (array of store_ids user has access to)
    """
    try:
        # Verify authentication
        user_payload, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user_payload.get('user_id')

        # Get user data
        user = get_item('commercive_users', {'user_id': user_id})

        if not user:
            return not_found('User not found')

        # Get visible stores
        visible_stores = []
        if user.get('is_store_owner'):
            store_links = query(
                'commercive_store_users',
                index_name='user-stores-index',
                key_condition=Key('user_id').eq(user_id)
            )
            visible_stores = [link['store_id'] for link in store_links]

        # Build permissions object
        permissions = {
            'role': user.get('role', 'user'),
            'is_affiliate': user.get('is_affiliate', False),
            'is_store_owner': user.get('is_store_owner', False),
            'is_approved': user.get('is_approved', False),
            'status': user.get('status', 'pending'),
            'visible_pages': user.get('visible_pages', []),
            'visible_stores': visible_stores
        }

        return success({'permissions': permissions})

    except Exception as e:
        print(f"Error in handle_get_permissions: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)
