# Lambda Function Authentication Fix

## Problem
Your Lambda functions are returning 401 Unauthorized errors because they're not properly configured to accept authentication from the Shopify app.

## Solution

### 1. Update Lambda Function Code

Add this authentication middleware to each of your Lambda functions:

```javascript
// Add to the top of each Lambda function
const VALID_AUTH_TOKEN = process.env.LAMBDA_AUTH_TOKEN;
const VALID_API_KEY = process.env.SHOPIFY_API_KEY;

function validateAuth(event) {
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];
    const apiKeyHeader = event.headers?.['x-shopify-api-key'] || event.headers?.['X-Shopify-Api-Key'];
    
    // Check Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === VALID_AUTH_TOKEN) {
            return true;
        }
    }
    
    // Check API key
    if (apiKeyHeader === VALID_API_KEY) {
        return true;
    }
    
    return false;
}

// Add to the beginning of your Lambda handler
exports.handler = async (event) => {
    // Skip auth for health checks
    if (event.rawPath === '/health') {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                status: 'healthy',
                version: '1.0.0',
                timestamp: new Date().toISOString()
            })
        };
    }
    
    // Validate authentication
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
    
    // Your existing Lambda function code continues here...
};
```

### 2. Update Environment Variables in Lambda

For each Lambda function, add these environment variables:

```bash
LAMBDA_AUTH_TOKEN=<the-token-you-generated>
SHOPIFY_API_KEY=<your-shopify-api-key>
```

### 3. Update Specific Lambda Functions

#### Stores Lambda Function
This is the one causing the 401 errors in your logs. Update it with:

```javascript
// stores Lambda function
exports.handler = async (event) => {
    // Add health check
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
    
    // Add authentication check
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
    
    // Handle GET /stores request
    if (event.requestContext.http.method === 'GET' && event.rawPath === '/stores') {
        const storeUrl = event.queryStringParameters?.store_url;
        
        if (!storeUrl) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'store_url parameter is required'
                })
            };
        }
        
        // Your existing store lookup logic here
        // Return the store data or null if not found
    }
    
    // Handle other routes...
};
```

### 4. Quick Fix Commands

Run these commands to update your Lambda functions:

```bash
# Update environment variables for each Lambda function
aws lambda update-function-configuration \
    --function-name your-stores-lambda-function \
    --environment Variables="{LAMBDA_AUTH_TOKEN=your-token,SHOPIFY_API_KEY=your-api-key}"

# Repeat for each Lambda function
```

### 5. Test the Fix

After updating the Lambda functions:

1. Deploy your Shopify app: `./deploy-latest.sh`
2. Test the health endpoint: `curl https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws/health`
3. Install the app in a test Shopify store
4. Check that the 401 errors are resolved

## Expected Result

After this fix:
- ✅ No more 401 Unauthorized errors
- ✅ Store data loads properly
- ✅ App shows the latest version
- ✅ Backend connectivity works