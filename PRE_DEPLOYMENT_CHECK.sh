#!/bin/bash
#
# Pre-Deployment Verification Script
# ===================================
#
# This script verifies that ALL changes have been properly applied
# before deployment to Vercel.
#
# Run this BEFORE deploying to catch any issues.
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Pre-Deployment Verification${NC}"
echo -e "${BOLD}========================================${NC}\n"

# Check 1: package.json has correct dependencies
echo -e "${BLUE}[1/10]${NC} Checking package.json dependencies..."

if grep -q '"@prisma/client"' package.json; then
    echo -e "${RED}  ✗ FAIL: @prisma/client found in package.json${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No @prisma/client in package.json${NC}"
fi

if grep -q '"prisma"' package.json; then
    echo -e "${RED}  ✗ FAIL: prisma found in package.json${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No prisma in package.json${NC}"
fi

if grep -q '"@shopify/shopify-app-session-storage-prisma"' package.json; then
    echo -e "${RED}  ✗ FAIL: Prisma session storage found in package.json${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No Prisma session storage in package.json${NC}"
fi

if grep -q '"@shopify/shopify-app-session-storage-dynamodb"' package.json; then
    echo -e "${GREEN}  ✓ PASS: DynamoDB session storage in package.json${NC}"
else
    echo -e "${RED}  ✗ FAIL: DynamoDB session storage NOT in package.json${NC}"
    ERRORS=$((ERRORS + 1))
fi

if grep -q '"@aws-sdk/client-dynamodb"' package.json; then
    echo -e "${GREEN}  ✓ PASS: AWS SDK client in package.json${NC}"
else
    echo -e "${RED}  ✗ FAIL: AWS SDK client NOT in package.json${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: package.json build scripts
echo -e "\n${BLUE}[2/10]${NC} Checking build scripts..."

if grep -q 'prisma generate' package.json; then
    echo -e "${RED}  ✗ FAIL: 'prisma generate' found in build scripts${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No Prisma commands in build scripts${NC}"
fi

if grep -q '"build": "remix vite:build"' package.json; then
    echo -e "${GREEN}  ✓ PASS: Build script is correct${NC}"
else
    echo -e "${YELLOW}  ⚠ WARNING: Build script may be incorrect${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 3: Prisma directory should not exist
echo -e "\n${BLUE}[3/10]${NC} Checking for Prisma directory..."

if [ -d "prisma" ]; then
    echo -e "${RED}  ✗ FAIL: prisma/ directory still exists${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No prisma/ directory${NC}"
fi

# Check 4: shopify.server.ts uses DynamoDB
echo -e "\n${BLUE}[4/10]${NC} Checking shopify.server.ts..."

if grep -q 'PrismaSessionStorage' app/shopify.server.ts; then
    echo -e "${RED}  ✗ FAIL: PrismaSessionStorage still in shopify.server.ts${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No PrismaSessionStorage in shopify.server.ts${NC}"
fi

if grep -q 'DynamoDBSessionStorage' app/shopify.server.ts; then
    echo -e "${GREEN}  ✓ PASS: DynamoDBSessionStorage in shopify.server.ts${NC}"
else
    echo -e "${RED}  ✗ FAIL: DynamoDBSessionStorage NOT in shopify.server.ts${NC}"
    ERRORS=$((ERRORS + 1))
fi

if grep -q 'commercive_shopify_sessions' app/shopify.server.ts; then
    echo -e "${GREEN}  ✓ PASS: Correct table name in shopify.server.ts${NC}"
else
    echo -e "${RED}  ✗ FAIL: Table name not configured in shopify.server.ts${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 5: db.server.ts uses DynamoDB
echo -e "\n${BLUE}[5/10]${NC} Checking db.server.ts..."

if grep -q 'PrismaClient' app/db.server.ts; then
    echo -e "${RED}  ✗ FAIL: PrismaClient still in db.server.ts${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No PrismaClient in db.server.ts${NC}"
fi

if grep -q 'DynamoDBClient' app/db.server.ts; then
    echo -e "${GREEN}  ✓ PASS: DynamoDBClient in db.server.ts${NC}"
else
    echo -e "${RED}  ✗ FAIL: DynamoDBClient NOT in db.server.ts${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 6: app.tsx has correct AppProvider syntax
echo -e "\n${BLUE}[6/10]${NC} Checking app/routes/app.tsx..."

if grep -q 'config={{' app/routes/app.tsx; then
    echo -e "${GREEN}  ✓ PASS: AppProvider uses config object${NC}"
