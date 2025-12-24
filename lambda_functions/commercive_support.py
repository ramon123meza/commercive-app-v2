#endpoint: https://noc4ynujdzflg225dx2rt3zxua0tmvim.lambda-url.us-east-1.on.aws/
"""
Commercive Support Lambda Function
Handles support ticket creation, messaging, and AI assistance

Endpoints:
- POST /support/tickets - Create support ticket
- GET /support/tickets - List user's tickets
- POST /support/tickets/{ticket_id}/messages - Send message to ticket
- GET /support/tickets/{ticket_id}/messages - Get ticket messages
- POST /support/ai-response - Generate AI response
"""

import json
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

# Import shared utilities
from utils.auth import require_auth, require_admin
from utils.dynamodb import put_item, get_item, query, update_item
from utils.response import (
    success, error, created, bad_request, unauthorized,
    not_found, forbidden, server_error
)
from boto3.dynamodb.conditions import Key


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Unified Lambda handler for support operations.
    Routes requests to appropriate handlers based on path and method.
    """
    try:
        # Extract routing info
        path = event.get('rawPath', '') or event.get('path', '')
        method = event.get('requestContext', {}).get('http', {}).get('method', '') or event.get('httpMethod', 'GET')

        print(f"Support Lambda - Method: {method}, Path: {path}")

        # Route to appropriate handler
        if path == '/support/tickets' and method == 'POST':
            return handle_create_ticket(event)
        elif path == '/support/tickets' and method == 'GET':
            return handle_list_tickets(event)
        elif re.match(r'^/support/tickets/[\w-]+/messages$', path) and method == 'POST':
            return handle_send_message(event, path)
        elif re.match(r'^/support/tickets/[\w-]+/messages$', path) and method == 'GET':
            return handle_get_messages(event, path)
        elif path == '/support/ai-response' and method == 'POST':
            return handle_ai_response(event)
        else:
            return not_found(f"Route not found: {method} {path}")

    except Exception as e:
        print(f"Unhandled error in support handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Internal server error")


def handle_create_ticket(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /support/tickets
    Create a new support ticket
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request("Invalid JSON body")

        # Validate required fields
        subject = body.get('subject', '').strip()
        if not subject:
            return bad_request("subject is required")

        if len(subject) < 5:
            return bad_request("subject must be at least 5 characters")

        # Validate priority (optional, default to 'medium')
        priority = body.get('priority', 'medium').lower()
        if priority not in ['low', 'medium', 'high']:
            priority = 'medium'

        # Get initial message (optional)
        initial_message = body.get('message', '').strip()

        # Create ticket
        ticket_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        ticket_data = {
            'ticket_id': ticket_id,
            'user_id': user['user_id'],
            'subject': subject,
            'status': 'open',
            'priority': priority,
            'created_at': now,
            'updated_at': now
        }

        # Save ticket to DynamoDB
        if not put_item('commercive_support_tickets', ticket_data):
            return server_error("Failed to create ticket")

        # If there's an initial message, create it
        if initial_message:
            message_data = {
                'message_id': str(uuid.uuid4()),
                'ticket_id': ticket_id,
                'sender_id': user['user_id'],
                'sender_type': 'user',
                'message': initial_message,
                'is_ai_response': False,
                'created_at': now
            }
            put_item('commercive_support_messages', message_data)

        return created({
            'ticket': {
                'ticket_id': ticket_id,
                'subject': subject,
                'status': 'open',
                'priority': priority,
                'created_at': now
            }
        }, "Support ticket created successfully")

    except Exception as e:
        print(f"Error in handle_create_ticket: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Failed to create ticket")


def handle_list_tickets(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    GET /support/tickets
    List user's support tickets with optional status filter
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        status_filter = query_params.get('status', '').lower() if query_params.get('status') else None

        # Query tickets by user_id using GSI
        tickets = query(
            'commercive_support_tickets',
            index_name='user-tickets-index',
            key_condition=Key('user_id').eq(user['user_id']),
            scan_forward=False  # Most recent first
        )

        # Apply status filter if provided
        if status_filter and status_filter in ['open', 'pending', 'closed']:
            tickets = [t for t in tickets if t.get('status') == status_filter]

        # For each ticket, get the last message
        for ticket in tickets:
            messages = query(
                'commercive_support_messages',
                index_name='ticket-messages-index',
                key_condition=Key('ticket_id').eq(ticket['ticket_id']),
                scan_forward=False,  # Most recent first
                limit=1
            )
            if messages:
                ticket['last_message'] = messages[0].get('message', '')
                ticket['last_message_at'] = messages[0].get('created_at', '')
            else:
                ticket['last_message'] = None
                ticket['last_message_at'] = None

        return success({
            'tickets': tickets,
            'count': len(tickets)
        })

    except Exception as e:
        print(f"Error in handle_list_tickets: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Failed to retrieve tickets")


def handle_send_message(event: Dict[str, Any], path: str) -> Dict[str, Any]:
    """
    POST /support/tickets/{ticket_id}/messages
    Send a message to a support ticket
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Extract ticket_id from path
        ticket_id = path.split('/')[-2]

        # Verify ticket exists and user owns it (or is admin)
        ticket = get_item('commercive_support_tickets', {'ticket_id': ticket_id})
        if not ticket:
            return not_found("Ticket not found")

        # Check ownership (unless admin)
        is_admin = user.get('role') == 'admin'
        if not is_admin and ticket['user_id'] != user['user_id']:
            return forbidden("You don't have access to this ticket")

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request("Invalid JSON body")

        # Validate message
        message_text = body.get('message', '').strip()
        if not message_text:
            return bad_request("message is required")

        if len(message_text) < 1:
            return bad_request("message cannot be empty")

        # Optional attachment URL
        attachment_url = body.get('attachment_url', '').strip() or None

        # Determine sender type
        sender_type = 'admin' if is_admin else 'user'

        # Create message
        message_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        message_data = {
            'message_id': message_id,
            'ticket_id': ticket_id,
            'sender_id': user['user_id'],
            'sender_type': sender_type,
            'message': message_text,
            'attachment_url': attachment_url,
            'is_ai_response': False,
            'created_at': now
        }

        # Save message
        if not put_item('commercive_support_messages', message_data):
            return server_error("Failed to send message")

        # Update ticket's updated_at timestamp
        update_item(
            'commercive_support_tickets',
            {'ticket_id': ticket_id},
            {'updated_at': now}
        )

        # If admin is closing the ticket, update status
        if is_admin and body.get('close_ticket', False):
            update_item(
                'commercive_support_tickets',
                {'ticket_id': ticket_id},
                {
                    'status': 'closed',
                    'closed_at': now
                }
            )

        return created({
            'message': {
                'message_id': message_id,
                'ticket_id': ticket_id,
                'message': message_text,
                'sender_type': sender_type,
                'created_at': now
            }
        }, "Message sent successfully")

    except Exception as e:
        print(f"Error in handle_send_message: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Failed to send message")


