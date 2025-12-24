# Commercive Webhooks Lambda Implementation

## Overview

The `commercive_webhooks.py` Lambda function handles all Shopify webhook events for the Commercive platform. It processes 5 webhook endpoints with HMAC signature verification and comprehensive error handling.

## File Location

```
/home/rcardonameza/_full_system_commercive/CLAUDE_AUTONOMOUS_PROJECT/lambda_functions/commercive_webhooks.py
```

## Webhook Endpoints

### 1. POST /webhooks/orders/create
**Purpose**: Handle new order creation from Shopify

**Processing**:
- Extracts order details from Shopify payload
- Creates record in `commercive_orders` table
- Creates line item records in `commercive_order_items` table
- Logs webhook to `commercive_webhooks` table

**Data Captured**:
- Order number, customer info, totals
- Financial and fulfillment status
- Line items with SKU, quantity, price

### 2. POST /webhooks/orders/update
**Purpose**: Handle order updates (status changes, edits)

**Processing**:
- Finds existing order by `shopify_order_id`
- Updates order fields (status, customer info)
- Updates or creates line items if changed
- Falls back to create if order not found

**Updates**:
- Financial status, fulfillment status
- Customer name and email
- Line item quantities and prices

### 3. POST /webhooks/inventory/update
**Purpose**: Handle inventory level changes

**Processing**:
- Extracts `inventory_item_id` and `available` quantity
- Finds matching inventory record in `commercive_inventory`
- Updates quantity and timestamp

**Note**: Gracefully handles items not yet synced to our system

### 4. POST /webhooks/fulfillment/create
**Purpose**: Handle order fulfillment and tracking

**Processing**:
- Finds order by `shopify_order_id`
- Extracts tracking number, carrier, URL
- Creates record in `commercive_trackings` table
- Updates order fulfillment status to "fulfilled"

**Data Captured**:
- Tracking number and company
- Tracking URL
- Shipment status and date

### 5. POST /webhooks/app/uninstall
**Purpose**: Handle app uninstallation

**Processing**:
- Marks store as inactive (`is_active = false`)
- Keeps all historical data (orders, inventory, etc.)
- Logs uninstall event

**Important**: Does NOT delete data - preserves for historical records

## Security Features

### HMAC Verification

All webhooks verify Shopify's HMAC signature:

```python
def verify_hmac_signature(body_bytes: bytes, hmac_header: str) -> bool:
    """Verifies X-Shopify-Hmac-SHA256 header"""
```

- Compares calculated HMAC with header value
- Uses `SHOPIFY_WEBHOOK_SECRET` environment variable
- Rejects invalid signatures (but still returns 200)

### Error Handling Strategy

**CRITICAL**: Always returns 200 status code, even on errors

**Why?**
- Shopify retries webhook deliveries on non-200 responses
- Prevents duplicate processing and webhook storms
- Logs all errors for debugging

```python
# Always return 200
return success({'message': 'Received'})
```

## Database Tables Used

| Table | Purpose | Operations |
|-------|---------|------------|
| `commercive_stores` | Store lookup | Query by domain, Update is_active |
| `commercive_orders` | Order records | Create, Update |
| `commercive_order_items` | Line items | Create, Update |
| `commercive_inventory` | Inventory levels | Update quantity |
| `commercive_trackings` | Shipment tracking | Create |
| `commercive_webhooks` | Webhook logs | Create (all webhooks) |

## Webhook Logging

Every webhook is logged to `commercive_webhooks` table:

```python
{
    'webhook_id': 'uuid',
    'store_id': 'store-uuid-or-unknown',
    'topic': 'orders/create',
    'payload': 'full JSON payload',
    'processed': true/false,
    'error': 'error message if failed',
    'created_at': 'ISO timestamp'
}
```

**Benefits**:
- Debugging webhook issues
- Audit trail of all events
- Replay capability for failed webhooks

## Environment Variables

### Required

```bash
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_from_shopify
AWS_REGION=us-east-1
```

### Optional

```bash
DYNAMODB_TABLE_PREFIX=commercive_  # Default prefix for tables
```

## Deployment Steps

### 1. Create Lambda Function

```bash
# AWS Console or CLI
Function name: commercive_webhooks
Runtime: Python 3.11
Memory: 256 MB
Timeout: 30 seconds
```

### 2. Set Environment Variables

Add in Lambda configuration:
- `SHOPIFY_WEBHOOK_SECRET`: Get from Shopify Partner Dashboard
- `AWS_REGION`: us-east-1

### 3. Package and Upload

```bash
cd lambda_functions/
zip -r commercive_webhooks.zip commercive_webhooks.py utils/
```

Upload ZIP to Lambda function

### 4. Enable Function URL

- Auth type: NONE (webhooks use HMAC, not JWT)
- Enable CORS if needed
- Copy the Function URL

### 5. Register Webhooks in Shopify

In Shopify Partner Dashboard or via API, register these webhooks:

