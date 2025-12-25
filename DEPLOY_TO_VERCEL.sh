#!/bin/bash
#
# Rigorous Deployment Script for Commercive Shopify App
# ======================================================
#
# This script ensures all changes are properly deployed to Vercel
# with a clean build and no caching issues.
#
# Author: Claude Code
# Date: December 24, 2025
#

set -e  # Exit on any error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Commercive Shopify App - Deploy to Vercel${NC}"
echo -e "${BOLD}========================================${NC}\n"

# Step 1: Check we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ Error: package.json not found${NC}"
    echo -e "${YELLOW}Please run this script from the commercive-app-v2-main directory${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found package.json\n"

# Step 2: Install Vercel CLI if not installed
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Vercel CLI not found. Installing...${NC}"
    npm install -g vercel
    echo -e "${GREEN}✓${NC} Vercel CLI installed\n"
else
    echo -e "${GREEN}✓${NC} Vercel CLI already installed\n"
fi

# Step 3: Clean build artifacts
echo -e "${BLUE}Cleaning build artifacts...${NC}"
rm -rf build/
rm -rf .vercel/
rm -rf node_modules/
echo -e "${GREEN}✓${NC} Build artifacts cleaned\n"

# Step 4: Install dependencies (fresh install)
echo -e "${BLUE}Installing dependencies (this may take a few minutes)...${NC}"
npm install
echo -e "${GREEN}✓${NC} Dependencies installed\n"

# Step 5: Verify package.json has correct dependencies
echo -e "${BLUE}Verifying package.json...${NC}"

if grep -q "@shopify/shopify-app-session-storage-prisma" package.json; then
    echo -e "${RED}✗ ERROR: package.json still contains Prisma!${NC}"
    echo -e "${YELLOW}This should not happen. The fix may not have been applied.${NC}"
    exit 1
fi

if grep -q "@shopify/shopify-app-session-storage-dynamodb" package.json; then
    echo -e "${GREEN}✓${NC} DynamoDB session storage package found\n"
else
    echo -e "${RED}✗ ERROR: DynamoDB session storage package not found!${NC}"
    exit 1
fi

# Step 6: Verify node_modules has DynamoDB package
if [ -d "node_modules/@shopify/shopify-app-session-storage-dynamodb" ]; then
    echo -e "${GREEN}✓${NC} DynamoDB session storage installed in node_modules\n"
else
    echo -e "${RED}✗ ERROR: DynamoDB package not in node_modules!${NC}"
    exit 1
fi

# Step 7: Check for Prisma in node_modules (should not exist)
if [ -d "node_modules/@shopify/shopify-app-session-storage-prisma" ]; then
    echo -e "${RED}✗ ERROR: Prisma package still in node_modules!${NC}"
    echo -e "${YELLOW}Removing...${NC}"
    rm -rf node_modules/@shopify/shopify-app-session-storage-prisma
    rm -rf node_modules/@prisma
    rm -rf node_modules/prisma
    echo -e "${GREEN}✓${NC} Prisma packages removed\n"
else
    echo -e "${GREEN}✓${NC} No Prisma packages in node_modules\n"
fi

# Step 8: Build locally to verify it works
echo -e "${BLUE}Testing build locally...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Local build successful\n"
else
    echo -e "${RED}✗ ERROR: Local build failed!${NC}"
    echo -e "${YELLOW}Please fix build errors before deploying.${NC}"
    exit 1
fi

# Step 9: Initialize git if not already initialized
if [ ! -d ".git" ]; then
    echo -e "${BLUE}Initializing git repository...${NC}"
    git init
    git add .
    git commit -m "Fix: Migrate to DynamoDB session storage

- Replace Prisma with DynamoDB for session storage
- Fix App-Bridge deprecation warning
- Update dependencies to use AWS SDK
- Remove PostgreSQL database dependency
- Add comprehensive documentation

This commit includes all necessary changes for production deployment."
    echo -e "${GREEN}✓${NC} Git repository initialized and changes committed\n"
else
    echo -e "${BLUE}Git repository exists. Committing changes...${NC}"
    git add .
    git commit -m "Fix: Migrate to DynamoDB session storage" || echo "No changes to commit"
    echo -e "${GREEN}✓${NC} Changes committed\n"
fi

# Step 10: Deploy to Vercel
echo -e "${BOLD}${BLUE}========================================${NC}"
echo -e "${BOLD}${BLUE}Ready to Deploy to Vercel${NC}"
echo -e "${BOLD}${BLUE}========================================${NC}\n"

echo -e "${YELLOW}IMPORTANT: Before proceeding, make sure you have set these environment variables in Vercel:${NC}"
echo -e "  - AWS_ACCESS_KEY_ID"
echo -e "  - AWS_SECRET_ACCESS_KEY"
echo -e "  - AWS_REGION=us-east-1"
echo -e "  - SHOPIFY_API_KEY"
echo -e "  - SHOPIFY_API_SECRET"
echo -e "  - SHOPIFY_APP_URL"
echo -e "  - All LAMBDA_*_URL variables\n"

echo -e "${BOLD}Do you want to proceed with deployment? (yes/no):${NC} "
read -r CONFIRM

if [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "y" ]; then
    echo -e "${YELLOW}Deployment cancelled.${NC}"
    exit 0
fi

echo -e "\n${BLUE}Deploying to Vercel with --force to clear cache...${NC}\n"

# Deploy with force flag to ensure fresh build
vercel --prod --force

echo -e "\n${BOLD}${GREEN}========================================${NC}"
echo -e "${BOLD}${GREEN}Deployment Complete!${NC}"
echo -e "${BOLD}${GREEN}========================================${NC}\n"

echo -e "${GREEN}✓${NC} Code deployed to Vercel"
echo -e "${GREEN}✓${NC} Build cache cleared (--force flag used)"
echo -e "${GREEN}✓${NC} Fresh build with new dependencies\n"

echo -e "${BOLD}Next Steps:${NC}"
echo -e "1. Check Vercel deployment logs for any errors"
echo -e "2. Verify environment variables are set in Vercel dashboard"
echo -e "3. Test the app in Shopify admin"
echo -e "4. Check Vercel logs - should see no Prisma errors\n"

echo -e "${BOLD}Verification Commands:${NC}"
echo -e "  vercel logs                  # View deployment logs"
echo -e "  python3 verify_table.py      # Verify DynamoDB table schema\n"
