# Webhooks Lambda - Quick Setup Guide

## Prerequisites

- [x] DynamoDB tables created (run `scripts/setup_database.py`)
- [x] Shopify app created with webhook secret
- [x] AWS Lambda access with DynamoDB permissions

## Step-by-Step Setup

### 1. Get Shopify Webhook Secret

From Shopify Partner Dashboard:
1. Go to your app settings
2. Find "App setup" or "Configuration"
3. Copy the "API secret key" - this is your webhook secret

### 2. Create Lambda Function

**AWS Console**:
- Go to Lambda → Create function
- Name: `commercive_webhooks`
- Runtime: Python 3.11
- Architecture: x86_64
- Execution role: Create new (or use existing with DynamoDB access)

**Required IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/commercive_*",
        "arn:aws:dynamodb:us-east-1:*:table/commercive_*/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### 3. Set Environment Variables

In Lambda Configuration → Environment variables:

```
SHOPIFY_WEBHOOK_SECRET=your_api_secret_from_shopify
AWS_REGION=us-east-1
```

### 4. Configure Function Settings

- Memory: 256 MB (increase if needed)
- Timeout: 30 seconds
- Ephemeral storage: 512 MB (default is fine)

### 5. Package and Deploy Code

```bash
cd /home/rcardonameza/_full_system_commercive/CLAUDE_AUTONOMOUS_PROJECT/lambda_functions/

# Create deployment package
zip -r commercive_webhooks.zip commercive_webhooks.py utils/

# Upload to Lambda
# Option A: Via console (upload ZIP)
# Option B: Via AWS CLI
aws lambda update-function-code \
  --function-name commercive_webhooks \
  --zip-file fileb://commercive_webhooks.zip \
  --region us-east-1
```

### 6. Create Function URL

In Lambda Configuration → Function URL:
- Click "Create function URL"
- Auth type: **NONE** (webhooks use HMAC verification)
- Configure CORS (optional):
  - Allow origins: `*`
  - Allow methods: `POST, OPTIONS`
  - Allow headers: `*`

Copy the Function URL - it will look like:
```
https://abc123def456.lambda-url.us-east-1.on.aws/
```

### 7. Register Webhooks in Shopify

**Option A: Via Shopify Admin API**

```bash
# Set variables
SHOP_DOMAIN="your-store.myshopify.com"
ACCESS_TOKEN="your_access_token"
WEBHOOK_URL="https://abc123def456.lambda-url.us-east-1.on.aws"

# Register orders/create
curl -X POST "https://$SHOP_DOMAIN/admin/api/2024-10/webhooks.json" \
  -H "X-Shopify-Access-Token: $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "topic": "orders/create",
      "address": "'"$WEBHOOK_URL/webhooks/orders/create"'",
      "format": "json"
    }
  }'

# Repeat for other topics:
# - orders/update
# - inventory_levels/update
# - fulfillments/create
# - app/uninstalled
```

**Option B: Via Shopify Partner Dashboard**

1. Go to your app in Partner Dashboard
2. Navigate to "API configuration" or "Webhooks"
3. Add webhooks:

| Topic | URL |
|-------|-----|
| orders/create | `{FUNCTION_URL}/webhooks/orders/create` |
| orders/update | `{FUNCTION_URL}/webhooks/orders/update` |
| inventory_levels/update | `{FUNCTION_URL}/webhooks/inventory/update` |
| fulfillments/create | `{FUNCTION_URL}/webhooks/fulfillment/create` |
| app/uninstalled | `{FUNCTION_URL}/webhooks/app/uninstall` |

Format: **JSON**
API Version: **2024-10**

### 8. Test the Integration

**Test Order Creation**:
1. Install app on test store
2. Create a test order in Shopify
3. Check CloudWatch Logs:
   - Log group: `/aws/lambda/commercive_webhooks`
   - Look for: "Processing orders/create webhook"
4. Verify in DynamoDB:
   - Check `commercive_orders` table for new order
   - Check `commercive_order_items` table for line items
   - Check `commercive_webhooks` table for log entry

**Test Webhook Manually** (via Shopify Admin):
1. Go to Settings → Notifications → Webhooks
2. Find your webhook
3. Click "Send test notification"
4. Check Lambda logs and DynamoDB

## Verification Checklist

- [ ] Lambda function created and deployed
- [ ] Environment variables set (`SHOPIFY_WEBHOOK_SECRET`)
- [ ] Function URL created (auth type: NONE)
- [ ] All 5 webhooks registered in Shopify
- [ ] Test order created and processed successfully
- [ ] CloudWatch logs show successful processing
- [ ] DynamoDB tables contain test data
- [ ] Webhook logs in `commercive_webhooks` table

## Troubleshooting

### Webhook not firing
- Check webhook is registered in Shopify
- Verify webhook URL is correct
- Check Shopify webhook status (should be "success")

### HMAC verification failed
```
Solution: Verify SHOPIFY_WEBHOOK_SECRET matches API secret in Shopify
```

### Store not found
```
Solution: Ensure store record exists in commercive_stores table
Create it during OAuth flow
```

### Lambda timeout
```
Solution: Increase timeout in Lambda configuration (30 seconds should be plenty)
```

### DynamoDB access denied
```
Solution: Add DynamoDB permissions to Lambda execution role
```

## Monitoring Commands

**View recent logs**:
```bash
aws logs tail /aws/lambda/commercive_webhooks --follow
```

**Count webhooks processed**:
```sql
-- In DynamoDB console or CLI
SELECT COUNT(*) FROM commercive_webhooks WHERE processed = true
```

**Check failed webhooks**:
```sql
SELECT * FROM commercive_webhooks WHERE processed = false
```

## Next Steps

After webhooks are working:

1. **Monitor**: Set up CloudWatch alarms for errors
2. **Scale**: Adjust Lambda concurrency if needed
3. **Optimize**: Review logs for performance improvements
4. **Expand**: Add additional webhook topics as needed

## Function URL Reference

Document your function URL here after creation:

```
PRODUCTION_WEBHOOK_URL=https://_____________________.lambda-url.us-east-1.on.aws/
```

Update in:
- Shopify app webhook configuration
- `.env` files for other services
- Documentation

---

**Last Updated**: 2025-12-21
**Status**: Ready for deployment
