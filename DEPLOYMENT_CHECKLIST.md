# Deployment Checklist - Commercive Shopify App

## 🎯 Quick Start - What You Need to Do

Your Shopify app has been fixed and is ready to deploy. Follow these steps:

---

## Step 1: Install New Dependencies ✅

```bash
cd /home/rcardonameza/commercive-app-v2-main
npm install
```

This installs the new DynamoDB packages and removes Prisma.

---

## Step 2: Update Vercel Environment Variables 🔧

### ➕ ADD These New Variables:

Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Add these 3 new variables:

```
AWS_ACCESS_KEY_ID=<your_actual_aws_access_key_id>
AWS_SECRET_ACCESS_KEY=<your_actual_aws_secret_access_key>
AWS_REGION=us-east-1
```

### ➖ REMOVE These Old Variables (if they exist):

```
DATABASE_URL
DIRECT_URL
```

### ✅ VERIFY These Variables Are Still Set:

```
SHOPIFY_API_KEY=813fd5f2b7ad1046bd3bb049b86f9dfe
SHOPIFY_API_SECRET=<your_secret>
SHOPIFY_APP_URL=https://app.commercive.co

LAMBDA_AUTH_URL=https://6khukjgv7faqtw2f6baa4yal4m0jouxo.lambda-url.us-east-1.on.aws
LAMBDA_USERS_URL=https://ktncswuqqjzgnlfkjhiiwu3ljm0jnyqx.lambda-url.us-east-1.on.aws
LAMBDA_STORES_URL=https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws
LAMBDA_INVENTORY_URL=https://zpomoosqyuqqi5zcdvg5gqjs6u0sxsoc.lambda-url.us-east-1.on.aws
LAMBDA_ORDERS_URL=https://yc3j2t47wqsbgpjclgdi76a6pi0lhzfg.lambda-url.us-east-1.on.aws
LAMBDA_WEBHOOKS_URL=https://npucikkafr4ywr3fdv672ukuie0lqlsq.lambda-url.us-east-1.on.aws
LAMBDA_ADMIN_URL=https://oyerbhhyxxomzgowei6ysfnjg40amtmr.lambda-url.us-east-1.on.aws
```

---

## Step 3: Deploy to Vercel 🚀

Choose one of these methods:

### Option A: Using npm script
```bash
npm run deploy:vercel
```

### Option B: Using Vercel CLI directly
```bash
vercel --prod
```

### Option C: Push to GitHub (if auto-deploy enabled)
```bash
git add -A
git commit -m "Fix: Migrate to DynamoDB session storage, fix App-Bridge deprecation"
git push origin main
```

---

## Step 4: Verify Deployment ✅

### 4.1 Check Build Success

In Vercel:
- ✅ Build completes without errors
- ✅ No Prisma-related errors
- ✅ Deployment shows as "Ready"

### 4.2 Test App in Shopify

1. Go to your Shopify admin
2. Open the Commercive app
3. ✅ App loads without 500 error
4. ✅ No "Unexpected Server Error"

### 4.3 Check Browser Console

1. Open DevTools (F12)
2. Go to Console tab
3. ✅ No "deprecated parameters" warning
4. ✅ No error messages

### 4.4 Check Vercel Logs

1. Go to Vercel Dashboard → Logs
2. ✅ No `MissingSessionTableError`
3. ✅ Sessions being created/retrieved successfully

### 4.5 Check DynamoDB

1. Go to AWS Console → DynamoDB → Tables
2. Open `commercive_shopify_sessions`
3. Click "Explore table items"
4. ✅ You should see session records after installing the app

---

## Step 5: Test Complete Flow 🧪

### Test 1: Fresh App Installation

```
1. Uninstall app from test store (if installed)
2. Reinstall the app
3. Complete OAuth flow
4. ✅ App opens successfully
5. ✅ No errors in console
6. ✅ Session created in DynamoDB
```

### Test 2: Webhook Processing

```
1. Create a test order in Shopify
2. Check Vercel logs
3. ✅ Webhook received
4. ✅ Lambda function called
5. Check DynamoDB `commercive_orders` table
6. ✅ Order data stored
```

### Test 3: Dashboard User Creation

```
1. Install app on new store
2. Check Lambda logs for `commercive_auth`
3. ✅ Dashboard user created
4. Check `commercive_users` table
5. ✅ User record exists
```

---

## 🚨 Troubleshooting Guide

### Issue: Build Fails

**Check**:
- ✅ `npm install` completed successfully
- ✅ No Prisma packages in `package.json`
- ✅ `prisma` directory deleted