| Topic | URL |
|-------|-----|
| `orders/create` | `https://{function-url}/webhooks/orders/create` |
| `orders/update` | `https://{function-url}/webhooks/orders/update` |
| `inventory_levels/update` | `https://{function-url}/webhooks/inventory/update` |
| `fulfillments/create` | `https://{function-url}/webhooks/fulfillment/create` |
| `app/uninstalled` | `https://{function-url}/webhooks/app/uninstall` |

**Format**: JSON
**API Version**: 2024-10 (or latest)

## Testing

### Local Testing (Development)

```python
# Test event structure
{
    "rawPath": "/webhooks/orders/create",
    "requestContext": {
        "http": {
            "method": "POST"
        }
    },
    "headers": {
        "x-shopify-hmac-sha256": "calculated_hmac",
        "x-shopify-shop-domain": "test-store.myshopify.com",
        "x-shopify-topic": "orders/create"
    },
    "body": "{\"id\":123456,...}"
}
```

### Production Testing

1. Install app on test store
2. Create test order in Shopify
3. Check CloudWatch logs for webhook processing
4. Verify records in DynamoDB tables
5. Check `commercive_webhooks` table for log entry

## Monitoring

### CloudWatch Logs

Monitor these log patterns:

```
✓ "Processing orders/create webhook"
✓ "Created order record: {order_id}"
✓ "Updated inventory: {inventory_id}"
✗ "WARNING: Invalid HMAC signature"
✗ "Error processing orders/create"
```

### Key Metrics to Track

- Webhook success rate (processed = true)
- Processing time per webhook
- HMAC verification failures
- Unknown webhook topics

### CloudWatch Alarms (Recommended)

1. **HMAC Failures**: Alert if >5 invalid signatures in 5 minutes
2. **Processing Errors**: Alert if error rate >10%
3. **Unknown Webhooks**: Alert on new/unexpected topics

## Error Recovery

### Failed Webhook Processing

1. Check `commercive_webhooks` table for failed webhooks
2. Review error message in `error` field
3. Review full payload in `payload` field
4. Fix issue (missing store, invalid data, etc.)
5. Manually reprocess if needed

### Reprocessing a Webhook

```python
# Get failed webhook
webhook = get_item('commercive_webhooks', {'webhook_id': 'uuid'})

# Parse payload
payload = json.loads(webhook['payload'])

# Reprocess through appropriate handler
handle_orders_create(payload, store_domain, topic, webhook['payload'])
```

## Integration Points

### With Shopify App

The Shopify app (Next.js) should:
1. Register these webhook URLs during installation
2. Use same `SHOPIFY_WEBHOOK_SECRET` for signature generation
3. Update webhook URLs if function URL changes

### With Other Lambdas

**commercive_orders.py**: Reads order data created by webhooks
**commercive_inventory.py**: Reads inventory updated by webhooks
**commercive_stores.py**: Checks store is_active status

## Common Issues and Solutions

### Issue: "Store not found for domain"

**Cause**: Store not yet created in `commercive_stores` table
**Solution**: Ensure OAuth flow creates store record before webhooks fire

### Issue: "Order not found for Shopify ID"

**Cause**: Order update received before order create
**Solution**: Current code handles this - falls back to create

### Issue: HMAC verification fails

**Cause**: Wrong webhook secret or signature mismatch
**Solution**:
1. Verify `SHOPIFY_WEBHOOK_SECRET` matches Shopify
2. Check raw body is passed correctly (no JSON parsing before verification)
3. Ensure base64 decoding if needed

### Issue: Duplicate orders

**Cause**: Shopify retrying webhook delivery
**Solution**: Check for existing `shopify_order_id` before creating (already implemented)

## Future Enhancements

### Potential Additions

1. **Product webhooks**: `products/create`, `products/update`, `products/delete`
2. **Customer webhooks**: `customers/create`, `customers/update`
3. **Webhook retry logic**: Implement exponential backoff for database errors
4. **Dead letter queue**: Move to SQS for better retry handling
5. **Real-time notifications**: Trigger SNS/EventBridge on critical events

### Performance Optimizations

1. **Batch processing**: Use DynamoDB batch writes for line items
2. **Parallel processing**: Use Lambda concurrent executions
3. **Caching**: Cache store lookups in Lambda memory
4. **Async processing**: Use SQS for heavy processing

## Documentation References

- **Database Schema**: `docs/DATABASE_SCHEMA.md`
- **API Endpoints**: `docs/API_ENDPOINTS.md`
- **Lambda Functions**: `docs/LAMBDA_FUNCTIONS.md`
- **Shopify Webhooks**: https://shopify.dev/docs/api/admin-rest/webhooks

## Support

For issues or questions:
1. Check CloudWatch logs for webhook processing errors
2. Review `commercive_webhooks` table for failed webhooks
3. Verify HMAC secret matches Shopify configuration
4. Test with Shopify webhook testing tool in Partner Dashboard
