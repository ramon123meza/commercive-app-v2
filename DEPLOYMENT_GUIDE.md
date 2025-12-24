# Commercive Shopify App - Deployment Guide

## Overview

This guide will help you deploy the updated Commercive Shopify app to Vercel. The app has been fixed to use DynamoDB for session storage instead of PostgreSQL/Prisma, which resolves the `MissingSessionTableError` issue.

## What Was Fixed

### Critical Issues Resolved

1. **Session Storage Error (500 Error)**
   - **Problem**: App was using Prisma/PostgreSQL for session storage but infrastructure uses DynamoDB
   - **Solution**: Replaced `@shopify/shopify-app-session-storage-prisma` with `@shopify/shopify-app-session-storage-dynamodb`
   - **Result**: Sessions now properly stored in the existing `commercive_shopify_sessions` DynamoDB table

2. **App-Bridge Deprecation Warning**
   - **Problem**: Using deprecated AppProvider initialization syntax
   - **Solution**: Updated to use new config object syntax
   - **Result**: No more deprecation warnings in browser console

### Files Modified

- `package.json` - Replaced Prisma dependencies with DynamoDB and AWS SDK
- `app/db.server.ts` - Configured DynamoDB client instead of Prisma
- `app/shopify.server.ts` - Updated to use DynamoDB session storage
- `app/routes/app.tsx` - Fixed AppProvider deprecation warning
- `.env.example` - Replaced PostgreSQL credentials with AWS credentials
- `README.md` - Updated documentation
- `prisma/schema.prisma` - **REMOVED** (no longer needed)

## Prerequisites

Before deploying, ensure you have:

1. ✅ **DynamoDB Tables Created** (via `setup_database.py`)
   - All 22 tables including `commercive_shopify_sessions`

2. ✅ **Lambda Functions Deployed**
   - All 11 Lambda functions with Function URLs

3. ✅ **AWS Credentials**
   - IAM user with DynamoDB read/write permissions
   - Access Key ID and Secret Access Key

4. ✅ **Shopify App Configured**
   - API Key and API Secret from Shopify Partners dashboard

## Step-by-Step Deployment

### Step 1: Install Dependencies

```bash
cd /home/rcardonameza/commercive-app-v2-main
npm install
```

