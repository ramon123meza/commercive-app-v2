# Commercive Support Lambda Function - Implementation Summary

## File Location
`/home/rcardonameza/_full_system_commercive/CLAUDE_AUTONOMOUS_PROJECT/lambda_functions/commercive_support.py`

## Overview
Unified Lambda function handling all support ticket operations with 5 endpoints and AI-powered assistance.

## Endpoints Implemented

### 1. POST /support/tickets - Create Support Ticket
- **Authentication**: Required (JWT)
- **Request Body**:
  ```json
  {
    "subject": "Need help with inventory",
    "priority": "low|medium|high",
    "message": "Optional initial message"
  }
  ```
- **Validation**:
  - `subject` required, minimum 5 characters
  - `priority` defaults to 'medium' if invalid
  - Creates ticket with status='open'
- **Response**: Returns ticket ID and details
- **Database**: Creates record in `commercive_support_tickets`

### 2. GET /support/tickets - List User's Tickets
- **Authentication**: Required (JWT)
- **Query Parameters**:
  - `status` (optional) - Filter by 'open', 'pending', or 'closed'
- **Features**:
  - Uses `user-tickets-index` GSI for efficient lookup
  - Returns tickets sorted by most recent first
  - Includes last message preview for each ticket
- **Response**: Array of tickets with metadata

### 3. POST /support/tickets/{ticket_id}/messages - Send Message
- **Authentication**: Required (JWT)
- **Path Parameter**: `ticket_id`
- **Request Body**:
  ```json
  {
    "message": "Message content",
    "attachment_url": "Optional S3 URL",
    "close_ticket": false
  }
  ```
- **Authorization**:
  - User must own the ticket OR be an admin
  - Returns 403 Forbidden if not authorized
- **Features**:
  - Determines sender_type ('user' or 'admin')
  - Updates ticket's `updated_at` timestamp
  - Admins can close tickets with `close_ticket: true`
- **Database**: Creates record in `commercive_support_messages`

### 4. GET /support/tickets/{ticket_id}/messages - Get Ticket Messages
- **Authentication**: Required (JWT)
- **Path Parameter**: `ticket_id`
- **Authorization**: User must own ticket OR be admin
- **Features**:
  - Returns messages in chronological order (oldest first)
  - Enriches messages with sender name/email from users table
  - Includes ticket metadata (subject, status, priority)
- **Response**: Ticket info + array of messages

### 5. POST /support/ai-response - Generate AI Response
- **Authentication**: Required (JWT)
- **Request Body**:
  ```json
  {
    "message": "User question",
    "ticket_id": "Optional ticket context",
    "add_to_ticket": false
  }
  ```
- **Features**:
  - Generates helpful AI responses based on keywords
  - Supports common topics: inventory, orders, affiliate, payouts, login
  - Can optionally add AI response directly to ticket
  - Marks responses with `is_ai_response: true`
- **Implementation**: Currently uses keyword-based placeholder logic
- **Production Ready**: Structured for easy OpenAI/Claude API integration

## AI Response Topics Covered

The AI assistant provides helpful responses for:
1. **Inventory & Products** - Syncing, missing products, low stock alerts
2. **Orders & Tracking** - Order status, tracking numbers, missing orders
3. **Store Connection** - Shopify app installation and setup
4. **Affiliate Program** - Link generation, lead tracking, commissions
5. **Payouts** - Request process, minimums, payment methods
6. **Account Access** - Login issues, password reset, pending approvals
7. **Generic Fallback** - Helpful topic list when query unclear

## Security Features

1. **JWT Authentication**: All endpoints require valid JWT token
2. **Ownership Verification**: Users can only access their own tickets
3. **Admin Override**: Admins can access any ticket for support
4. **Input Validation**: All inputs sanitized and validated
5. **Error Handling**: Comprehensive try-catch with detailed logging

## Database Tables Used

### commercive_support_tickets
- Primary operations: Create, Read, Update
- GSI used: `user-tickets-index` (user_id + created_at)
- Fields: ticket_id, user_id, subject, status, priority, timestamps

### commercive_support_messages
- Primary operations: Create, Read
- GSI used: `ticket-messages-index` (ticket_id + created_at)
- Fields: message_id, ticket_id, sender_id, sender_type, message, attachment_url, is_ai_response, created_at

