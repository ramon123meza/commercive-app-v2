# Payouts Lambda Implementation

## File Location
`/home/rcardonameza/_full_system_commercive/CLAUDE_AUTONOMOUS_PROJECT/lambda_functions/commercive_payouts.py`

## Overview
Unified Lambda function handling all payout-related operations for affiliates with internal routing.

## Endpoints Implemented

### 1. POST /payouts/request
**Purpose**: Request a payout for an affiliate

**Authentication**: Required (JWT token)

**Authorization**: User must be an active affiliate

**Request Body**:
```json
{
  "amount": 5000,  // Amount in cents (required)
  "payment_method": "paypal",  // Optional, defaults to affiliate record
  "payment_email": "user@example.com"  // Optional, defaults to affiliate record
}
```

**Validation**:
- Verifies user is an affiliate
- Checks affiliate status is 'active'
- Validates amount > 0
- Enforces minimum payout threshold ($10.00)
- Verifies amount <= available balance
- Validates payment_method in ['paypal', 'zelle']
- Requires payment_email

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Payout request submitted successfully",
  "data": {
    "payout": {
      "payout_id": "uuid",
      "amount": 5000,
      "payment_method": "paypal",
      "payment_email": "user@example.com",
      "status": "pending",
      "requested_at": "2025-12-21T12:00:00Z"
    }
  }
}
```

**Error Responses**:
- 400: Invalid amount, exceeds balance, or validation error
- 401: Not authenticated
- 403: Not an affiliate or inactive affiliate
- 500: Database error

---

### 2. GET /payouts
**Purpose**: List payout history for the authenticated affiliate

**Authentication**: Required (JWT token)

**Authorization**: User must be an affiliate

**Query Parameters**: None (automatically filtered by user's affiliate_id)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "payouts": [
      {
        "payout_id": "uuid",
        "amount": 5000,
        "payment_method": "paypal",
        "payment_email": "user@example.com",
        "status": "completed",
        "transaction_id": "PAYPAL123",
        "requested_at": "2025-12-21T12:00:00Z",
        "processed_at": "2025-12-22T10:00:00Z",
        "notes": "Paid via PayPal"
      }
    ],
    "total": 1
  }
}
```

**Payout Statuses**:
- `pending`: Awaiting admin processing
- `processing`: Admin is processing the payout
- `completed`: Payout has been sent
- `failed`: Payout failed (amount returns to available balance)

**Sort Order**: Most recent first (descending by requested_at)

---

### 3. GET /payouts/balance
**Purpose**: Get available balance and breakdown for the authenticated affiliate

**Authentication**: Required (JWT token)

**Authorization**: User must be an affiliate

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "balance": {
      "total_earned": 50000,  // Total commissions earned (cents)
      "total_paid": 30000,    // Total completed payouts (cents)
      "pending": 5000,        // Pending/processing payouts (cents)
      "available": 15000      // Available for withdrawal (cents)
    }
  }
}
```

**Balance Calculation**:
```
available = total_earned - total_paid - pending
```

- `total_earned`: Sum of all approved commissions (from affiliate record)
- `total_paid`: Sum of all completed payouts
- `pending`: Sum of pending + processing payouts
- `available`: Amount that can be withdrawn (always >= 0)

---

## Database Tables Used

### commercive_affiliates
- Primary Key: `affiliate_id`
- GSI: `user-affiliate-index` (user_id)
- Fields read:
  - affiliate_id
  - user_id
  - status
  - total_earned
  - total_paid
  - payment_method
  - payment_email

### commercive_payouts
- Primary Key: `payout_id`
- GSI: `affiliate-payouts-index` (affiliate_id, requested_at)
- Fields written/read:
  - payout_id
  - affiliate_id
  - amount
  - payment_method
  - payment_email
  - status
  - transaction_id
  - notes
  - requested_at
  - processed_at
  - processed_by

---

## Helper Functions

### `get_affiliate_by_user_id(user_id: str)`
Retrieves affiliate record using user-affiliate-index GSI.

### `calculate_balance(affiliate_id: str)`
Calculates real-time balance by:
1. Getting total_earned from affiliate record
2. Querying all payouts
3. Summing completed payouts (total_paid)
4. Summing pending/processing payouts
5. Computing available = total_earned - total_paid - pending

### `get_pending_payout_amount(affiliate_id: str)`
Calculates total pending payout amount (helper for future use).

---

## Security Features

1. **JWT Authentication**: All endpoints require valid JWT token
2. **Affiliate Verification**: Verifies user is linked to an affiliate account
3. **Status Check**: Only active affiliates can request payouts
4. **Balance Validation**: Prevents overdrawing available balance
5. **Input Validation**: Validates all user inputs (amount, payment_method, etc.)
6. **CORS Headers**: Proper CORS configuration for cross-origin requests

---

## Error Handling

- JSON parse errors return 400 Bad Request
- Missing required fields return 400 with specific message
- Invalid amounts return 400 with validation message
- Authentication failures return 401 Unauthorized
- Non-affiliates return 403 Forbidden
- Database errors return 500 Internal Server Error
- All errors include descriptive messages
- Exceptions are logged with full traceback

---

## Testing Checklist

- [ ] Request payout with valid amount
- [ ] Request payout exceeding available balance (should fail)
- [ ] Request payout below minimum threshold (should fail)
- [ ] Request payout without authentication (should fail)
- [ ] Request payout as non-affiliate (should fail)
- [ ] List payouts with multiple records
- [ ] List payouts with no records
- [ ] Get balance with various states (earned, paid, pending)
- [ ] CORS preflight OPTIONS requests

---

## Integration Notes

### For Affiliate Dashboard
```javascript
// Request payout
const response = await fetch('https://lambda-url/payouts/request', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 5000  // $50.00 in cents
  })
});

// Get balance
const balance = await fetch('https://lambda-url/payouts/balance', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// List payouts
const history = await fetch('https://lambda-url/payouts', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### For Admin Dashboard
Admins will use the admin Lambda endpoints:
- `POST /admin/payouts/{payout_id}/process` - Process a payout
- `GET /admin/payouts` - List all payouts across all affiliates

---

## Deployment

1. Deploy Lambda function with Function URL enabled
2. Set environment variables:
   - `JWT_SECRET`: JWT signing secret
   - `AWS_REGION`: AWS region (default: us-east-1)
3. Configure Lambda IAM role with DynamoDB permissions:
   - commercive_affiliates: Read
   - commercive_payouts: Read, Write
4. Enable CORS on Function URL
5. Test all endpoints with sample data

---

## Future Enhancements

- [ ] Add pagination for payout history
- [ ] Add email notification when payout is requested
- [ ] Add email notification when payout is completed
- [ ] Add payout receipt generation (PDF)
- [ ] Add payout scheduling (request for future date)
- [ ] Add bulk payout requests
- [ ] Add payout cancellation (if still pending)
- [ ] Add detailed transaction history per payout
- [ ] Add webhook integration with PayPal/Zelle APIs
