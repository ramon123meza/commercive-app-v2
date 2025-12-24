#endpoint: https://teyhqiqnt4kgws2rq7ggns3bxi0dwtwk.lambda-url.us-east-1.on.aws/
"""
Commercive Payouts Lambda Function
Handles payout requests, history, and balance calculations for affiliates

Endpoints:
- POST /payouts/request - Request a payout
- GET /payouts - List payout history
- GET /payouts/balance - Get available balance
"""

import json
import uuid
import re
from datetime import datetime
from typing import Any, Dict, Optional
from boto3.dynamodb.conditions import Key

# Import utilities
from utils.auth import require_auth
from utils.dynamodb import get_item, put_item, query, update_item
from utils.response import (
    success, error, bad_request, unauthorized,
    forbidden, server_error, created, cors_preflight
)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for payout operations.
    Routes requests to appropriate handlers based on path and method.
    """
    try:
        # Handle CORS preflight
        if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
            return cors_preflight()

        # Extract routing info
        path = event.get('rawPath', '') or event.get('path', '')
        method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')

        # Remove trailing slash if present
        path = path.rstrip('/')

        # Route to appropriate handler
        if path == '/payouts/request' and method == 'POST':
            return handle_request_payout(event)
        elif path == '/payouts' and method == 'GET':
            return handle_list_payouts(event)
        elif path == '/payouts/balance' and method == 'GET':
            return handle_get_balance(event)
        else:
            return error('Endpoint not found', 404)

    except Exception as e:
        print(f"Unhandled error in payouts handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Internal server error')


def handle_request_payout(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /payouts/request
    Request a payout for an affiliate
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request('Invalid JSON body')

        # Validate required fields
        amount = body.get('amount')
        if not amount:
            return bad_request('amount is required')

        # Validate amount is positive integer
        try:
            amount = int(amount)
            if amount <= 0:
                return bad_request('amount must be a positive number')
        except (ValueError, TypeError):
            return bad_request('amount must be a valid number in cents')

        # Get affiliate record for this user
        affiliate = get_affiliate_by_user_id(user['user_id'])

        if not affiliate:
            return forbidden('You must be an affiliate to request payouts')

        # Check if user is an active affiliate
        if affiliate.get('status') != 'active':
            return forbidden('Your affiliate account is not active')

        # Calculate available balance
        balance_info = calculate_balance(affiliate['affiliate_id'])
        available = balance_info['available']

        # Validate amount doesn't exceed available balance
        if amount > available:
            return bad_request(
                f'Requested amount (${amount/100:.2f}) exceeds available balance (${available/100:.2f})'
            )

        # Optionally enforce minimum payout threshold
        MINIMUM_PAYOUT = 1000  # $10.00 minimum
        if amount < MINIMUM_PAYOUT:
            return bad_request(f'Minimum payout amount is ${MINIMUM_PAYOUT/100:.2f}')

        # Get payment info (from request body or affiliate record)
        payment_method = body.get('payment_method') or affiliate.get('payment_method')
        payment_email = body.get('payment_email') or affiliate.get('payment_email')

        if not payment_method:
            return bad_request('payment_method is required (paypal or zelle)')

        if payment_method not in ['paypal', 'zelle']:
            return bad_request('payment_method must be either paypal or zelle')

        if not payment_email:
            return bad_request('payment_email is required')

        # Create payout record
        now = datetime.utcnow().isoformat()
        payout_id = str(uuid.uuid4())

        payout_data = {
            'payout_id': payout_id,
            'affiliate_id': affiliate['affiliate_id'],
            'amount': amount,
            'payment_method': payment_method,
            'payment_email': payment_email,
            'status': 'pending',
            'transaction_id': None,
            'notes': None,
            'requested_at': now,
            'processed_at': None,
            'processed_by': None
        }

        # Save to database
        if not put_item('commercive_payouts', payout_data):
            return server_error('Failed to create payout request')

        # Return success with payout details
        return created({
            'payout': {
                'payout_id': payout_id,
                'amount': amount,
                'payment_method': payment_method,
                'payment_email': payment_email,
                'status': 'pending',
                'requested_at': now
            }
        }, 'Payout request submitted successfully')

    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in handle_request_payout: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to process payout request')


def handle_list_payouts(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /payouts
    List payout history for the authenticated affiliate
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get affiliate record for this user
        affiliate = get_affiliate_by_user_id(user['user_id'])

        if not affiliate:
            return forbidden('You must be an affiliate to view payouts')

        # Query payouts for this affiliate
        payouts = query(
            'commercive_payouts',
            index_name='affiliate-payouts-index',
            key_condition=Key('affiliate_id').eq(affiliate['affiliate_id']),
            scan_forward=False  # Most recent first
        )

        # Format payout data for response
        formatted_payouts = []
        for payout in payouts:
            formatted_payouts.append({
                'payout_id': payout['payout_id'],
                'amount': payout['amount'],
                'payment_method': payout['payment_method'],
                'payment_email': payout['payment_email'],
                'status': payout['status'],
                'transaction_id': payout.get('transaction_id'),
                'requested_at': payout['requested_at'],
                'processed_at': payout.get('processed_at'),
                'notes': payout.get('notes')
            })

        return success({
            'payouts': formatted_payouts,
            'total': len(formatted_payouts)
        })

    except Exception as e:
        print(f"Error in handle_list_payouts: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to retrieve payout history')


def handle_get_balance(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /payouts/balance
    Get available balance and breakdown for the authenticated affiliate
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get affiliate record for this user
        affiliate = get_affiliate_by_user_id(user['user_id'])

        if not affiliate:
            return forbidden('You must be an affiliate to view balance')

        # Calculate balance
        balance_info = calculate_balance(affiliate['affiliate_id'])

        return success({
            'balance': balance_info
        })

    except Exception as e:
        print(f"Error in handle_get_balance: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to retrieve balance')


# Helper functions

def get_affiliate_by_user_id(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get affiliate record by user_id

    Args:
        user_id: User ID

    Returns:
        Affiliate record if found, None otherwise
    """
    try:
        affiliates = query(
            'commercive_affiliates',
            index_name='user-affiliate-index',
            key_condition=Key('user_id').eq(user_id)
        )

        return affiliates[0] if affiliates else None
    except Exception as e:
        print(f"Error getting affiliate by user_id: {str(e)}")
        return None


