"""
Standard HTTP response formatters for Lambda functions

Note: CORS is handled by Lambda Function URL configuration.
Do NOT add CORS headers here to avoid duplicate header errors.
"""

import json
from typing import Dict, Any, Optional


def create_response(status_code: int, body: Any, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Create a standardized Lambda response

    Args:
        status_code: HTTP status code
        body: Response body (will be JSON stringified if dict/list)
        headers: Additional headers to include

    Returns:
        Lambda response dict

    Note: CORS headers are handled by Lambda Function URL config,
    not in code, to avoid duplicate header errors.
    """
    default_headers = {
        'Content-Type': 'application/json'
    }

    if headers:
        default_headers.update(headers)

    # Convert body to JSON string if needed
    if isinstance(body, (dict, list)):
        body = json.dumps(body)

    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': body
    }


def success(data: Any = None, message: str = "Success", status_code: int = 200) -> Dict[str, Any]:
    """
    Create a success response

    Args:
        data: Data to return
        message: Success message
        status_code: HTTP status code (default 200)

    Returns:
        Lambda response dict
    """
    body = {
        'success': True,
        'message': message
    }

    if data is not None:
        body['data'] = data

    return create_response(status_code, body)


def error(message: str, status_code: int = 400, error_code: Optional[str] = None,
          details: Optional[Any] = None) -> Dict[str, Any]:
    """
    Create an error response

    Args:
        message: Error message
        status_code: HTTP status code (default 400)
        error_code: Optional error code identifier
        details: Optional additional error details

    Returns:
        Lambda response dict
    """
    body = {
        'success': False,
        'error': message
    }

    if error_code:
        body['error_code'] = error_code

    if details:
        body['details'] = details

    return create_response(status_code, body)


def bad_request(message: str = "Bad request") -> Dict[str, Any]:
    """400 Bad Request"""
    return error(message, 400, 'BAD_REQUEST')


def unauthorized(message: str = "Unauthorized") -> Dict[str, Any]:
    """401 Unauthorized"""
    return error(message, 401, 'UNAUTHORIZED')


def forbidden(message: str = "Forbidden") -> Dict[str, Any]:
    """403 Forbidden"""
    return error(message, 403, 'FORBIDDEN')


def not_found(message: str = "Resource not found") -> Dict[str, Any]:
    """404 Not Found"""
    return error(message, 404, 'NOT_FOUND')


def conflict(message: str = "Resource already exists") -> Dict[str, Any]:
    """409 Conflict"""
    return error(message, 409, 'CONFLICT')


def unprocessable_entity(message: str = "Validation failed") -> Dict[str, Any]:
    """422 Unprocessable Entity"""
    return error(message, 422, 'VALIDATION_ERROR')


def server_error(message: str = "Internal server error") -> Dict[str, Any]:
    """500 Internal Server Error"""
    return error(message, 500, 'SERVER_ERROR')


def created(data: Any = None, message: str = "Created successfully") -> Dict[str, Any]:
    """201 Created"""
    return success(data, message, 201)


def no_content() -> Dict[str, Any]:
    """204 No Content"""
    return create_response(204, '')


def cors_preflight() -> Dict[str, Any]:
    """
    Handle CORS preflight OPTIONS request

    Note: Lambda Function URL handles CORS automatically.
    This just returns a 200 OK for any OPTIONS requests that reach the handler.

    Returns:
        200 response
    """
    return create_response(200, '')
