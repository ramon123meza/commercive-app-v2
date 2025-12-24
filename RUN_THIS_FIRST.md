# 🚀 Run This Script First - Fix DynamoDB Table

## Quick Start

Before deploying your Shopify app, run this script to fix the DynamoDB table schema issue.

---

## Step 0: Install boto3 (AWS SDK)

```bash
cd /home/rcardonameza/commercive-app-v2-main

# Install boto3
pip3 install boto3

# Or install from requirements.txt
pip3 install -r requirements.txt
```

---

## Option 1: With Environment Variables (Recommended)

```bash
cd /home/rcardonameza/commercive-app-v2-main

# Set your AWS credentials
export AWS_ACCESS_KEY_ID="your_access_key_here"
export AWS_SECRET_ACCESS_KEY="your_secret_key_here"
export AWS_REGION="us-east-1"

# Run the script
python3 fix_sessions_table.py
```

---

## Option 2: Interactive (Script Will Prompt)

```bash
cd /home/rcardonameza/commercive-app-v2-main

# Run the script (it will ask for credentials)
python3 fix_sessions_table.py
```

The script will prompt you for:
- AWS Access Key ID
- AWS Secret Access Key
- AWS Region (defaults to us-east-1)

---

## What the Script Does

1. ✅ Connects to your AWS account
2. ✅ Checks current table schema
3. ✅ Deletes old table (with wrong schema: `session_id`)
4. ✅ Creates new table (with correct schema: `id`)
5. ✅ Adds Global Secondary Index on `shop` attribute
6. ✅ Verifies everything is correct
7. ✅ Provides next steps

**Time**: ~2-3 minutes
**Data Loss**: None (sessions are temporary)

---

## What You'll See

```
============================================================
Commercive - Fix DynamoDB Sessions Table Schema
============================================================

This script will:
  1. Delete the old 'commercive_shopify_sessions' table
  2. Create a new table with the correct schema
  3. Verify the new schema is correct

⚠ WARNING: This will delete any existing sessions
ℹ Note: Sessions are temporary and expire quickly, so this is safe

Do you want to proceed? (yes/no): yes

============================================================
AWS Credentials
============================================================

✓ Found AWS_ACCESS_KEY_ID in environment: AKIAXXXX...
✓ Found AWS_SECRET_ACCESS_KEY in environment
ℹ Using AWS Region: us-east-1
✓ Successfully authenticated with AWS

============================================================
Checking Current Table Schema
============================================================

ℹ Current partition key: 'session_id'
⚠ Table has WRONG partition key: 'session_id' (should be 'id')

============================================================
Deleting Old Table
============================================================

ℹ Deleting table: commercive_shopify_sessions
ℹ Waiting for table deletion to complete...
✓ Table 'commercive_shopify_sessions' deleted successfully

============================================================
Creating New Table with Correct Schema
============================================================

ℹ Creating table: commercive_shopify_sessions
ℹ Schema: Partition key = 'id' (String)
ℹ Global Secondary Index: 'shop-index' on 'shop' attribute
✓ Table creation initiated
ℹ Waiting for table to become ACTIVE...
✓ Table 'commercive_shopify_sessions' is now ACTIVE

============================================================
Verifying Table Schema
============================================================

✓ Partition key is correct: 'id'
✓ Global Secondary Index: 'shop-index'
✓ GSI Key: 'shop'
✓ GSI Status: ACTIVE
✓ Table Status: ACTIVE
✓ Billing Mode: PAY_PER_REQUEST

✓ Table schema is correct and ready to use!

============================================================
Success!
============================================================

✓ DynamoDB table schema has been fixed
✓ Partition key is now 'id' (correct)
✓ Table is ready for Shopify session storage
✓ You can now deploy your Shopify app

Next Steps:
  1. Run: npm install
  2. Add AWS credentials to Vercel environment variables
  3. Deploy to Vercel: npm run deploy:vercel
  4. Test the app on Shopify
```

---

## Requirements

- Python 3.6+
- boto3 library (AWS SDK for Python)

Install boto3 if needed:
```bash
pip3 install boto3
```

---

## Troubleshooting

### Error: "No module named 'boto3'"

**Solution**:
```bash
pip3 install boto3
```

### Error: "An error occurred (UnrecognizedClientException)"

**Solution**: Your AWS credentials are incorrect. Double-check:
- AWS Access Key ID
- AWS Secret Access Key

### Error: "An error occurred (AccessDeniedException)"

**Solution**: Your AWS user needs DynamoDB permissions:
- `dynamodb:CreateTable`
- `dynamodb:DeleteTable`
- `dynamodb:DescribeTable`
- `dynamodb:ListTables`

### Script Says "Table already has correct schema!"

**Solution**: Great! The table is already fixed. You can skip this step and proceed with deployment.

---

## After Running the Script

### 1. Install Dependencies
```bash
cd /home/rcardonameza/commercive-app-v2-main
npm install
```

### 2. Add Environment Variables to Vercel

Go to Vercel Dashboard → Settings → Environment Variables and add:

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

SHOPIFY_API_KEY=813fd5f2b7ad1046bd3bb049b86f9dfe
SHOPIFY_API_SECRET=your_shopify_secret

LAMBDA_AUTH_URL=https://6khukjgv7faqtw2f6baa4yal4m0jouxo.lambda-url.us-east-1.on.aws
LAMBDA_USERS_URL=https://ktncswuqqjzgnlfkjhiiwu3ljm0jnyqx.lambda-url.us-east-1.on.aws
LAMBDA_STORES_URL=https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws
LAMBDA_INVENTORY_URL=https://zpomoosqyuqqi5zcdvg5gqjs6u0sxsoc.lambda-url.us-east-1.on.aws
LAMBDA_ORDERS_URL=https://yc3j2t47wqsbgpjclgdi76a6pi0lhzfg.lambda-url.us-east-1.on.aws
LAMBDA_WEBHOOKS_URL=https://npucikkafr4ywr3fdv672ukuie0lqlsq.lambda-url.us-east-1.on.aws
LAMBDA_ADMIN_URL=https://oyerbhhyxxomzgowei6ysfnjg40amtmr.lambda-url.us-east-1.on.aws
```

### 3. Deploy to Vercel
```bash
npm run deploy:vercel
```

Or push to GitHub if you have auto-deploy configured.

### 4. Test on Shopify
1. Go to your Shopify admin
2. Open the Commercive app
3. Should load without errors
4. Check Vercel logs - no more "MissingSessionTableError"

---

## Summary

**This script is REQUIRED** before deploying because:
- ❌ Current table has partition key: `session_id`
- ✅ Shopify requires partition key: `id`
- ⚠️ App won't work without this fix

**After running this script**:
- ✅ Table schema is correct
- ✅ Sessions will store properly
- ✅ OAuth flow will work
- ✅ No more 500 errors
- ✅ App is production-ready

---

**Estimated Time**: 2-3 minutes
**Risk Level**: 🟢 Safe (sessions are temporary data)
**Required**: ✅ YES - Must run before deployment

---

**Date**: December 24, 2025
**Script**: fix_sessions_table.py
**Purpose**: Fix DynamoDB partition key for Shopify sessions