def handle_get_messages(event: Dict[str, Any], path: str) -> Dict[str, Any]:
    """
    GET /support/tickets/{ticket_id}/messages
    Get all messages for a support ticket in chronological order
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Extract ticket_id from path
        ticket_id = path.split('/')[-2]

        # Verify ticket exists and user owns it (or is admin)
        ticket = get_item('commercive_support_tickets', {'ticket_id': ticket_id})
        if not ticket:
            return not_found("Ticket not found")

        # Check ownership (unless admin)
        is_admin = user.get('role') == 'admin'
        if not is_admin and ticket['user_id'] != user['user_id']:
            return forbidden("You don't have access to this ticket")

        # Query messages for this ticket
        messages = query(
            'commercive_support_messages',
            index_name='ticket-messages-index',
            key_condition=Key('ticket_id').eq(ticket_id),
            scan_forward=True  # Chronological order (oldest first)
        )

        # Enrich messages with sender information
        # For a production app, we'd fetch user details
        # For now, we'll just include what we have
        for message in messages:
            sender_id = message.get('sender_id', '')

            # Get sender name from users table
            sender = get_item('commercive_users', {'user_id': sender_id})
            if sender:
                message['sender_name'] = f"{sender.get('first_name', '')} {sender.get('last_name', '')}".strip()
                message['sender_email'] = sender.get('email', '')
            else:
                message['sender_name'] = 'Unknown'
                message['sender_email'] = ''

        return success({
            'ticket': {
                'ticket_id': ticket['ticket_id'],
                'subject': ticket['subject'],
                'status': ticket['status'],
                'priority': ticket['priority'],
                'created_at': ticket['created_at']
            },
            'messages': messages,
            'count': len(messages)
        })

    except Exception as e:
        print(f"Error in handle_get_messages: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Failed to retrieve messages")


def handle_ai_response(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    POST /support/ai-response
    Generate an AI-powered support response

    This is a placeholder for AI integration.
    In production, this would integrate with OpenAI, Claude, or another LLM.
    """
    try:
        # Require authentication
        user, auth_error = require_auth(event)
        if auth_error:
            return auth_error

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return bad_request("Invalid JSON body")

        # Get the message/question
        message = body.get('message', '').strip()
        if not message:
            return bad_request("message is required")

        # Get optional ticket_id context
        ticket_id = body.get('ticket_id', '').strip() or None

        # Placeholder AI response logic
        # In production, this would call an AI API
        ai_response = generate_ai_support_response(message, ticket_id)

        # If ticket_id is provided and add_to_ticket is true, save the response
        if ticket_id and body.get('add_to_ticket', False):
            # Verify ticket exists and user has access
            ticket = get_item('commercive_support_tickets', {'ticket_id': ticket_id})
            if ticket and (ticket['user_id'] == user['user_id'] or user.get('role') == 'admin'):
                # Create AI message
                message_data = {
                    'message_id': str(uuid.uuid4()),
                    'ticket_id': ticket_id,
                    'sender_id': 'system',
                    'sender_type': 'system',
                    'message': ai_response,
                    'is_ai_response': True,
                    'created_at': datetime.utcnow().isoformat()
                }
                put_item('commercive_support_messages', message_data)

        return success({
            'response': ai_response,
            'is_ai_generated': True,
            'confidence': 'high'  # Placeholder
        })

    except Exception as e:
        print(f"Error in handle_ai_response: {str(e)}")
        import traceback
        traceback.print_exc()
        return server_error("Failed to generate AI response")


