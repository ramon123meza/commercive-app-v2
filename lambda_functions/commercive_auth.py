
#endpoint: https://6khukjgv7faqtw2f6baa4yal4m0jouxo.lambda-url.us-east-1.on.aws/
"""
Commercive Auth Lambda - Unified authentication handler
Handles: signup, verify-email, login, logout, forgot-password, reset-password, refresh
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Import shared utilities
from utils.auth import (
    hash_password,
    verify_password,
    generate_jwt,
    verify_jwt,
    extract_token_from_header,
    create_session,
    invalidate_user_sessions,
    generate_verification_code,
    generate_reset_token
)
from utils.dynamodb import put_item, get_item, query, update_item
from utils.response import (
    success,
    created,
    error,
    bad_request,
    unauthorized,
    forbidden,
    conflict,
    cors_preflight
)
from utils.email import (
    send_verification_email,
    send_password_reset_email,
    send_welcome_email
)
from boto3.dynamodb.conditions import Key


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for authentication operations.
    Routes requests to appropriate handlers based on path and method.
    """
    try:
        # Debug logging
        print(f"=== AUTH LAMBDA INVOKED ===")
        print(f"Event: {json.dumps(event, default=str)}")

        # Handle CORS preflight
        method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
        print(f"Method: {method}")

        if method == 'OPTIONS':
            print("Handling CORS preflight")
            return cors_preflight()

        # Extract routing info
        path = event.get('rawPath', event.get('path', '')).rstrip('/')
        print(f"Path: {path}")

        # Route to appropriate handler
        routes = {
            ('POST', '/signup'): signup,
            ('POST', '/verify-email'): verify_email,
            ('POST', '/login'): login,
            ('POST', '/logout'): logout,
            ('POST', '/forgot-password'): forgot_password,
            ('POST', '/reset-password'): reset_password,
            ('POST', '/refresh'): refresh_token,
        }

        handler_func = routes.get((method, path))
        if handler_func:
            print(f"Routing to: {handler_func.__name__}")
            result = handler_func(event)
            print(f"Handler result: {json.dumps(result, default=str)}")
            return result

        print(f"Route not found: {method} {path}")
        return error(f'Route not found: {method} {path}', 404)

    except Exception as e:
        import traceback
        print(f"Unhandled error in auth handler: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return error('Internal server error', 500)


def signup(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /signup
    Register new user account and send verification code.

    Request:
    {
        "email": "user@example.com",
        "password": "SecurePass123!",
        "first_name": "John",
        "last_name": "Doe",
        "phone": "+1234567890"
    }

    Response: 201
    {
        "success": true,
        "message": "Verification code sent to email"
    }
    """
    try:
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        # Validate required fields
        email = body.get('email', '').strip().lower()
        password = body.get('password', '')
        first_name = body.get('first_name', '').strip()
        last_name = body.get('last_name', '').strip()
        phone = body.get('phone', '').strip()

        # Validation
        if not email or '@' not in email:
            return bad_request('Valid email is required')

        if not password or len(password) < 8:
            return bad_request('Password must be at least 8 characters')

        if not first_name or len(first_name) < 2:
            return bad_request('First name must be at least 2 characters')

        if not last_name or len(last_name) < 2:
            return bad_request('Last name must be at least 2 characters')

        if not phone:
            return bad_request('Phone number is required')

        # Check if email already exists
        existing_users = query(
            'commercive_users',
            index_name='email-index',
            key_condition=Key('email').eq(email)
        )

        if existing_users:
            return conflict('Email already registered')

        # Check if there's a pending verification for this email
        existing_verifications = query(
            'commercive_email_verification',
            index_name='email-code-index',
            key_condition=Key('email').eq(email)
        )

        # Mark old verifications as used
        for verification in existing_verifications:
            if not verification.get('used'):
                update_item(
                    'commercive_email_verification',
                    {'verification_id': verification['verification_id']},
                    {'used': True}
                )

        # Generate 6-digit verification code
        verification_code = generate_verification_code()

        # Store verification record (expires in 15 minutes)
        now = datetime.utcnow()
        expiry = now + timedelta(minutes=15)

        verification_data = {
            'verification_id': str(uuid.uuid4()),
            'email': email,
            'code': verification_code,
            'expires_at': expiry.isoformat(),
            'used': False,
            'created_at': now.isoformat(),
            # Temporarily store user data
            'temp_password_hash': hash_password(password),
            'temp_first_name': first_name,
            'temp_last_name': last_name,
            'temp_phone': phone
        }

        put_item('commercive_email_verification', verification_data)

        # Send verification email
        send_verification_email(email, verification_code, first_name)

        return created(
            message='Verification code sent to email. Code expires in 15 minutes.'
        )

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in signup: {str(e)}")
        return error('Internal server error', 500)


def verify_email(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /verify-email
    Verify email with 6-digit code and create pending account.

    Request:
    {
        "email": "user@example.com",
        "code": "123456"
    }

    Response: 201
    {
        "success": true,
        "message": "Account created. Awaiting admin approval."
    }
    """
    try:
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        email = body.get('email', '').strip().lower()
        code = body.get('code', '').strip()

        if not email or not code:
            return bad_request('Email and verification code are required')

        # Find verification record
        verifications = query(
            'commercive_email_verification',
            index_name='email-code-index',
            key_condition=Key('email').eq(email)
        )

        # Find matching, unexpired, unused code
        now = datetime.utcnow()
        valid_verification = None

        for verification in verifications:
            if (verification.get('code') == code and
                not verification.get('used') and
                datetime.fromisoformat(verification.get('expires_at')) > now):
                valid_verification = verification
                break

        if not valid_verification:
            return bad_request('Invalid or expired verification code')

        # Check if user already exists (race condition check)
        existing_users = query(
            'commercive_users',
            index_name='email-index',
            key_condition=Key('email').eq(email)
        )

        if existing_users:
            return conflict('Email already verified and registered')

        # Create user account with status='pending' (requires admin approval)
        user_data = {
            'user_id': str(uuid.uuid4()),
            'email': email,
            'password_hash': valid_verification['temp_password_hash'],
            'first_name': valid_verification['temp_first_name'],
            'last_name': valid_verification['temp_last_name'],
            'phone': valid_verification['temp_phone'],
            'role': 'user',
            'is_affiliate': False,
            'is_store_owner': False,
            'is_approved': False,
            'status': 'pending',
            'visible_pages': [],
            'profile_image_url': None,
            'payment_method': None,
            'payment_email': None,
            'created_at': now.isoformat(),
            'updated_at': now.isoformat()
        }

        put_item('commercive_users', user_data)

        # Mark verification as used
        update_item(
            'commercive_email_verification',
            {'verification_id': valid_verification['verification_id']},
            {'used': True}
        )

        return created(
            message='Account created successfully. Please wait for admin approval before logging in.'
        )

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in verify_email: {str(e)}")
        return error('Internal server error', 500)


def login(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /login
    Authenticate user and return JWT token.

    Request:
    {
        "email": "user@example.com",
        "password": "SecurePass123!"
    }

    Response: 200
    {
        "success": true,
        "token": "jwt_token",
        "refresh_token": "jwt_token",
        "user": { ... }
    }
    """
    try:
        print("=== LOGIN FUNCTION START ===")

        # Parse request body
        body = event.get('body', '{}')
        print(f"Raw body: {body}")

        if isinstance(body, str):
            body = json.loads(body) if body else {}

        print(f"Parsed body: {body}")

        email = body.get('email', '').strip().lower()
        password = body.get('password', '')
        print(f"Email: {email}, Password length: {len(password)}")

        if not email or not password:
            print("Missing email or password")
            return bad_request('Email and password are required')

        # Find user by email
        print(f"Querying for user with email: {email}")
        users = query(
            'commercive_users',
            index_name='email-index',
            key_condition=Key('email').eq(email)
        )
        print(f"Query result: {len(users) if users else 0} users found")

        if not users:
            print("No user found with this email")
            return unauthorized('Invalid email or password')

        user = users[0]
        print(f"User found: {user.get('user_id')}, role: {user.get('role')}, status: {user.get('status')}")

        # Verify password
        print("Verifying password...")
        if not verify_password(password, user['password_hash']):
            print("Password verification failed")
            return unauthorized('Invalid email or password')

        print("Password verified successfully")

        # Check if account is approved
        if not user.get('is_approved', False):
            print("Account not approved")
            return forbidden('Account pending admin approval')

        # Check if account is active
        if user.get('status') != 'active':
            print(f"Account not active: {user.get('status')}")
            return forbidden('Account is not active')

        print("Account is approved and active, generating JWT...")

        # Generate JWT token
        token = generate_jwt(
            user_id=user['user_id'],
            email=user['email'],
            role=user['role']
        )

        # Create session record
        create_session(user['user_id'], token)

        # Get user's stores if they're a store owner
        stores = []
        if user.get('is_store_owner'):
            store_links = query(
                'commercive_store_users',
                index_name='user-stores-index',
                key_condition=Key('user_id').eq(user['user_id'])
            )

            for link in store_links:
                store = get_item('commercive_stores', {'store_id': link['store_id']})
                if store:
                    stores.append({
                        'store_id': store['store_id'],
                        'shop_name': store['shop_name'],
                        'shop_domain': store['shop_domain']
                    })

        # Get affiliate data if user is an affiliate
        affiliate_data = None
        if user.get('is_affiliate'):
            affiliates = query(
                'commercive_affiliates',
                index_name='user-affiliate-index',
                key_condition=Key('user_id').eq(user['user_id'])
            )

            if affiliates:
                affiliate = affiliates[0]
                available_balance = affiliate.get('total_earned', 0) - affiliate.get('total_paid', 0)
                affiliate_data = {
                    'affiliate_id': affiliate['affiliate_id'],
                    'total_leads': affiliate.get('total_leads', 0),
                    'total_conversions': affiliate.get('total_conversions', 0),
                    'total_earned': affiliate.get('total_earned', 0),
                    'total_paid': affiliate.get('total_paid', 0),
                    'available_balance': available_balance
                }

        # Build user response (exclude password_hash)
        user_response = {
            'user_id': user['user_id'],
            'email': user['email'],
            'first_name': user['first_name'],
            'last_name': user['last_name'],
            'role': user['role'],
            'is_admin': user['role'] == 'admin',  # Frontend expects this field
            'is_affiliate': user.get('is_affiliate', False),
            'is_store_owner': user.get('is_store_owner', False),
            'visible_pages': user.get('visible_pages', []),
            'profile_image_url': user.get('profile_image_url'),
            'stores': stores,
            'affiliate': affiliate_data
        }

        return success(
            data={
                'token': token,
                'refresh_token': token,  # Using same token for now
                'user': user_response
            },
            message='Login successful'
        )

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in login: {str(e)}")
        return error('Internal server error', 500)


def logout(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /logout
    Invalidate current session.

    Headers: Authorization: Bearer {token}

    Response: 200
    {
        "success": true,
        "message": "Logged out successfully"
    }
    """
    try:
        # Extract and verify token
        headers = event.get('headers', {})
        auth_header = headers.get('Authorization') or headers.get('authorization')

        token = extract_token_from_header(auth_header)
        if not token:
            return unauthorized('Missing or invalid authentication token')

        payload = verify_jwt(token)
        if not payload:
            return unauthorized('Invalid or expired token')

        user_id = payload.get('user_id')

        # Invalidate all sessions for this user
        invalidate_user_sessions(user_id)

        return success(message='Logged out successfully')

    except Exception as e:
        print(f"Error in logout: {str(e)}")
        return error('Internal server error', 500)


def forgot_password(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /forgot-password
    Request password reset link.

    Request:
    {
        "email": "user@example.com"
    }

    Response: 200 (always returns success to prevent email enumeration)
    {
        "success": true,
        "message": "If email exists, reset link has been sent"
    }
    """
    try:
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        email = body.get('email', '').strip().lower()

        if not email or '@' not in email:
            return bad_request('Valid email is required')

        # Find user by email
        users = query(
            'commercive_users',
            index_name='email-index',
            key_condition=Key('email').eq(email)
        )

        # Always return success to prevent email enumeration
        # Only send email if user exists
        if users:
            user = users[0]

            # Generate reset token
            reset_token = generate_reset_token()

            # Store reset record (expires in 1 hour)
            now = datetime.utcnow()
            expiry = now + timedelta(hours=1)

            reset_data = {
                'reset_id': str(uuid.uuid4()),
                'user_id': user['user_id'],
                'token_hash': hash_password(reset_token),  # Hash the token
                'expires_at': expiry.isoformat(),
                'used': False,
                'created_at': now.isoformat()
            }

            put_item('commercive_password_resets', reset_data)

            # Send reset email
            user_name = f"{user['first_name']} {user['last_name']}"
            send_password_reset_email(email, reset_token, user_name)

        return success(
            message='If an account exists with that email, a password reset link has been sent.'
        )

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in forgot_password: {str(e)}")
        return error('Internal server error', 500)


def reset_password(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /reset-password
    Reset password with token.

    Request:
    {
        "token": "reset_token_from_email",
        "password": "NewSecurePass123!"
    }

    Response: 200
    {
        "success": true,
        "message": "Password reset successfully"
    }
    """
    try:
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        reset_token = body.get('token', '').strip()
        new_password = body.get('password', '')

        if not reset_token:
            return bad_request('Reset token is required')

        if not new_password or len(new_password) < 8:
            return bad_request('Password must be at least 8 characters')

        # Find all reset records and check token
        # Note: In production, consider adding an index on token_hash
        # For now, we'll scan (inefficient but works for small datasets)
        from utils.dynamodb import db_client
        all_resets = db_client.scan('commercive_password_resets')

        now = datetime.utcnow()
        valid_reset = None

        for reset in all_resets:
            # Check if token matches, not used, and not expired
            if (not reset.get('used') and
                datetime.fromisoformat(reset.get('expires_at')) > now):
                # Verify token against hash
                # Note: We're using verify_password since we hashed the token
                if verify_password(reset_token, reset.get('token_hash', '')):
                    valid_reset = reset
                    break

        if not valid_reset:
            return bad_request('Invalid or expired reset token')

        # Get user
        user = get_item('commercive_users', {'user_id': valid_reset['user_id']})
        if not user:
            return bad_request('User not found')

        # Update password
        new_password_hash = hash_password(new_password)
        update_item(
            'commercive_users',
            {'user_id': user['user_id']},
            {
                'password_hash': new_password_hash,
                'updated_at': now.isoformat()
            }
        )

        # Mark reset token as used
        update_item(
            'commercive_password_resets',
            {'reset_id': valid_reset['reset_id']},
            {'used': True}
        )

        # Invalidate all existing sessions for security
        invalidate_user_sessions(user['user_id'])

        return success(message='Password reset successfully. Please log in with your new password.')

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in reset_password: {str(e)}")
        return error('Internal server error', 500)


def refresh_token(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /refresh
    Refresh JWT token.

    Headers: Authorization: Bearer {token}

    Response: 200
    {
        "success": true,
        "token": "new_jwt_token",
        "refresh_token": "new_jwt_token"
    }
    """
    try:
        # Extract and verify current token
        headers = event.get('headers', {})
        auth_header = headers.get('Authorization') or headers.get('authorization')

        token = extract_token_from_header(auth_header)
        if not token:
            return unauthorized('Missing or invalid authentication token')

        payload = verify_jwt(token)
        if not payload:
            return unauthorized('Invalid or expired token')

        user_id = payload.get('user_id')

        # Get fresh user data
        user = get_item('commercive_users', {'user_id': user_id})
        if not user:
            return unauthorized('User not found')

        # Check if user is still active
        if user.get('status') != 'active' or not user.get('is_approved'):
            return forbidden('Account is not active')

        # Generate new token
        new_token = generate_jwt(
            user_id=user['user_id'],
            email=user['email'],
            role=user['role']
        )

        # Create new session
        create_session(user['user_id'], new_token)

        return success(
            data={
                'token': new_token,
                'refresh_token': new_token
            },
            message='Token refreshed successfully'
        )

    except Exception as e:
        print(f"Error in refresh_token: {str(e)}")
        return error('Internal server error', 500)


# Lambda handler alias (AWS expects 'handler' or 'lambda_handler')
lambda_handler = handler
