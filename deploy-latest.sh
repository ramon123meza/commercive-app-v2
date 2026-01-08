#!/bin/bash

# Deploy Latest Version with Cache Invalidation
# This script ensures the latest version is deployed and cached properly

echo "🚀 Deploying latest Shopify app version..."

# 1. Clean build artifacts
echo "🧹 Cleaning build artifacts..."
rm -rf build/
rm -rf .vercel/
rm -rf node_modules/.cache/

# 2. Install fresh dependencies
echo "📦 Installing fresh dependencies..."
npm ci

# 3. Build the application
echo "🔨 Building application..."
npm run build

# 4. Deploy to Vercel with force flag (bypasses cache)
echo "☁️ Deploying to Vercel (force mode)..."
vercel --prod --force

# 5. Check deployment status
echo "✅ Deployment complete!"
echo ""
echo "🔍 Verify the deployment:"
echo "1. Check app.commercive.co loads the latest version"
echo "2. Test Shopify app installation"
echo "3. Verify Lambda backend connectivity"
echo ""
echo "📋 If issues persist:"
echo "1. Check Vercel environment variables"
echo "2. Verify Lambda function URLs are correct"
echo "3. Ensure LAMBDA_AUTH_TOKEN is set"