
#endpoint: https://zsses6pi4hw52gxgvvmgl6mfie0bresq.lambda-url.us-east-1.on.aws/
"""
Commercive Leads Lambda Function
Handles lead submission and management operations

Endpoints:
- POST /leads/submit - Submit lead from form (PUBLIC, NO AUTH)
- GET /leads - List leads (requires auth)
- PUT /leads/{id}/status - Update lead status (requires auth)
- POST /leads/{id}/convert - Convert lead to commission (admin only)
"""

import json
import uuid
import re
from datetime import datetime
from typing import Any, Dict, Optional

from utils.auth import require_auth, require_admin
from utils.dynamodb import put_item, get_item, query, update_item
from utils.response import (
    success, error, created, bad_request, unauthorized,
    forbidden, not_found, server_error, cors_preflight
)
from boto3.dynamodb.conditions import Key


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for lead operations.
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
        if path == '/leads/submit' and method == 'POST':
            return submit_lead(event)
        elif path == '/leads' and method == 'GET':
            return list_leads(event)
        elif re.match(r'^/leads/[a-f0-9\-]+/status$', path) and method == 'PUT':
            lead_id = path.split('/')[-2]
            return update_lead_status(event, lead_id)
        elif re.match(r'^/leads/[a-f0-9\-]+/convert$', path) and method == 'POST':
            lead_id = path.split('/')[-2]
            return convert_lead(event, lead_id)
        else:
            return not_found('Endpoint not found')

    except Exception as e:
        print(f"Unhandled error in leads handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Internal server error')


def submit_lead(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /leads/submit
    PUBLIC endpoint - no auth required
    Submit lead from affiliate form
    """
    try:
        # Parse body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        # Validate required fields
        link_id = body.get('link_id')
        short_code = body.get('short_code')
        name = body.get('name', '').strip()
        email = body.get('email', '').strip()
        phone = body.get('phone', '').strip()
        company = body.get('company', '').strip()
        message = body.get('message', '').strip()

        # Must have either link_id or short_code
        if not link_id and not short_code:
            return bad_request('link_id or short_code is required')

        # Validate required fields
        if not name:
            return bad_request('name is required')
        if not email:
            return bad_request('email is required')
        if not phone:
            return bad_request('phone is required')

        # Validate email format
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            return bad_request('Invalid email format')

        # Lookup affiliate link
        affiliate_link = None
        if link_id:
            affiliate_link = get_item('commercive_affiliate_links', {'link_id': link_id})
        elif short_code:
            # Query by short_code using GSI
            results = query(
                'commercive_affiliate_links',
                index_name='short-code-index',
                key_condition=Key('short_code').eq(short_code)
            )
            if results:
                affiliate_link = results[0]

        # If link not found or inactive, still accept the lead but log it
        if not affiliate_link:
            print(f"Warning: Affiliate link not found for link_id={link_id}, short_code={short_code}")
            return bad_request('Invalid referral link')

        if not affiliate_link.get('is_active', False):
            return bad_request('This referral link is no longer active')

        affiliate_id = affiliate_link.get('affiliate_id')
        actual_link_id = affiliate_link.get('link_id')

        # Create lead record
        now = datetime.utcnow().isoformat()
        lead_id = str(uuid.uuid4())

        lead_data = {
            'lead_id': lead_id,
            'affiliate_id': affiliate_id,
            'link_id': actual_link_id,
            'name': name,
            'email': email,
            'phone': phone,
            'company': company,
            'message': message,
            'status': 'new',
            'notes': '',
            'converted_at': None,
            'created_at': now,
            'updated_at': now
        }

        # Save lead to database
        if not put_item('commercive_leads', lead_data):
            return server_error('Failed to save lead')

        # Increment leads_count on affiliate_link
        try:
            current_count = affiliate_link.get('leads_count', 0)
            update_item(
                'commercive_affiliate_links',
                {'link_id': actual_link_id},
                {
                    'leads_count': current_count + 1
                }
            )
        except Exception as e:
            print(f"Warning: Failed to increment leads_count: {e}")

        # Increment total_leads on affiliate
        try:
            affiliate = get_item('commercive_affiliates', {'affiliate_id': affiliate_id})
            if affiliate:
                current_total = affiliate.get('total_leads', 0)
                update_item(
                    'commercive_affiliates',
                    {'affiliate_id': affiliate_id},
                    {
                        'total_leads': current_total + 1,
                        'updated_at': now
                    }
                )
        except Exception as e:
            print(f"Warning: Failed to increment affiliate total_leads: {e}")

        # Return success (don't expose affiliate information)
        return created(
            message='Thank you for your submission! We will contact you soon.'
        )

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except ValueError as e:
        return bad_request(str(e))
    except Exception as e:
        print(f"Error in submit_lead: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to submit lead')


def list_leads(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /leads
    List leads for the authenticated user
    - If affiliate: show only their leads
    - If admin: show all leads (use admin endpoint instead)
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user.get('user_id')
        role = user.get('role', 'user')

        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        status_filter = query_params.get('status')

        # Lookup affiliate record for this user
        affiliate_results = query(
            'commercive_affiliates',
            index_name='user-affiliate-index',
            key_condition=Key('user_id').eq(user_id)
        )

        if not affiliate_results:
            # User is not an affiliate, return empty list
            return success(data={
                'leads': [],
                'total': 0
            })

        affiliate_id = affiliate_results[0].get('affiliate_id')

        # Query leads for this affiliate
        key_condition = Key('affiliate_id').eq(affiliate_id)

        leads = query(
            'commercive_leads',
            index_name='affiliate-leads-index',
            key_condition=key_condition,
            scan_forward=False  # Newest first
        )

        # Apply status filter if provided
        if status_filter:
            leads = [lead for lead in leads if lead.get('status') == status_filter]

        # Format leads (remove sensitive affiliate info)
        formatted_leads = []
        for lead in leads:
            formatted_leads.append({
                'lead_id': lead.get('lead_id'),
                'name': lead.get('name'),
                'email': lead.get('email'),
                'phone': lead.get('phone'),
                'company': lead.get('company'),
                'message': lead.get('message'),
                'status': lead.get('status'),
                'notes': lead.get('notes', ''),
                'created_at': lead.get('created_at'),
                'updated_at': lead.get('updated_at'),
                'converted_at': lead.get('converted_at')
            })

        return success(data={
            'leads': formatted_leads,
            'total': len(formatted_leads)
        })

    except Exception as e:
        print(f"Error in list_leads: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to retrieve leads')


def update_lead_status(event: Dict[str, Any], lead_id: str) -> Dict[str, Any]:
    """
    Handle PUT /leads/{id}/status
    Update lead status and notes
    User must own the lead (be the affiliate)
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        user_id = user.get('user_id')
        role = user.get('role', 'user')

        # Parse body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        status = body.get('status', '').strip()
        notes = body.get('notes', '').strip()

        # Validate status
        valid_statuses = ['new', 'contacted', 'converted', 'lost']
        if status and status not in valid_statuses:
            return bad_request(f'Invalid status. Must be one of: {", ".join(valid_statuses)}')

        # Get the lead
        lead = get_item('commercive_leads', {'lead_id': lead_id})
        if not lead:
            return not_found('Lead not found')

        # Check if user owns this lead (unless admin)
        if role != 'admin':
            # Lookup user's affiliate record
            affiliate_results = query(
                'commercive_affiliates',
                index_name='user-affiliate-index',
                key_condition=Key('user_id').eq(user_id)
            )

            if not affiliate_results:
                return forbidden('You do not have access to this lead')

            user_affiliate_id = affiliate_results[0].get('affiliate_id')
            lead_affiliate_id = lead.get('affiliate_id')

            if user_affiliate_id != lead_affiliate_id:
                return forbidden('You do not have access to this lead')

        # Update the lead
        updates = {
            'updated_at': datetime.utcnow().isoformat()
        }

        if status:
            updates['status'] = status
        if notes:
            updates['notes'] = notes

        if not update_item('commercive_leads', {'lead_id': lead_id}, updates):
            return server_error('Failed to update lead')

        # Get updated lead
        updated_lead = get_item('commercive_leads', {'lead_id': lead_id})

        return success(data={
            'lead': {
                'lead_id': updated_lead.get('lead_id'),
                'name': updated_lead.get('name'),
                'email': updated_lead.get('email'),
                'phone': updated_lead.get('phone'),
                'company': updated_lead.get('company'),
                'message': updated_lead.get('message'),
                'status': updated_lead.get('status'),
                'notes': updated_lead.get('notes', ''),
                'created_at': updated_lead.get('created_at'),
                'updated_at': updated_lead.get('updated_at'),
                'converted_at': updated_lead.get('converted_at')
            }
        }, message='Lead updated successfully')

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in update_lead_status: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to update lead')


def convert_lead(event: Dict[str, Any], lead_id: str) -> Dict[str, Any]:
    """
    Handle POST /leads/{id}/convert
    Convert lead to commission (admin only)
    """
    try:
        # Require admin authentication
        user, auth_error = require_admin(event)
        if auth_error:
            return auth_error

        admin_user_id = user.get('user_id')

        # Parse body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}

        amount = body.get('amount')
        description = body.get('description', '').strip()

        # Validate amount
        if not amount:
            return bad_request('amount is required')

        try:
            amount = int(amount)
            if amount <= 0:
                return bad_request('amount must be greater than 0')
        except (ValueError, TypeError):
            return bad_request('amount must be a valid integer (in cents)')

        # Get the lead
        lead = get_item('commercive_leads', {'lead_id': lead_id})
        if not lead:
            return not_found('Lead not found')

        # Check if already converted
        if lead.get('status') == 'converted':
            return bad_request('Lead has already been converted')

        affiliate_id = lead.get('affiliate_id')
        now = datetime.utcnow().isoformat()

        # Create commission record
        commission_id = str(uuid.uuid4())
        commission_data = {
            'commission_id': commission_id,
            'affiliate_id': affiliate_id,
            'lead_id': lead_id,
            'description': description or f'Commission from lead: {lead.get("name")}',
            'amount': amount,
            'status': 'pending',
            'payout_id': None,
            'created_at': now,
            'updated_at': now
        }

        if not put_item('commercive_commissions', commission_data):
            return server_error('Failed to create commission')

        # Update lead status to converted
        lead_updates = {
            'status': 'converted',
            'converted_at': now,
            'updated_at': now
        }

        if not update_item('commercive_leads', {'lead_id': lead_id}, lead_updates):
            # Rollback commission creation would be ideal, but DynamoDB doesn't support transactions easily
            print(f"Warning: Commission created but failed to update lead status for lead_id={lead_id}")

        # Update affiliate totals
        try:
            affiliate = get_item('commercive_affiliates', {'affiliate_id': affiliate_id})
            if affiliate:
                total_conversions = affiliate.get('total_conversions', 0)
                total_earned = affiliate.get('total_earned', 0)

                update_item(
                    'commercive_affiliates',
                    {'affiliate_id': affiliate_id},
                    {
                        'total_conversions': total_conversions + 1,
                        'total_earned': total_earned + amount,
                        'updated_at': now
                    }
                )
        except Exception as e:
            print(f"Warning: Failed to update affiliate totals: {e}")

        # Increment conversions_count on affiliate_link
        try:
            link_id = lead.get('link_id')
            if link_id:
                link = get_item('commercive_affiliate_links', {'link_id': link_id})
                if link:
                    current_conversions = link.get('conversions_count', 0)
                    update_item(
                        'commercive_affiliate_links',
                        {'link_id': link_id},
                        {
                            'conversions_count': current_conversions + 1
                        }
                    )
        except Exception as e:
            print(f"Warning: Failed to increment link conversions_count: {e}")

        return created(data={
            'commission': {
                'commission_id': commission_id,
                'affiliate_id': affiliate_id,
                'lead_id': lead_id,
                'amount': amount,
                'status': 'pending',
                'description': commission_data['description'],
                'created_at': now
            }
        }, message='Lead converted to commission successfully')

    except json.JSONDecodeError:
        return bad_request('Invalid JSON body')
    except Exception as e:
        print(f"Error in convert_lead: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error('Failed to convert lead')
