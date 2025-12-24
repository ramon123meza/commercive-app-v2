# Commercive Shopify App - Updated for Lambda Backend

This is the Commercive Shopify app, completely refactored to use AWS Lambda functions instead of Supabase.

## Overview

**Framework**: Remix (React-based)
**Backend**: AWS Lambda via Function URLs
**Database**:
- PostgreSQL (Prisma) - For Shopify OAuth sessions only
- DynamoDB (via Lambda) - For all application data

## Architecture Changes

### Old System → New System

| Component | Old | New |
|-----------|-----|-----|
| Database | Supabase | DynamoDB (via Lambda) |
| API Calls | Direct Supabase client | Lambda Function URLs |
| Auth | Supabase Auth | Custom JWT (via Lambda) |
| User Creation | Supabase functions | Lambda endpoint |
| Webhooks | Supabase inserts | Lambda endpoints |

## Key Files

### Configuration
- `shopify.app.toml` - Shopify app configuration
- `package.json` - Dependencies
- `vite.config.ts` - Build configuration
- `.env.example` - Environment variables template

### Core Application
- `app/shopify.server.ts` - Shopify app setup, OAuth, webhooks
- `app/db.server.ts` - Prisma client (session storage only)
- `app/config/lambda.server.ts` - Lambda URLs configuration

### API Integration
- `app/utils/lambdaClient.ts` - **CRITICAL** - All Lambda API calls
- `app/types/api.types.ts` - TypeScript types for API responses

### Routes
- `app/routes/app._index.tsx` - Main dashboard
- `app/routes/webhooks.tsx` - Unified webhook handler
- `app/routes/webhooks.app-uninstalled.tsx` - App uninstall handler
- `app/routes/auth.login.tsx` - OAuth login
- `app/routes/auth.$.tsx` - OAuth callback

### Utilities
- `app/utils/createDashboardUser.ts` - Auto-create dashboard users
- `app/utils/queries.ts` - Shopify GraphQL queries
- `app/utils/transformDataHelpers.tsx` - Data transformations
- `app/utils/shopify.tsx` - Shopify API helpers

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Shopify
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://app.commercive.co

# Database (for Shopify sessions)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Lambda Function URLs (after deploying Lambda functions)
LAMBDA_AUTH_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_USERS_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_STORES_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_INVENTORY_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_ORDERS_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_WEBHOOKS_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_ADMIN_URL=https://xxx.lambda-url.us-east-1.on.aws

# Frontend
AFFILIATE_DASHBOARD_URL=https://your-dashboard.amplifyapp.com
```

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
vercel --prod
```

## Lambda Integration

All database operations go through Lambda functions:

### User Operations
- `createDashboardUser()` → POST `/signup` (commercive_auth)
- `upsertStore()` → POST `/stores` (commercive_stores)

### Order Operations
- `syncOrder()` → POST `/webhooks/orders/create` (commercive_webhooks)
- `getOrders()` → GET `/orders` (commercive_orders)

### Inventory Operations
- `syncInventory()` → POST `/webhooks/inventory/update` (commercive_webhooks)
- `getInventory()` → GET `/inventory` (commercive_inventory)
- `getLowStockItems()` → GET `/inventory/restock-analysis` (commercive_inventory)

### Fulfillment Operations
- `syncFulfillment()` → POST `/webhooks/fulfillment/create` (commercive_webhooks)
- `getTracking()` → GET `/orders/{id}/tracking` (commercive_orders)

### Store Operations
- `getStore()` → GET `/stores` (commercive_stores)
- `isInventoryFetched()` → GET `/stores` (commercive_stores)
- `setInventoryFetched()` → POST `/stores/{id}/sync` (commercive_stores)
- `disconnectStore()` → POST `/stores/{id}/disconnect` (commercive_stores)

## Webhook Flow

1. Shopify sends webhook to `/webhooks`
2. Webhook handler authenticates and validates
3. Handler processes data and calls appropriate Lambda function
4. Lambda function stores data in DynamoDB
5. Data appears in affiliate/admin dashboards

## Testing

### Test OAuth Flow
1. Install app on development store
2. Verify user created in DynamoDB (via Lambda)
3. Check store record created
4. Verify webhooks registered

### Test Webhooks
1. Create order in Shopify
2. Check order appears in DynamoDB
3. Verify order visible in dashboard

### Test Inventory Sync
1. Update inventory in Shopify
2. Verify webhook received
3. Check inventory updated in DynamoDB

## Deployment Checklist

- [ ] All Lambda functions deployed and tested
- [ ] Lambda Function URLs configured in environment
- [ ] PostgreSQL database set up for sessions
- [ ] Prisma schema pushed
- [ ] Environment variables configured in Vercel
- [ ] App deployed to Vercel
- [ ] Shopify app settings updated with production URLs
- [ ] Test installation on development store
- [ ] Verify all webhooks working
- [ ] Check data flowing to DynamoDB
- [ ] Confirm dashboards showing data

## Troubleshooting

### Webhook Issues
- Check CloudWatch logs for Lambda function errors
- Verify webhook URL in Shopify admin matches deployment URL
- Test webhook handler endpoint with curl

### Database Connection
- Verify DATABASE_URL is correct
- Check Prisma schema is up to date: `npx prisma generate`
- Ensure database is accessible from deployment environment

### Lambda Integration
- Verify all Lambda URLs are configured
- Check Lambda function CORS settings
- Test Lambda endpoints individually with Postman

## Support

For issues or questions:
1. Check CloudWatch logs for Lambda errors
2. Review Vercel deployment logs
3. Test Lambda endpoints directly
4. Verify environment variables are set correctly

## Architecture Diagram

```
┌─────────────┐
│   Shopify   │
│   Merchant  │
└─────┬───────┘
      │ OAuth
      ↓
┌─────────────────┐
│  Shopify App    │
│   (Remix)       │◄─── Webhooks
└────────┬────────┘
         │
         │ Lambda API Calls
         ↓
┌─────────────────┐
│ Lambda Functions│
│  (11 functions) │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   DynamoDB      │
│  (22 tables)    │
└─────────────────┘
         ↑
         │ API Calls
         │
┌────────┴────────┐
│   Dashboards    │
│ (Affiliate+Admin)│
└─────────────────┘
```

## Next Steps

After deployment:
1. Monitor error rates
2. Test with real Shopify stores
3. Optimize Lambda cold starts if needed
4. Set up monitoring and alerts
5. Document any additional configurations

---

**Last Updated**: December 21, 2025
**Version**: 2.0.0 (Lambda Backend)
