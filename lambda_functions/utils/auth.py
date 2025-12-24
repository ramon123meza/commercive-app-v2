"""
Authentication utilities: JWT token handling and password hashing
"""

import os
import jwt
import bcrypt
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from .dynamodb import put_item, get_item, query
from boto3.dynamodb.conditions import Key


# Environment variables
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_HOURS = 168  # 7 days


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """
    Verify a password against its hash

    Args:
        password: Plain text password
        hashed: Hashed password from database

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception as e:
        print(f"Error verifying password: {e}")
        return False


def generate_jwt(user_id: str, email: str, role: str, additional_claims: Optional[Dict[str, Any]] = None) -> str:
    """
    Generate a JWT token

    Args:
        user_id: User ID
        email: User email
        role: User role
        additional_claims: Optional additional claims to include

    Returns:
        JWT token string
    """
    now = datetime.utcnow()
    expiry = now + timedelta(hours=JWT_EXPIRY_HOURS)

    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'iat': now,
        'exp': expiry,
        'jti': str(uuid.uuid4())  # Unique token ID
    }

    if additional_claims:
        payload.update(additional_claims)

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


def verify_jwt(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify and decode a JWT token

    Args:
        token: JWT token string

    Returns:
        Decoded payload if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        print("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"Invalid token: {e}")
        return None


def extract_token_from_header(authorization_header: Optional[str]) -> Optional[str]:
    """
    Extract JWT token from Authorization header

    Args:
        authorization_header: Authorization header value (e.g., "Bearer <token>")

    Returns:
        Token string if found, None otherwise
    """
    if not authorization_header:
        return None

    parts = authorization_header.split(' ')
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None

    return parts[1]


def get_user_from_token(authorization_header: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Extract and verify user from Authorization header

    Args:
        authorization_header: Authorization header value

    Returns:
        User payload if valid, None otherwise
    """
    token = extract_token_from_header(authorization_header)
    if not token:
        return None

    return verify_jwt(token)


def create_session(user_id: str, token: str) -> bool:
    """
    Create a session record in DynamoDB

    Args:
        user_id: User ID
        token: JWT token

    Returns:
        True if successful, False otherwise
    """
    import hashlib

    now = datetime.utcnow().isoformat()
    expiry = (datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)).isoformat()

    # Hash the token using SHA-256 (bcrypt has 72 byte limit, JWT tokens are longer)
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()

    session_data = {
        'session_id': str(uuid.uuid4()),
        'user_id': user_id,
        'token_hash': token_hash,
        'expires_at': expiry,
        'created_at': now,
        'is_valid': True
    }

    return put_item('commercive_sessions', session_data)


def invalidate_session(session_id: str) -> bool:
    """
    Invalidate a session (logout)

    Args:
        session_id: Session ID to invalidate

    Returns:
        True if successful, False otherwise
    """
    from .dynamodb import update_item

    return update_item(
        'commercive_sessions',
        {'session_id': session_id},
        {'is_valid': False}
    )


def invalidate_user_sessions(user_id: str) -> bool:
    """
    Invalidate all sessions for a user

    Args:
        user_id: User ID

    Returns:
        True if successful, False otherwise
    """
    try:
        # Query all user sessions
        sessions = query(
            'commercive_sessions',
            index_name='user-sessions-index',
            key_condition=Key('user_id').eq(user_id)
        )

        # Invalidate each session
        for session in sessions:
            invalidate_session(session['session_id'])

        return True
    except Exception as e:
        print(f"Error invalidating user sessions: {e}")
        return False


def require_auth(event: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Middleware-style auth check for Lambda functions

    Args:
        event: Lambda event dict

    Returns:
        Tuple of (user_payload, error_response)
        - If authenticated: (user_dict, None)
        - If not authenticated: (None, error_response_dict)

    Usage:
        user, error = require_auth(event)
        if error:
            return error
        # Proceed with authenticated user
    """
    from .response import unauthorized

    headers = event.get('headers', {})
    # Handle both lowercase and mixed-case headers
    auth_header = headers.get('Authorization') or headers.get('authorization')

    user = get_user_from_token(auth_header)

    if not user:
        return None, unauthorized("Invalid or missing authentication token")

    return user, None


def require_admin(event: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Require admin role for Lambda functions

    Args:
        event: Lambda event dict

    Returns:
        Tuple of (user_payload, error_response)
    """
    from .response import forbidden

    user, error = require_auth(event)

    if error:
        return None, error

    if user.get('role') != 'admin':
        return None, forbidden("Admin access required")

    return user, None


def generate_verification_code() -> str:
    """
    Generate a 6-digit verification code

    Returns:
        6-digit code string
    """
    import random
    return str(random.randint(100000, 999999))


def generate_reset_token() -> str:
    """
    Generate a secure reset token

    Returns:
        UUID token string
    """
    return str(uuid.uuid4())