This will install the new DynamoDB dependencies:
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/lib-dynamodb`
- `@shopify/shopify-app-session-storage-dynamodb`

### Step 2: Configure Environment Variables in Vercel

Go to your Vercel project settings and add these environment variables:

#### Shopify Configuration
```
SHOPIFY_API_KEY=813fd5f2b7ad1046bd3bb049b86f9dfe
SHOPIFY_API_SECRET=<your_shopify_api_secret>
SHOPIFY_APP_URL=https://app.commercive.co
SCOPES=read_products,write_products,read_orders,write_orders,read_fulfillments,write_fulfillments,read_inventory,write_inventory,read_locations
```

#### AWS Configuration (NEW - CRITICAL)
```
AWS_ACCESS_KEY_ID=<your_aws_access_key_id>
AWS_SECRET_ACCESS_KEY=<your_aws_secret_access_key>
AWS_REGION=us-east-1
```

#### Lambda Function URLs
```
LAMBDA_AUTH_URL=https://6khukjgv7faqtw2f6baa4yal4m0jouxo.lambda-url.us-east-1.on.aws
LAMBDA_USERS_URL=https://ktncswuqqjzgnlfkjhiiwu3ljm0jnyqx.lambda-url.us-east-1.on.aws
LAMBDA_STORES_URL=https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws
LAMBDA_INVENTORY_URL=https://zpomoosqyuqqi5zcdvg5gqjs6u0sxsoc.lambda-url.us-east-1.on.aws
LAMBDA_ORDERS_URL=https://yc3j2t47wqsbgpjclgdi76a6pi0lhzfg.lambda-url.us-east-1.on.aws
LAMBDA_WEBHOOKS_URL=https://npucikkafr4ywr3fdv672ukuie0lqlsq.lambda-url.us-east-1.on.aws
LAMBDA_ADMIN_URL=https://oyerbhhyxxomzgowei6ysfnjg40amtmr.lambda-url.us-east-1.on.aws
```

#### Frontend URLs (Optional)
```
AFFILIATE_DASHBOARD_URL=<your_affiliate_dashboard_url>
ADMIN_DASHBOARD_URL=<your_admin_dashboard_url>
```

**IMPORTANT**: Remove any old `DATABASE_URL` or `DIRECT_URL` variables if they exist.

### Step 3: Deploy to Vercel

```bash
npm run deploy:vercel
```

Or use the Vercel CLI:

```bash
vercel --prod
```

Or push to your GitHub repository if you have auto-deploy configured.

### Step 4: Verify Deployment

1. **Check Build Logs**
   - Ensure no errors related to Prisma
   - Build should complete successfully without database warnings

2. **Test the App**
   - Go to your Shopify admin
   - Open the Commercive app
   - You should see the app load without errors

3. **Check Browser Console**
   - No more "deprecated parameters" warning
   - No more 500 errors

4. **Check Vercel Logs**
   - No more `MissingSessionTableError`
   - Sessions should be successfully stored and retrieved

## Troubleshooting

### Issue: Build Fails with Prisma Errors

**Solution**: Make sure you've committed and pushed all changes. The `prisma` directory should be deleted.

```bash
git status
git add -A
git commit -m "Migrate to DynamoDB session storage"
git push origin main
```

### Issue: Still Getting Session Errors

**Verify**:
1. AWS credentials are correctly set in Vercel
2. DynamoDB table `commercive_shopify_sessions` exists
3. IAM user has permissions:
   - `dynamodb:GetItem`
   - `dynamodb:PutItem`
   - `dynamodb:DeleteItem`
   - `dynamodb:Query`
   - `dynamodb:Scan`

### Issue: App-Bridge Warning Still Appears

**Verify**: The changes to `app/routes/app.tsx` are deployed. Check the deployed code on Vercel.

### Issue: 500 Error When Opening App

**Check Vercel Logs**:
1. Go to Vercel Dashboard
2. Select your project
3. Go to "Logs" tab
4. Look for the actual error message

Common causes:
- Missing AWS credentials
- Incorrect DynamoDB table name
- Wrong AWS region

## Verifying Success

### ✅ Successful Deployment Checklist

- [ ] App builds without Prisma errors
- [ ] App loads in Shopify admin without 500 error
- [ ] No "deprecated parameters" warning in browser console
- [ ] Vercel logs show no `MissingSessionTableError`
- [ ] Webhooks are being received and processed
- [ ] Sessions are being created in DynamoDB table

### Testing Session Storage

1. Install the app on a test store
2. Check DynamoDB table `commercive_shopify_sessions`
3. You should see a new item with:
   - `session_id` (hash key)
   - `shop` (shop domain)
   - `accessToken`
   - Other session data

### Testing Webhooks

1. Create an order in your test store
2. Check Vercel logs for webhook received
3. Check Lambda logs for order processing
4. Verify order appears in DynamoDB `commercive_orders` table

## AWS IAM Permissions

Your AWS user needs these permissions for DynamoDB:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/commercive_shopify_sessions",
        "arn:aws:dynamodb:us-east-1:*:table/commercive_shopify_sessions/index/*"
      ]
    }
  ]
}
```

## Next Steps After Deployment

1. **Monitor for 24 hours**
   - Watch Vercel logs for any errors
   - Check CloudWatch logs for Lambda errors
   - Monitor DynamoDB for session entries

2. **Test All Features**
   - OAuth flow (app installation)
   - Webhook processing (orders, inventory, fulfillments)
   - Dashboard user creation
   - Data sync to affiliate/admin dashboards

3. **Performance Optimization** (if needed)
   - Monitor Lambda cold starts
   - Check DynamoDB read/write capacity
   - Optimize webhook processing if slow

## Support

If you encounter issues:

1. **Check Vercel Logs**: Deployment → Logs tab
2. **Check CloudWatch Logs**: For Lambda function errors
3. **Check DynamoDB**: Verify tables exist and have correct schema
4. **Verify Environment Variables**: All required variables are set

## Summary of Changes

This deployment fixes the critical session storage issue by:

1. ✅ Removing Prisma and PostgreSQL dependency
2. ✅ Adding DynamoDB session storage
3. ✅ Configuring AWS SDK for DynamoDB access
4. ✅ Fixing App-Bridge deprecation warnings
5. ✅ Updating all documentation

The app now fully uses DynamoDB for all data storage, making it consistent with your Lambda functions and eliminating the need for a separate PostgreSQL database.

---

**Deployment Date**: December 24, 2025
**Version**: 2.0.1 (DynamoDB Session Storage)
