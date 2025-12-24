
#endpoint: https://s7r2anp5hw36hsc4lydo4r55mq0eckul.lambda-url.us-east-1.on.aws/
"""
Lambda function for affiliate operations
Handles 5 endpoints:
- GET /affiliates/dashboard - Dashboard stats
- POST /affiliates/links - Generate new referral link
- GET /affiliates/links - List affiliate's links
- GET /affiliates/stats - Get performance stats
- POST /affiliates/invite - Send affiliate invitation
"""

import json
import os
import re
import uuid
import random
import string
from datetime import datetime
from typing import Any, Dict, Optional
from boto3.dynamodb.conditions import Key

from utils.auth import require_auth
from utils.dynamodb import get_item, put_item, query, update_item
from utils.response import (
    success, error, bad_request, unauthorized,
    forbidden, not_found, created, cors_preflight
)
from utils.email import send_email


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for affiliate operations.
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
        if path == '/affiliates/dashboard' and method == 'GET':
            return handle_get_dashboard(event)
        elif path == '/affiliates/links' and method == 'GET':
            return handle_list_links(event)
        elif path == '/affiliates/links' and method == 'POST':
            return handle_generate_link(event)
        elif path == '/affiliates/stats' and method == 'GET':
            return handle_get_stats(event)
        elif path == '/affiliates/invite' and method == 'POST':
            return handle_send_invitation(event)
        else:
            return not_found("Endpoint not found")

    except Exception as e:
        print(f"Unhandled error in affiliates handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Internal server error', 500)


# ============================================================================
# Endpoint Handlers
# ============================================================================

def handle_get_dashboard(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /affiliates/dashboard
    Get affiliate dashboard statistics
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Verify user is an affiliate
        if not user.get('is_affiliate'):
            return forbidden("Affiliate access required")

        user_id = user['user_id']

        # Get affiliate record
        affiliates = query(
            'commercive_affiliates',
            index_name='user-affiliate-index',
            key_condition=Key('user_id').eq(user_id)
        )

        if not affiliates:
            return not_found("Affiliate record not found")

        affiliate = affiliates[0]
        affiliate_id = affiliate['affiliate_id']

        # Calculate this month's stats
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Get all leads for this affiliate
        all_leads = query(
            'commercive_leads',
            index_name='affiliate-leads-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        # Get this month's leads
        month_leads = [
            lead for lead in all_leads
            if lead.get('created_at', '') >= month_start
        ]

        # Count conversions
        total_conversions = sum(1 for lead in all_leads if lead.get('status') == 'converted')
        month_conversions = sum(1 for lead in month_leads if lead.get('status') == 'converted')

        # Calculate conversion rate
        total_leads_count = len(all_leads)
        conversion_rate = (total_conversions / total_leads_count * 100) if total_leads_count > 0 else 0

        # Get commission data for earnings
        all_commissions = query(
            'commercive_commissions',
            index_name='affiliate-commissions-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        month_commissions = [
            comm for comm in all_commissions
            if comm.get('created_at', '') >= month_start
        ]

        # Calculate earnings
        total_earned = sum(comm.get('amount', 0) for comm in all_commissions if comm.get('status') in ['approved', 'paid'])
        month_earned = sum(comm.get('amount', 0) for comm in month_commissions if comm.get('status') in ['approved', 'paid'])
        total_paid = sum(comm.get('amount', 0) for comm in all_commissions if comm.get('status') == 'paid')

        # Calculate available balance (approved but not paid)
        available_balance = sum(
            comm.get('amount', 0) for comm in all_commissions
            if comm.get('status') == 'approved'
        )

        # Calculate pending payout (requested but not processed)
        pending_payout = sum(
            comm.get('amount', 0) for comm in all_commissions
            if comm.get('status') == 'pending'
        )

        # Build dashboard response
        dashboard_data = {
            'affiliate_id': affiliate_id,
            'total_leads': total_leads_count,
            'leads_this_month': len(month_leads),
            'total_conversions': total_conversions,
            'conversions_this_month': month_conversions,
            'conversion_rate': round(conversion_rate, 2),
            'total_earned': total_earned,
            'earned_this_month': month_earned,
            'total_paid': total_paid,
            'available_balance': available_balance,
            'pending_payout': pending_payout
        }

        return success(data={'dashboard': dashboard_data})

    except Exception as e:
        print(f"Error in handle_get_dashboard: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Failed to fetch dashboard data', 500)


def handle_list_links(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /affiliates/links
    List all referral links for the affiliate
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Verify user is an affiliate
        if not user.get('is_affiliate'):
            return forbidden("Affiliate access required")

        user_id = user['user_id']

        # Get affiliate record
        affiliates = query(
            'commercive_affiliates',
            index_name='user-affiliate-index',
            key_condition=Key('user_id').eq(user_id)
        )

        if not affiliates:
            return not_found("Affiliate record not found")

        affiliate_id = affiliates[0]['affiliate_id']

        # Get all links for this affiliate
        links = query(
            'commercive_affiliate_links',
            index_name='affiliate-links-index',
            key_condition=Key('affiliate_id').eq(affiliate_id),
            scan_forward=False  # Most recent first
        )

        # Format links with full URL
        base_url = os.environ.get('AFFILIATE_FORM_BASE_URL', 'https://form.commercive.co')
        formatted_links = []

        for link in links:
            formatted_links.append({
                'link_id': link['link_id'],
                'short_code': link['short_code'],
                'full_url': f"{base_url}?ref={link['short_code']}",
                'name': link.get('name', ''),
                'leads_count': link.get('leads_count', 0),
                'conversions_count': link.get('conversions_count', 0),
                'is_active': link.get('is_active', True),
                'created_at': link.get('created_at', '')
            })

        return success(data={'links': formatted_links})

    except Exception as e:
        print(f"Error in handle_list_links: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Failed to fetch links', 500)


def handle_generate_link(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /affiliates/links
    Generate a new referral link
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Verify user is an affiliate
        if not user.get('is_affiliate'):
            return forbidden("Affiliate access required")

        user_id = user['user_id']

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request("Invalid JSON body")

        # Validate input
        name = body.get('name', '').strip()
        if not name:
            return bad_request("Link name is required")

        if len(name) > 100:
            return bad_request("Link name must be 100 characters or less")

        # Get affiliate record
        affiliates = query(
            'commercive_affiliates',
            index_name='user-affiliate-index',
            key_condition=Key('user_id').eq(user_id)
        )

        if not affiliates:
            return not_found("Affiliate record not found")

        affiliate_id = affiliates[0]['affiliate_id']

        # Generate unique short code (6 characters: alphanumeric)
        short_code = generate_unique_short_code()

        # Create link record
        now = datetime.utcnow().isoformat()
        link_id = str(uuid.uuid4())

        link_data = {
            'link_id': link_id,
            'affiliate_id': affiliate_id,
            'short_code': short_code,
            'name': name,
            'leads_count': 0,
            'conversions_count': 0,
            'is_active': True,
            'created_at': now
        }

        success_put = put_item('commercive_affiliate_links', link_data)

        if not success_put:
            return error('Failed to create link', 500)

        # Format response with full URL
        base_url = os.environ.get('AFFILIATE_FORM_BASE_URL', 'https://form.commercive.co')

        link_response = {
            'link_id': link_id,
            'short_code': short_code,
            'full_url': f"{base_url}?ref={short_code}",
            'name': name,
            'created_at': now
        }

        return created(data={'link': link_response}, message="Link created successfully")

    except Exception as e:
        print(f"Error in handle_generate_link: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Failed to generate link', 500)


def handle_get_stats(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /affiliates/stats
    Get detailed performance statistics
    Query params:
    - link_id (optional): Get stats for specific link
    - date_from (optional): Filter from date
    - date_to (optional): Filter to date
    """
    try:
        # Verify authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Verify user is an affiliate
        if not user.get('is_affiliate'):
            return forbidden("Affiliate access required")

        user_id = user['user_id']

        # Get query parameters
        query_params = event.get('queryStringParameters', {}) or {}
        link_id_filter = query_params.get('link_id')
        date_from = query_params.get('date_from')
        date_to = query_params.get('date_to')

        # Get affiliate record
        affiliates = query(
            'commercive_affiliates',
            index_name='user-affiliate-index',
            key_condition=Key('user_id').eq(user_id)
        )

        if not affiliates:
            return not_found("Affiliate record not found")

        affiliate_id = affiliates[0]['affiliate_id']

        # Get all links for this affiliate
        links = query(
            'commercive_affiliate_links',
            index_name='affiliate-links-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        # Filter links if link_id specified
        if link_id_filter:
            links = [link for link in links if link['link_id'] == link_id_filter]
            if not links:
                return not_found("Link not found")

        # Get all leads for this affiliate
        all_leads = query(
            'commercive_leads',
            index_name='affiliate-leads-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        # Filter by date range if specified
        if date_from:
            all_leads = [lead for lead in all_leads if lead.get('created_at', '') >= date_from]
        if date_to:
            all_leads = [lead for lead in all_leads if lead.get('created_at', '') <= date_to]

        # Get commissions for earnings data
        all_commissions = query(
            'commercive_commissions',
            index_name='affiliate-commissions-index',
            key_condition=Key('affiliate_id').eq(affiliate_id)
        )

        # Build stats by link
        stats_by_link = []
        for link in links:
            link_leads = [lead for lead in all_leads if lead.get('link_id') == link['link_id']]
            link_conversions = [lead for lead in link_leads if lead.get('status') == 'converted']

            # Calculate earnings for this link
            link_lead_ids = [lead['lead_id'] for lead in link_conversions]
            link_earnings = sum(
                comm.get('amount', 0) for comm in all_commissions
                if comm.get('lead_id') in link_lead_ids and comm.get('status') in ['approved', 'paid']
            )

            stats_by_link.append({
                'link_id': link['link_id'],
                'name': link.get('name', ''),
                'short_code': link['short_code'],
                'leads': len(link_leads),
                'conversions': len(link_conversions),
                'conversion_rate': round((len(link_conversions) / len(link_leads) * 100) if link_leads else 0, 2),
                'earnings': link_earnings
            })

        # Build stats by month
        stats_by_month = {}
        for lead in all_leads:
            # Extract year-month from created_at (ISO format: 2025-01-15T...)
            created_at = lead.get('created_at', '')
            if created_at and len(created_at) >= 7:
                month_key = created_at[:7]  # "2025-01"

                if month_key not in stats_by_month:
                    stats_by_month[month_key] = {
                        'month': month_key,
                        'leads': 0,
                        'conversions': 0,
                        'earnings': 0
                    }

                stats_by_month[month_key]['leads'] += 1

                if lead.get('status') == 'converted':
                    stats_by_month[month_key]['conversions'] += 1

                    # Add earnings for this conversion
                    lead_commissions = [
                        comm for comm in all_commissions
                        if comm.get('lead_id') == lead['lead_id'] and comm.get('status') in ['approved', 'paid']
                    ]
                    stats_by_month[month_key]['earnings'] += sum(comm.get('amount', 0) for comm in lead_commissions)

        # Convert month stats to sorted list
        month_stats_list = sorted(stats_by_month.values(), key=lambda x: x['month'], reverse=True)

        stats_response = {
            'by_link': stats_by_link,
            'by_month': month_stats_list
        }

        return success(data={'stats': stats_response})

    except Exception as e:
        print(f"Error in handle_get_stats: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Failed to fetch stats', 500)


def handle_send_invitation(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /affiliates/invite
    Send invitation to a prospect via email
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
            return bad_request("Invalid JSON body")

        # Validate input
        email = body.get('email', '').strip().lower()
        name = body.get('name', '').strip()

        if not email:
            return bad_request("Email is required")

        if not name:
            return bad_request("Name is required")

        # Basic email validation
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            return bad_request("Invalid email format")

        # Get sender's name for personalization
        sender_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get('email', 'A Commercive partner')

        # Send invitation email
        subject = f"{sender_name} invited you to join Commercive"

        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #8e52f2 0%, #5B21B6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #8e52f2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>You're Invited to Commercive!</h1>
                </div>
                <div class="content">
                    <p>Hi {name},</p>

                    <p><strong>{sender_name}</strong> thinks you'd be a great fit for Commercive's affiliate program.</p>

                    <p>Commercive is a leading logistics company offering competitive commission rates for referrals. Join our network of successful affiliates and start earning today!</p>

                    <p><strong>Benefits:</strong></p>
                    <ul>
                        <li>Competitive commission rates</li>
                        <li>Real-time tracking dashboard</li>
                        <li>Fast payout processing</li>
                        <li>Dedicated support team</li>
                    </ul>

                    <p style="text-align: center;">
                        <a href="https://dashboard.commercive.co/signup" class="button">Join Commercive</a>
                    </p>

                    <p>Questions? Reply to this email or visit our website for more information.</p>

                    <p>Best regards,<br>The Commercive Team</p>
                </div>
                <div class="footer">
                    <p>Commercive - Professional Logistics Solutions</p>
                </div>
            </div>
        </body>
        </html>
        """

        text_body = f"""
Hi {name},

{sender_name} thinks you'd be a great fit for Commercive's affiliate program.

Commercive is a leading logistics company offering competitive commission rates for referrals. Join our network of successful affiliates and start earning today!

Benefits:
- Competitive commission rates
- Real-time tracking dashboard
- Fast payout processing
- Dedicated support team

Join Commercive: https://dashboard.commercive.co/signup

Questions? Reply to this email or visit our website for more information.

Best regards,
The Commercive Team

Commercive - Professional Logistics Solutions
        """

        try:
            send_email(
                to=email,
                subject=subject,
                body_html=html_body,
                body_text=text_body
            )
        except Exception as email_error:
            print(f"Error sending invitation email: {email_error}")
            return error('Failed to send invitation email', 500)

        return success(message="Invitation sent successfully")

    except Exception as e:
        print(f"Error in handle_send_invitation: {str(e)}")
        import traceback
        traceback.print_exc()
        return error('Failed to send invitation', 500)


# ============================================================================
# Helper Functions
# ============================================================================

def generate_unique_short_code() -> str:
    """
    Generate a unique 6-character alphanumeric short code
    Retry if collision occurs (very unlikely)
    """
    max_attempts = 10

    for _ in range(max_attempts):
        # Generate random 6-character code (uppercase + digits)
        chars = string.ascii_uppercase + string.digits
        short_code = ''.join(random.choices(chars, k=6))

        # Check if code already exists
        existing_links = query(
            'commercive_affiliate_links',
            index_name='short-code-index',
            key_condition=Key('short_code').eq(short_code)
        )

        if not existing_links:
            return short_code

    # Fallback: use UUID if we somehow can't generate unique code
    return str(uuid.uuid4())[:6].upper()
