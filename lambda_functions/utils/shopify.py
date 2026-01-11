"""
Shopify API helper utilities
"""

import requests
import hmac
import hashlib
import json
from typing import Dict, List, Optional, Any


def verify_webhook_hmac(data: bytes, hmac_header: str, secret: str) -> bool:
    """
    Verify Shopify webhook HMAC signature

    Args:
        data: Raw request body bytes
        hmac_header: X-Shopify-Hmac-SHA256 header value
        secret: Shopify webhook secret

    Returns:
        True if signature is valid, False otherwise
    """
    try:
        # Calculate expected HMAC
        computed_hmac = hmac.new(
            secret.encode('utf-8'),
            data,
            hashlib.sha256
        ).digest()

        # Shopify sends base64-encoded HMAC
        import base64
        computed_hmac_b64 = base64.b64encode(computed_hmac).decode('utf-8')

        # Compare
        return hmac.compare_digest(computed_hmac_b64, hmac_header)

    except Exception as e:
        print(f"Error verifying webhook HMAC: {e}")
        return False


def make_shopify_request(
    shop_domain: str,
    access_token: str,
    endpoint: str,
    method: str = 'GET',
    data: Optional[Dict[str, Any]] = None,
    api_version: str = '2024-10'
) -> Optional[Dict[str, Any]]:
    """
    Make a request to Shopify Admin REST API

    Args:
        shop_domain: Store domain (e.g., "example.myshopify.com")
        access_token: Shopify access token
        endpoint: API endpoint (e.g., "/admin/api/2024-10/shop.json")
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Request body data (for POST/PUT)
        api_version: Shopify API version

    Returns:
        Response JSON dict if successful, None otherwise
    """
    try:
        url = f"https://{shop_domain}{endpoint}"

        headers = {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': access_token
        }

        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=data,
            timeout=30
        )

        response.raise_for_status()
        return response.json()

    except requests.exceptions.HTTPError as e:
        print(f"Shopify API HTTP error: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        print(f"Error making Shopify request: {e}")
        return None


def make_shopify_graphql_query(
    shop_domain: str,
    access_token: str,
    query: str,
    variables: Optional[Dict[str, Any]] = None,
    api_version: str = '2024-10'
) -> Optional[Dict[str, Any]]:
    """
    Make a GraphQL query to Shopify Admin API

    Args:
        shop_domain: Store domain
        access_token: Shopify access token
        query: GraphQL query string
        variables: Query variables
        api_version: Shopify API version

    Returns:
        Response data if successful, None otherwise
    """
    try:
        url = f"https://{shop_domain}/admin/api/{api_version}/graphql.json"

        headers = {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': access_token
        }

        payload = {'query': query}
        if variables:
            payload['variables'] = variables

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=30
        )

        response.raise_for_status()
        result = response.json()

        # Check for GraphQL errors
        if 'errors' in result:
            print(f"GraphQL errors: {result['errors']}")
            return None

        return result.get('data')

    except requests.exceptions.HTTPError as e:
        print(f"Shopify GraphQL HTTP error: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        print(f"Error making Shopify GraphQL query: {e}")
        return None


def get_shop_info(shop_domain: str, access_token: str) -> Optional[Dict[str, Any]]:
    """
    Get shop information

    Args:
        shop_domain: Store domain
        access_token: Shopify access token

    Returns:
        Shop info dict if successful, None otherwise
    """
    response = make_shopify_request(
        shop_domain,
        access_token,
        '/admin/api/2024-10/shop.json',
        'GET'
    )

    return response.get('shop') if response else None


def fetch_inventory_graphql(
    shop_domain: str,
    access_token: str,
    cursor: Optional[str] = None,
    limit: int = 50
) -> Optional[Dict[str, Any]]:
    """
    Fetch inventory using GraphQL with pagination

    Args:
        shop_domain: Store domain
        access_token: Shopify access token
        cursor: Pagination cursor (for subsequent pages)
        limit: Items per page

    Returns:
        Inventory data dict if successful, None otherwise
    """
    query = """
    query InventoryQuery($cursor: String, $limit: Int!) {
        products(first: $limit, after: $cursor) {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    title
                    variants(first: 10) {
                        edges {
                            node {
                                id
                                title
                                sku
                                barcode
                                price
                                inventoryItem {
                                    id
                                    tracked
                                    inventoryLevels(first: 10) {
                                        edges {
                                            node {
                                                id
                                                quantities(names: ["available", "on_hand"]) {
                                                    name
                                                    quantity
                                                }
                                                location {
                                                    id
                                                    name
                                                }
                                            }
                                        }
                                    }
                                }
                                image {
                                    url
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    """

    variables = {
        'cursor': cursor,
        'limit': limit
    }

    return make_shopify_graphql_query(shop_domain, access_token, query, variables)


def fetch_orders_graphql(
    shop_domain: str,
    access_token: str,
    cursor: Optional[str] = None,
    limit: int = 50
) -> Optional[Dict[str, Any]]:
    """
    Fetch orders using GraphQL with pagination

    Args:
        shop_domain: Store domain
        access_token: Shopify access token
        cursor: Pagination cursor
        limit: Items per page

    Returns:
        Orders data dict if successful, None otherwise
    """
    query = """
    query OrdersQuery($cursor: String, $limit: Int!) {
        orders(first: $limit, after: $cursor) {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    email
                    createdAt
                    totalPriceSet {
                        shopMoney {
                            amount
                            currencyCode
                        }
                    }
                    displayFinancialStatus
                    displayFulfillmentStatus
                    lineItems(first: 50) {
                        edges {
                            node {
                                id
                                title
                                variantTitle
                                sku
                                quantity
                                originalUnitPriceSet {
                                    shopMoney {
                                        amount
                                        currencyCode
                                    }
                                }
                            }
                        }
                    }
                    fulfillments {
                        id
                        status
                        trackingInfo {
                            number
                            url
                            company
                        }
                        createdAt
                    }
                }
            }
        }
    }
    """

    variables = {
        'cursor': cursor,
        'limit': limit
    }

    return make_shopify_graphql_query(shop_domain, access_token, query, variables)


def transform_shopify_id(gid: str) -> str:
    """
    Transform Shopify GraphQL ID to numeric ID

    Args:
        gid: GraphQL ID (e.g., "gid://shopify/Product/123")

    Returns:
        Numeric ID string (e.g., "123")
    """
    return gid.split('/')[-1] if gid else ''


def register_webhook(
    shop_domain: str,
    access_token: str,
    topic: str,
    address: str
) -> bool:
    """
    Register a webhook with Shopify

    Args:
        shop_domain: Store domain
        access_token: Shopify access token
        topic: Webhook topic (e.g., "orders/create")
        address: Webhook callback URL

    Returns:
        True if successful, False otherwise
    """
    data = {
        'webhook': {
            'topic': topic,
            'address': address,
            'format': 'json'
        }
    }

    response = make_shopify_request(
        shop_domain,
        access_token,
        '/admin/api/2024-10/webhooks.json',
        'POST',
        data
    )

    return response is not None


def get_registered_webhooks(shop_domain: str, access_token: str) -> List[Dict[str, Any]]:
    """
    Get all registered webhooks for a shop

    Args:
        shop_domain: Store domain
        access_token: Shopify access token

    Returns:
        List of webhook dicts
    """
    response = make_shopify_request(
        shop_domain,
        access_token,
        '/admin/api/2024-10/webhooks.json',
        'GET'
    )

    if response and 'webhooks' in response:
        return response['webhooks']

    return []


def delete_webhook(shop_domain: str, access_token: str, webhook_id: str) -> bool:
    """
    Delete a webhook

    Args:
        shop_domain: Store domain
        access_token: Shopify access token
        webhook_id: Webhook ID to delete

    Returns:
        True if successful, False otherwise
    """
    response = make_shopify_request(
        shop_domain,
        access_token,
        f'/admin/api/2024-10/webhooks/{webhook_id}.json',
        'DELETE'
    )

    return response is not None
