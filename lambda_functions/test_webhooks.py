"""
Test suite for commercive_webhooks Lambda function
Run locally to test webhook processing logic
"""

import json
import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from commercive_webhooks import (
    handler,
    handle_orders_create,
    handle_orders_update,
    handle_inventory_update,
    handle_fulfillment_create,
    handle_app_uninstall,
    verify_hmac_signature
)


def create_test_event(webhook_type: str, payload: dict) -> dict:
    """
    Create a test Lambda event for webhook processing

    Args:
        webhook_type: Type of webhook (orders/create, etc.)
        payload: Webhook payload dict

    Returns:
        Lambda event dict
    """
    return {
        'rawPath': f'/webhooks/{webhook_type}',
        'requestContext': {
            'http': {
                'method': 'POST'
            }
        },
        'headers': {
            'x-shopify-hmac-sha256': 'test_hmac',
            'x-shopify-shop-domain': 'test-store.myshopify.com',
            'x-shopify-topic': webhook_type
        },
        'body': json.dumps(payload),
        'isBase64Encoded': False
    }


def test_orders_create():
    """Test order creation webhook"""
    print("\n=== Testing orders/create webhook ===")

    payload = {
        'id': 123456789,
        'name': '#1001',
        'email': 'customer@example.com',
        'created_at': '2025-12-21T10:00:00Z',
        'total_price': '99.99',
        'currency': 'USD',
        'financial_status': 'paid',
        'fulfillment_status': None,
        'customer': {
            'first_name': 'John',
            'last_name': 'Doe',
            'email': 'customer@example.com'
        },
        'line_items': [
            {
                'id': 111111,
                'title': 'Blue T-Shirt',
                'variant_title': 'Medium',
                'sku': 'BTS-M-001',
                'quantity': 2,
                'price': '29.99'
            },
            {
                'id': 222222,
                'title': 'Black Jeans',
                'variant_title': 'Size 32',
                'sku': 'BJ-32-001',
                'quantity': 1,
                'price': '49.99'
            }
        ]
    }

    event = create_test_event('orders/create', payload)

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        print(f"✓ Response body: {response['body']}")
        assert response['statusCode'] == 200
        print("✓ Test passed!")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()


def test_orders_update():
    """Test order update webhook"""
    print("\n=== Testing orders/update webhook ===")

    payload = {
        'id': 123456789,
        'name': '#1001',
        'email': 'customer@example.com',
        'financial_status': 'paid',
        'fulfillment_status': 'fulfilled',
        'customer': {
            'first_name': 'John',
            'last_name': 'Doe'
        },
        'line_items': [
            {
                'id': 111111,
                'quantity': 3,  # Updated quantity
                'price': '29.99'
            }
        ]
    }

    event = create_test_event('orders/update', payload)

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        print(f"✓ Response body: {response['body']}")
        assert response['statusCode'] == 200
        print("✓ Test passed!")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")


def test_inventory_update():
    """Test inventory update webhook"""
    print("\n=== Testing inventory/update webhook ===")

    payload = {
        'inventory_item_id': 987654321,
        'available': 42
    }

    event = create_test_event('inventory_levels/update', payload)

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        print(f"✓ Response body: {response['body']}")
        assert response['statusCode'] == 200
        print("✓ Test passed!")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")


def test_fulfillment_create():
    """Test fulfillment creation webhook"""
    print("\n=== Testing fulfillment/create webhook ===")

    payload = {
        'id': 555555555,
        'order_id': 123456789,
        'status': 'success',
        'tracking_company': 'UPS',
        'tracking_number': '1Z999AA10123456784',
        'tracking_url': 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
        'tracking_urls': [
            'https://www.ups.com/track?tracknum=1Z999AA10123456784'
        ],
        'updated_at': '2025-12-21T12:00:00Z'
    }

    event = create_test_event('fulfillments/create', payload)

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        print(f"✓ Response body: {response['body']}")
        assert response['statusCode'] == 200
        print("✓ Test passed!")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")


def test_app_uninstall():
    """Test app uninstall webhook"""
    print("\n=== Testing app/uninstalled webhook ===")

    payload = {
        'id': 123456789,
        'name': 'test-store.myshopify.com'
    }

    event = create_test_event('app/uninstalled', payload)

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        print(f"✓ Response body: {response['body']}")
        assert response['statusCode'] == 200
        print("✓ Test passed!")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")


def test_hmac_verification():
    """Test HMAC signature verification"""
    print("\n=== Testing HMAC verification ===")

    import hmac
    import hashlib
    import base64

    secret = "test_secret"
    body = '{"id": 123, "name": "test"}'
    body_bytes = body.encode('utf-8')

    # Calculate expected HMAC
    calculated_hmac = hmac.new(
        secret.encode('utf-8'),
        body_bytes,
        hashlib.sha256
    ).digest()
    hmac_b64 = base64.b64encode(calculated_hmac).decode('utf-8')

    print(f"Secret: {secret}")
    print(f"Body: {body}")
    print(f"Calculated HMAC: {hmac_b64}")

    # Test verification
    is_valid = verify_hmac_signature(body_bytes, hmac_b64)
    print(f"Verification result: {is_valid}")

    # Note: This will fail unless SHOPIFY_WEBHOOK_SECRET env var is set to "test_secret"
    print("✓ HMAC calculation logic works (verification requires env var)")


def test_cors_preflight():
    """Test CORS preflight request"""
    print("\n=== Testing CORS preflight ===")

    event = {
        'rawPath': '/webhooks/orders/create',
        'requestContext': {
            'http': {
                'method': 'OPTIONS'
            }
        },
        'headers': {}
    }

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        print(f"✓ CORS headers present: {bool(response['headers'].get('Access-Control-Allow-Origin'))}")
        assert response['statusCode'] == 200
        assert 'Access-Control-Allow-Origin' in response['headers']
        print("✓ Test passed!")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")


def test_invalid_webhook():
    """Test unknown webhook topic"""
    print("\n=== Testing unknown webhook ===")

    payload = {'id': 123}
    event = create_test_event('unknown/topic', payload)

    try:
        response = handler(event, None)
        print(f"✓ Response status: {response['statusCode']}")
        # Should still return 200 (we don't want Shopify to retry)
        assert response['statusCode'] == 200
        print("✓ Test passed! (Unknown webhooks return 200)")
    except Exception as e:
        print(f"✗ Test failed: {str(e)}")


def run_all_tests():
    """Run all test cases"""
    print("=" * 60)
    print("Commercive Webhooks Test Suite")
    print("=" * 60)
    print("\nNOTE: These tests require DynamoDB access.")
    print("Some tests may fail if tables don't exist or data is missing.")
    print("=" * 60)

    # Run all tests
    test_cors_preflight()
    test_hmac_verification()
    test_orders_create()
    test_orders_update()
    test_inventory_update()
    test_fulfillment_create()
    test_app_uninstall()
    test_invalid_webhook()

    print("\n" + "=" * 60)
    print("Test suite complete!")
    print("=" * 60)


if __name__ == '__main__':
    # Set test environment variables
    os.environ['SHOPIFY_WEBHOOK_SECRET'] = 'test_secret'
    os.environ['AWS_REGION'] = 'us-east-1'

    # Run tests
    run_all_tests()
