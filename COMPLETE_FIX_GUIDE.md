# Complete Shopify App Version & Authentication Fix

## Summary

Your Shopify app **IS running the latest version** (commit f5d37aa), but there are authentication issues preventing it from connecting to the Lambda backend. Here's the complete fix:

## 🔍 Root Cause Analysis

1. **App Version**: ✅ Latest version is deployed (`server-build-DcFQnDz3.js`)
2. **Backend Connection**: ❌ 401 Unauthorized errors from Lambda functions
3. **Authentication**: ❌ Missing authentication headers between app and Lambda
4. **Environment Variables**: ⚠️ May be missing or incorrect

## 🚀 Step-by-Step Fix

### Step 1: Update Environment Variables in Vercel

```bash
# Check current environment variables
vercel env ls

# Add the missing authentication token
vercel env add LAMBDA_AUTH_TOKEN production
# Enter a secure token (e.g., generated with: openssl rand -base64 32)

# Verify all Lambda URLs are correct
vercel env add LAMBDA_STORES_URL production
# Enter: https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws
```

### Step 2: Update Lambda Functions (Critical)

Your Lambda functions need to accept authentication. Update each Lambda function with this code:

```javascript
// Add to each Lambda function
const VALID_AUTH_TOKEN = process.env.LAMBDA_AUTH_TOKEN;

function validateAuth(event) {
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        return token === VALID_AUTH_TOKEN;
    }
    
    return false;
}

exports.handler = async (event) => {
    // Health check endpoint
    if (event.rawPath === '/health') {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                status: 'healthy',
                version: '1.0.0'
            })
        };
    }
    
    // Authentication check
    if (!validateAuth(event)) {
        return {
            statusCode: 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                success: false,
                error: 'Invalid or missing authentication token',
                error_code: 'UNAUTHORIZED'
            })
        };
    }
    
    // Your existing function code...
};
```

### Step 3: Deploy Latest Version

```bash
# Clean build and deploy
npm run build
vercel --prod --force

# Or use the deployment script
# On Windows: 
# .\deploy-latest.sh (if using Git Bash)
# On Mac/Linux: ./deploy-latest.sh
```

### Step 4: Test the Fix

1. **Test health endpoint**:
   ```bash
   curl https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws/health
   ```

2. **Install app in test store**:
   - Go to your Shopify Partners dashboard
   - Install the app in a development store
   - Check for 401 errors in logs

3. **Verify version**:
   - Open the app in Shopify admin
   - Check that it loads without errors
   - Verify store code is generated

## 🔧 Files Modified

The following files have been updated to fix the issues:

1. **`app/config/lambda.server.ts`** - Added authentication configuration
2. **`app/utils/lambdaClient.ts`** - Added authentication headers
3. **`app/routes/app._index.tsx`** - Added backend health checks and error handling
4. **`app/utils/versionCheck.ts`** - New version checking utility
5. **`deploy-latest.sh`** - Deployment script with cache busting
6. **`setup-environment.sh`** - Environment setup script

## 🎯 Expected Results After Fix

- ✅ No more 401 Unauthorized errors
- ✅ Store data loads properly in the app
- ✅ Store codes are generated and displayed
- ✅ Backend connectivity indicators work
- ✅ Latest version is confirmed running

## 🚨 If Issues Persist

1. **Check Vercel logs**:
   ```bash
   vercel logs --follow
   ```

2. **Check Lambda function logs** in AWS CloudWatch

3. **Verify environment variables**:
   ```bash
   vercel env ls
   ```

4. **Test Lambda functions directly**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws/health
   ```

## 📞 Support

If you continue to experience issues:

1. Check the Vercel deployment logs for any build errors
2. Verify all environment variables are set correctly
3. Ensure Lambda functions have been updated with authentication
4. Test the health endpoints of all Lambda functions

The app is running the latest version - the issue is purely authentication-related and should be resolved with these updates.