else
    echo -e "${RED}  ✗ FAIL: AppProvider not using config object${NC}"
    ERRORS=$((ERRORS + 1))
fi

if grep -q 'isEmbeddedApp' app/routes/app.tsx; then
    echo -e "${RED}  ✗ FAIL: Deprecated isEmbeddedApp prop still present${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No deprecated props in AppProvider${NC}"
fi

# Check 7: .env.example has AWS credentials
echo -e "\n${BLUE}[7/10]${NC} Checking .env.example..."

if grep -q 'AWS_ACCESS_KEY_ID' .env.example; then
    echo -e "${GREEN}  ✓ PASS: AWS_ACCESS_KEY_ID in .env.example${NC}"
else
    echo -e "${YELLOW}  ⚠ WARNING: AWS_ACCESS_KEY_ID not in .env.example${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

if grep -q 'DATABASE_URL' .env.example; then
    echo -e "${RED}  ✗ FAIL: DATABASE_URL still in .env.example${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No DATABASE_URL in .env.example${NC}"
fi

# Check 8: node_modules (if exists)
echo -e "\n${BLUE}[8/10]${NC} Checking node_modules..."

if [ -d "node_modules" ]; then
    if [ -d "node_modules/@shopify/shopify-app-session-storage-prisma" ]; then
        echo -e "${RED}  ✗ FAIL: Prisma session storage in node_modules${NC}"
        echo -e "${YELLOW}  → Run: rm -rf node_modules && npm install${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}  ✓ PASS: No Prisma session storage in node_modules${NC}"
    fi

    if [ -d "node_modules/@shopify/shopify-app-session-storage-dynamodb" ]; then
        echo -e "${GREEN}  ✓ PASS: DynamoDB session storage in node_modules${NC}"
    else
        echo -e "${YELLOW}  ⚠ WARNING: DynamoDB session storage not in node_modules${NC}"
        echo -e "${YELLOW}  → Run: npm install${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}  ⚠ INFO: node_modules doesn't exist (run npm install)${NC}"
fi

# Check 9: Build directory
echo -e "\n${BLUE}[9/10]${NC} Checking build directory..."

if [ -d "build" ]; then
    echo -e "${YELLOW}  ⚠ WARNING: build/ directory exists (old build)${NC}"
    echo -e "${YELLOW}  → Recommend deleting before deployment: rm -rf build/${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}  ✓ PASS: No old build directory${NC}"
fi

# Check 10: Package-lock.json
echo -e "\n${BLUE}[10/10]${NC} Checking package-lock.json..."

if [ -f "package-lock.json" ]; then
    if grep -q '@shopify/shopify-app-session-storage-prisma' package-lock.json; then
        echo -e "${RED}  ✗ FAIL: Prisma in package-lock.json${NC}"
        echo -e "${YELLOW}  → Run: rm package-lock.json && npm install${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}  ✓ PASS: No Prisma in package-lock.json${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ INFO: package-lock.json doesn't exist${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Summary
echo -e "\n${BOLD}========================================${NC}"
echo -e "${BOLD}Verification Summary${NC}"
echo -e "${BOLD}========================================${NC}\n"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ ALL CHECKS PASSED!${NC}"
    echo -e "${GREEN}Your code is ready for deployment.${NC}\n"
    echo -e "${BOLD}Next Steps:${NC}"
    echo -e "  1. Ensure AWS credentials are set in Vercel"
    echo -e "  2. Run: ./DEPLOY_TO_VERCEL.sh"
    echo -e "  3. Or manually deploy via Vercel dashboard\n"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠ ${WARNINGS} WARNING(S)${NC}"
    echo -e "${YELLOW}You can proceed, but review warnings above.${NC}\n"
    exit 0
else
    echo -e "${RED}${BOLD}✗ ${ERRORS} ERROR(S) FOUND${NC}"
    echo -e "${RED}Please fix the errors above before deploying.${NC}\n"

    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Also: ${WARNINGS} warning(s) to review.${NC}\n"
    fi

    echo -e "${BOLD}Common Fixes:${NC}"
    echo -e "  • Remove node_modules: ${YELLOW}rm -rf node_modules package-lock.json${NC}"
    echo -e "  • Reinstall: ${YELLOW}npm install${NC}"
    echo -e "  • Check package.json: ${YELLOW}cat package.json | grep -E 'prisma|dynamodb'${NC}\n"

    exit 1
fi