**Fix**:
```bash
rm -rf node_modules package-lock.json
npm install
```

---

### Issue: Still Getting 500 Error

**Check Vercel Logs** for exact error:

1. Go to Vercel → Logs
2. Find the error message

**Common Causes**:

| Error | Solution |
|-------|----------|
| `MissingSessionTableError` | AWS credentials not set in Vercel |
| `CredentialsError` | Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY |
| `ResourceNotFoundException` | DynamoDB table doesn't exist |
| `AccessDeniedException` | IAM user needs DynamoDB permissions |

**Fix**: Add/verify AWS credentials in Vercel environment variables

---

### Issue: Deprecation Warning Still Shows

**Check**:
1. ✅ Latest code deployed to Vercel
2. ✅ Hard refresh browser (Ctrl+Shift+R)
3. ✅ `app/routes/app.tsx` has new config syntax

**Fix**:
```bash
# Verify file content
cat app/routes/app.tsx | grep -A 5 "config={{"

# Should see:
# config={{
#   apiKey,
#   host: new URL(globalThis.location.href).searchParams.get("host") || "",
#   forceRedirect: true,
# }}
```

---

### Issue: Webhooks Not Working

**Check**:
1. ✅ Webhooks registered in Shopify
2. ✅ Webhook URL matches Vercel deployment
3. ✅ Lambda function URLs correct in environment

**Test**:
```bash
# Check webhook registration
# In Shopify admin → Settings → Notifications → Webhooks

# Should see webhooks pointing to:
# https://app.commercive.co/webhooks
```

---

## 📊 Pre-Deployment Checklist

Before deploying, make sure:

- [ ] All Lambda functions are deployed and working
- [ ] All 22 DynamoDB tables exist (run `setup_database.py` if not)
- [ ] AWS IAM user has DynamoDB read/write permissions
- [ ] You have AWS Access Key ID and Secret Access Key
- [ ] Shopify API credentials are ready
- [ ] Lambda Function URLs are noted down

---

## 📊 Post-Deployment Checklist

After deploying, verify:

- [ ] Build completed successfully in Vercel
- [ ] App opens in Shopify without errors
- [ ] No deprecation warnings in browser console
- [ ] Session records appear in DynamoDB
- [ ] Webhooks are being received
- [ ] Orders sync to DynamoDB
- [ ] Dashboard users are created
- [ ] Affiliate/Admin dashboards can access data

---

## 🎉 Success Criteria

Your deployment is successful when:

1. ✅ **No Errors**: App loads without 500 error or session errors
2. ✅ **No Warnings**: Browser console is clean
3. ✅ **Sessions Work**: DynamoDB shows session records
4. ✅ **Webhooks Work**: Orders/inventory sync to DynamoDB
5. ✅ **Users Created**: Dashboard users auto-created via Lambda
6. ✅ **Dashboards Work**: Affiliate and admin dashboards show data

---

## 📞 Need Help?

If you encounter issues:

1. **Check Documentation**:
   - `FIXES_SUMMARY.md` - What was fixed
   - `DEPLOYMENT_GUIDE.md` - Detailed deployment steps
   - `README.md` - Project documentation

2. **Check Logs**:
   - Vercel: Dashboard → Logs
   - Lambda: CloudWatch Logs
   - DynamoDB: AWS Console

3. **Verify Environment**:
   - All variables set in Vercel
   - AWS credentials are correct
   - DynamoDB tables exist

---

## 📝 Quick Reference

### Files Changed:
- ✅ `package.json` - New dependencies
- ✅ `app/db.server.ts` - DynamoDB client
- ✅ `app/shopify.server.ts` - DynamoDB session storage
- ✅ `app/routes/app.tsx` - Fixed AppProvider
- ✅ `.env.example` - AWS credentials
- ❌ `prisma/` - Deleted

### Environment Variables Needed:
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL
LAMBDA_AUTH_URL
LAMBDA_USERS_URL
LAMBDA_STORES_URL
LAMBDA_INVENTORY_URL
LAMBDA_ORDERS_URL
LAMBDA_WEBHOOKS_URL
LAMBDA_ADMIN_URL
```

### DynamoDB Table Used:
- `commercive_shopify_sessions` (for Shopify OAuth sessions)

### Next Steps After Success:
1. Monitor logs for 24 hours
2. Test with real orders
3. Verify affiliate dashboard integration
4. Test all webhook types
5. Monitor DynamoDB for proper data storage

---

**Prepared By**: Claude Code
**Date**: December 24, 2025
**Status**: Ready for Deployment
**Estimated Time**: 15-30 minutes
