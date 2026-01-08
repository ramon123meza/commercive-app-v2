#!/bin/bash

# Environment Setup Script for Shopify App
# This script configures all necessary environment variables for proper deployment

echo "🔧 Setting up Shopify App Environment Variables..."

# Check if we're in a Vercel project
if [ ! -f "vercel.json" ]; then
    echo "❌ Error: Not in a Vercel project directory"
    exit 1
fi

# Function to set environment variable
set_env_var() {
    local key=$1
    local value=$2
    local description=$3
    
    echo "Setting $key..."
    echo "$value" | vercel env add "$key" production --force
}

# Core Shopify Configuration
echo "📱 Setting up Shopify configuration..."
read -p "Enter your Shopify API Key: " SHOPIFY_API_KEY
read -p "Enter your Shopify API Secret: " SHOPIFY_API_SECRET

set_env_var "SHOPIFY_API_KEY" "$SHOPIFY_API_KEY" "Shopify API Key"
set_env_var "SHOPIFY_API_SECRET" "$SHOPIFY_API_SECRET" "Shopify API Secret"
set_env_var "SHOPIFY_APP_URL" "https://app.commercive.co" "Shopify App URL"

# AWS Configuration
echo "☁️ Setting up AWS configuration..."
read -p "Enter your AWS Access Key ID: " AWS_ACCESS_KEY_ID
read -p "Enter your AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY

set_env_var "AWS_ACCESS_KEY_ID" "$AWS_ACCESS_KEY_ID" "AWS Access Key"
set_env_var "AWS_SECRET_ACCESS_KEY" "$AWS_SECRET_ACCESS_KEY" "AWS Secret Key"
set_env_var "AWS_REGION" "us-east-1" "AWS Region"

# Lambda Function URLs (from your .env.example)
echo "🔗 Setting up Lambda function URLs..."
set_env_var "LAMBDA_AUTH_URL" "https://6khukjgv7faqtw2f6baa4yal4m0jouxo.lambda-url.us-east-1.on.aws" "Auth Lambda URL"
set_env_var "LAMBDA_USERS_URL" "https://ktncswuqqjzgnlfkjhiiwu3ljm0jnyqx.lambda-url.us-east-1.on.aws" "Users Lambda URL"
set_env_var "LAMBDA_STORES_URL" "https://26cu44sxmbuz3ygh4nyjjfj3ze0zzwvg.lambda-url.us-east-1.on.aws" "Stores Lambda URL"
set_env_var "LAMBDA_INVENTORY_URL" "https://zpomoosqyuqqi5zcdvg5gqjs6u0sxsoc.lambda-url.us-east-1.on.aws" "Inventory Lambda URL"
set_env_var "LAMBDA_ORDERS_URL" "https://yc3j2t47wqsbgpjclgdi76a6pi0lhzfg.lambda-url.us-east-1.on.aws" "Orders Lambda URL"
set_env_var "LAMBDA_WEBHOOKS_URL" "https://npucikkafr4ywr3fdv672ukuie0lqlsq.lambda-url.us-east-1.on.aws" "Webhooks Lambda URL"
set_env_var "LAMBDA_ADMIN_URL" "https://oyerbhhyxxomzgowei6ysfnjg40amtmr.lambda-url.us-east-1.on.aws" "Admin Lambda URL"

# Authentication Token for Lambda Functions
echo "🔐 Setting up authentication..."
read -p "Enter a secure authentication token for Lambda functions (or press Enter to generate): " LAMBDA_AUTH_TOKEN

if [ -z "$LAMBDA_AUTH_TOKEN" ]; then
    # Generate a secure random token
    LAMBDA_AUTH_TOKEN=$(openssl rand -base64 32)
    echo "Generated authentication token: $LAMBDA_AUTH_TOKEN"
fi

set_env_var "LAMBDA_AUTH_TOKEN" "$LAMBDA_AUTH_TOKEN" "Lambda Authentication Token"

# Dashboard URLs
echo "🌐 Setting up dashboard URLs..."
read -p "Enter your Affiliate Dashboard URL (or press Enter for default): " AFFILIATE_DASHBOARD_URL
read -p "Enter your Admin Dashboard URL (or press Enter for default): " ADMIN_DASHBOARD_URL

AFFILIATE_DASHBOARD_URL=${AFFILIATE_DASHBOARD_URL:-"https://dashboard.commercive.com"}
ADMIN_DASHBOARD_URL=${ADMIN_DASHBOARD_URL:-"https://admin.commercive.com"}

set_env_var "AFFILIATE_DASHBOARD_URL" "$AFFILIATE_DASHBOARD_URL" "Affiliate Dashboard URL"
set_env_var "ADMIN_DASHBOARD_URL" "$ADMIN_DASHBOARD_URL" "Admin Dashboard URL"

echo ""
echo "✅ Environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update your Lambda functions to accept the authentication token: $LAMBDA_AUTH_TOKEN"
echo "2. Run: ./deploy-latest.sh to deploy with new configuration"
echo "3. Test the app installation in a Shopify store"
echo ""
echo "🔍 To verify environment variables:"
echo "vercel env ls"