def generate_ai_support_response(message: str, ticket_id: Optional[str] = None) -> str:
    """
    Generate AI support response (placeholder implementation)

    In production, this would integrate with:
    - OpenAI GPT-4 API
    - Anthropic Claude API
    - Custom fine-tuned model

    Args:
        message: User's question/message
        ticket_id: Optional ticket context

    Returns:
        AI-generated response text
    """
    # Placeholder responses based on keywords
    message_lower = message.lower()

    # Common support topics
    if 'inventory' in message_lower or 'product' in message_lower or 'stock' in message_lower:
        return (
            "I can help you with inventory questions! Here are some common solutions:\n\n"
            "1. **Syncing Issues**: Try going to your store settings and clicking 'Force Sync Inventory'\n"
            "2. **Missing Products**: Ensure your Shopify products are published and have inventory tracked\n"
            "3. **Low Stock Alerts**: You can set custom thresholds in the inventory settings\n\n"
            "If you need more specific help, please provide details about which store and products are affected."
        )

    elif 'order' in message_lower or 'tracking' in message_lower or 'shipment' in message_lower:
        return (
            "For order and tracking questions:\n\n"
            "1. **Order Status**: Check the Orders page in your dashboard\n"
            "2. **Tracking Numbers**: These are automatically synced from Shopify when fulfillments are created\n"
            "3. **Missing Orders**: Make sure webhooks are properly registered in your store settings\n\n"
            "Need more help? Let me know which order number you're looking for."
        )

    elif 'connect' in message_lower or 'shopify' in message_lower or 'store' in message_lower:
        return (
            "To connect your Shopify store:\n\n"
            "1. Go to the Shopify App Store\n"
            "2. Search for 'Commercive'\n"
            "3. Click 'Add app' and approve permissions\n"
            "4. Return to your Commercive dashboard to complete setup\n\n"
            "If you already installed the app but don't see your store, try logging out and back in."
        )

    elif 'affiliate' in message_lower or 'commission' in message_lower or 'lead' in message_lower:
        return (
            "Regarding affiliate program questions:\n\n"
            "1. **Generating Links**: Go to Partners > My Links and click 'Create New Link'\n"
            "2. **Tracking Leads**: All leads from your links appear in the Partners dashboard\n"
            "3. **Commissions**: View your earnings in the Partners > Earnings section\n"
            "4. **Payouts**: Request payout when balance meets minimum threshold\n\n"
            "Have a specific question? I'm here to help!"
        )

    elif 'payout' in message_lower or 'payment' in message_lower or 'withdraw' in message_lower:
        return (
            "For payout and payment questions:\n\n"
            "1. **Request Payout**: Go to Partners > Payouts and click 'Request Payout'\n"
            "2. **Minimum Amount**: Minimum payout is $50 (5000 cents)\n"
            "3. **Payment Methods**: We support PayPal and Zelle\n"
            "4. **Processing Time**: Payouts are typically processed within 3-5 business days\n\n"
            "Make sure your payment information is up to date in your profile settings."
        )

    elif 'login' in message_lower or 'password' in message_lower or 'account' in message_lower:
        return (
            "Account access help:\n\n"
            "1. **Forgot Password**: Use the 'Forgot Password' link on the login page\n"
            "2. **Email Not Found**: Make sure you're using the email you registered with\n"
            "3. **Account Pending**: New accounts need admin approval (usually within 24 hours)\n"
            "4. **Can't Login**: Clear browser cache/cookies or try a different browser\n\n"
            "Still having trouble? Our support team can help reset your account."
        )

    else:
        # Generic helpful response
        return (
            "Thank you for reaching out! I'm here to help.\n\n"
            "Common topics I can assist with:\n"
            "- Inventory syncing and management\n"
            "- Order tracking and fulfillment\n"
            "- Connecting Shopify stores\n"
            "- Affiliate program and commissions\n"
            "- Payout requests\n"
            "- Account and login issues\n\n"
            "Could you provide more details about what you need help with? "
            "A member of our support team will also review your ticket and respond shortly."
        )
