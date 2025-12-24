/**
 * Lambda Function URLs Configuration
 *
 * These URLs point to the AWS Lambda functions that handle all backend operations.
 * Replace with actual Lambda Function URLs after deployment.
 */

export const LAMBDA_URLS = {
  auth: process.env.LAMBDA_AUTH_URL || '',
  users: process.env.LAMBDA_USERS_URL || '',
  stores: process.env.LAMBDA_STORES_URL || '',
  inventory: process.env.LAMBDA_INVENTORY_URL || '',
  orders: process.env.LAMBDA_ORDERS_URL || '',
  webhooks: process.env.LAMBDA_WEBHOOKS_URL || '',
  admin: process.env.LAMBDA_ADMIN_URL || '',
} as const;

export const DASHBOARD_URLS = {
  affiliate: process.env.AFFILIATE_DASHBOARD_URL || '',
  admin: process.env.ADMIN_DASHBOARD_URL || '',
} as const;

// Validate that all Lambda URLs are configured
export function validateLambdaConfig() {
  const missing = Object.entries(LAMBDA_URLS)
    .filter(([_, url]) => !url)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.warn(`Missing Lambda URLs: ${missing.join(', ')}`);
  }

  return missing.length === 0;
}