### commercive_users
- Read-only: Fetch sender names for message enrichment

## Error Handling

Comprehensive error responses:
- **400 Bad Request** - Invalid input, missing required fields
- **401 Unauthorized** - Missing/invalid JWT token
- **403 Forbidden** - Access denied to ticket
- **404 Not Found** - Ticket doesn't exist, invalid route
- **500 Server Error** - Database failures, unexpected errors

All errors logged with stack traces for debugging.

## CORS Headers

All responses include proper CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type,Authorization,...`
- `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
- `Access-Control-Allow-Credentials: true`

## Code Quality

- ✅ Type hints on all functions
- ✅ Comprehensive docstrings
- ✅ Input validation and sanitization
- ✅ Error logging (no sensitive data)
- ✅ Environment variable configuration
- ✅ Consistent response formatting
- ✅ Clean separation of concerns

## Future Enhancements

### AI Integration (Production)
Replace `generate_ai_support_response()` with:
```python
import openai  # or anthropic

def generate_ai_support_response(message: str, ticket_id: Optional[str] = None) -> str:
    # Fetch ticket history for context
    context = ""
    if ticket_id:
        messages = query('commercive_support_messages', ...)
        context = "\n".join([m['message'] for m in messages])

    # Call OpenAI/Claude API
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a helpful Commercive support assistant..."},
            {"role": "user", "content": f"Context: {context}\n\nQuestion: {message}"}
        ]
    )

    return response.choices[0].message.content
```

### Additional Features
- File upload support for attachments
- Email notifications on new messages
- Ticket assignment to support agents
- Canned responses for common questions
- Ticket priority auto-detection
- Customer satisfaction ratings
- Real-time chat via WebSockets

## Testing Checklist

- [ ] Create ticket with valid data
- [ ] Create ticket without authentication
- [ ] Create ticket with missing subject
- [ ] List tickets with status filter
- [ ] Send message to own ticket
- [ ] Send message to other user's ticket (should fail)
- [ ] Admin send message to any ticket
- [ ] Get messages in chronological order
- [ ] Generate AI response for inventory question
- [ ] Add AI response to ticket
- [ ] Verify CORS headers on all responses

## Deployment Notes

1. **Environment Variables Required**:
   - `JWT_SECRET` - Secret key for JWT verification
   - `AWS_REGION` - AWS region (default: us-east-1)

2. **IAM Permissions Required**:
   - DynamoDB: GetItem, PutItem, UpdateItem, Query on tables:
     - commercive_support_tickets
     - commercive_support_messages
     - commercive_users

3. **Lambda Configuration**:
   - Runtime: Python 3.11+
   - Memory: 256 MB (sufficient)
   - Timeout: 30 seconds
   - Function URL: Enable with CORS

4. **Dependencies**:
   - boto3 (included in Lambda)
   - PyJWT (requires layer)
   - bcrypt (requires layer)

## API Endpoint Examples

### Create Ticket
```bash
curl -X POST https://{function-url}/support/tickets \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Cannot see my inventory",
    "priority": "high",
    "message": "I connected my store but don't see any products"
  }'
```

### List Tickets
```bash
curl https://{function-url}/support/tickets?status=open \
  -H "Authorization: Bearer {token}"
```

### Send Message
```bash
curl -X POST https://{function-url}/support/tickets/{ticket_id}/messages \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Thanks for the quick response!"
  }'
```

### Get AI Response
```bash
curl -X POST https://{function-url}/support/ai-response \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do I sync my inventory?",
    "ticket_id": "{ticket_id}",
    "add_to_ticket": true
  }'
```

## Integration with Frontend

### React Component Example
```typescript
// Create ticket
const createTicket = async (subject: string, message: string) => {
  const response = await fetch(`${API_URL}/support/tickets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subject, priority: 'medium', message })
  });
  return response.json();
};

// Get ticket messages
const getMessages = async (ticketId: string) => {
  const response = await fetch(`${API_URL}/support/tickets/${ticketId}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// Send message
const sendMessage = async (ticketId: string, message: string) => {
  const response = await fetch(`${API_URL}/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
  return response.json();
};
```

## Status
✅ **COMPLETE** - Ready for deployment and testing