def calculate_balance(affiliate_id: str) -> Dict[str, int]:
    """
    Calculate available balance for an affiliate

    Balance calculation:
    - total_earned: From affiliate record
    - total_paid: Sum of completed payouts
    - pending_payouts: Sum of pending/processing payouts
    - available: total_earned - total_paid - pending_payouts

    Args:
        affiliate_id: Affiliate ID

    Returns:
        Dict with balance breakdown (all amounts in cents)
    """
    try:
        # Get affiliate record for total_earned
        affiliate = get_item('commercive_affiliates', {'affiliate_id': affiliate_id})

        if not affiliate:
            raise ValueError('Affiliate not found')

        total_earned = affiliate.get('total_earned', 0)
        total_paid_from_record = affiliate.get('total_paid', 0)

        # Query all payouts for this affiliate
        payouts = query(
            'commercive_payouts',
            index_name='affiliate-payouts-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        # Calculate totals from payouts
        completed_amount = 0
        pending_amount = 0

        for payout in payouts:
            amount = payout.get('amount', 0)
            status = payout.get('status', '')

            if status == 'completed':
                completed_amount += amount
            elif status in ['pending', 'processing']:
                pending_amount += amount
            # 'failed' status doesn't count

        # Available balance
        available = total_earned - completed_amount - pending_amount

        # Ensure non-negative
        available = max(0, available)

        return {
            'total_earned': total_earned,
            'total_paid': completed_amount,
            'pending': pending_amount,
            'available': available
        }

    except Exception as e:
        print(f"Error calculating balance: {str(e)}")
        # Return zero balance on error
        return {
            'total_earned': 0,
            'total_paid': 0,
            'pending': 0,
            'available': 0
        }


def get_pending_payout_amount(affiliate_id: str) -> int:
    """
    Get total pending payout amount for an affiliate

    Args:
        affiliate_id: Affiliate ID

    Returns:
        Total pending amount in cents
    """
    try:
        payouts = query(
            'commercive_payouts',
            index_name='affiliate-payouts-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        pending = 0
        for payout in payouts:
            if payout.get('status') in ['pending', 'processing']:
                pending += payout.get('amount', 0)

        return pending

    except Exception as e:
        print(f"Error getting pending payout amount: {str(e)}")
        return 0
