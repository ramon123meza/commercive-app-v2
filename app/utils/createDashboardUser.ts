/**
 * Create Dashboard User via Lambda
 *
 * This function is called after successful Shopify OAuth to automatically
 * create a user account in the affiliate dashboard system.
 *
 * Updated to use Lambda functions instead of Supabase.
 */

import { createShopifyMerchant, upsertStore } from './lambdaClient';
import type { CreateMerchantPayload, UpsertStorePayload } from '~/types/api.types';

interface CreateDashboardUserParams {
  shopDomain: string;
  accessToken: string;
  email?: string;
  shopName?: string;
}

interface CreateDashboardUserResult {
  success: boolean;
  userId?: string;
  storeId?: string;
  dashboardUrl?: string;
  error?: string;
}

/**
 * Auto-create dashboard user and link to Shopify store
 */
export async function createDashboardUserViaLambda(
  params: CreateDashboardUserParams
): Promise<CreateDashboardUserResult> {
  const { shopDomain, accessToken, email, shopName } = params;

  try {
    console.log(`[createDashboardUser] Starting for shop: ${shopDomain}`);

    // Generate temporary password (user will need to reset via email)
    const tempPassword = generateTempPassword();

    // Prepare merchant data
    const merchantData: CreateMerchantPayload = {
      email: email || `${shopDomain.split('.')[0]}@temp.commercive.com`,
      password: tempPassword,
      first_name: shopName || shopDomain.split('.')[0],
      last_name: 'Store',
      store_url: shopDomain,
      phone: '',
    };

    console.log(`[createDashboardUser] Creating merchant: ${merchantData.email}`);

    // Create merchant user via Lambda
    const userResponse = await createShopifyMerchant(merchantData);

    if (!userResponse || !userResponse.user_id) {
      throw new Error(userResponse?.message || 'Failed to create merchant');
    }

    console.log(`[createDashboardUser] Merchant created: ${userResponse.user_id}`);

    // Upsert store data with user_id for linking
    const storeData: UpsertStorePayload = {
      store_url: shopDomain,
      shop_name: shopName || shopDomain,
      email: email || merchantData.email,
      access_token: accessToken,
      user_id: userResponse.user_id,  // Link user to store
    };

    console.log(`[createDashboardUser] Upserting store: ${shopDomain}`);

    const store = await upsertStore(storeData);

    console.log(`[createDashboardUser] Store created/updated successfully`);

    // Send welcome email (optional - if using MailerSend)
    if (process.env.MAILERSEND_APIKEY && email) {
      await sendWelcomeEmail(email, shopName || shopDomain, tempPassword).catch(
        (err) => {
          console.error('[createDashboardUser] Failed to send welcome email:', err);
          // Non-blocking - continue even if email fails
        }
      );
    }

    // Get dashboard URL
    const dashboardUrl =
      process.env.AFFILIATE_DASHBOARD_URL || 'https://dashboard.commercive.com';

    return {
      success: true,
      userId: userResponse.user_id,
      storeId: store.store_id,
      dashboardUrl: `${dashboardUrl}/login`,
    };
  } catch (error: any) {
    console.error('[createDashboardUser] Error:', error);

    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Generate a secure temporary password
 */
function generateTempPassword(): string {
  const length = 16;
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }

  return password;
}

/**
 * Send welcome email via MailerSend (optional)
 */
async function sendWelcomeEmail(
  email: string,
  shopName: string,
  tempPassword: string
): Promise<void> {
  if (!process.env.MAILERSEND_APIKEY) {
    console.log('[sendWelcomeEmail] Skipping - no API key configured');
    return;
  }

  const dashboardUrl = process.env.AFFILIATE_DASHBOARD_URL || 'https://dashboard.commercive.com';

  const emailData = {
    from: {
      email: 'noreply@commercive.com',
      name: 'Commercive',
    },
    to: [
      {
        email: email,
        name: shopName,
      },
    ],
    subject: 'Welcome to Commercive Dashboard',
    html: `
      <h2>Welcome to Commercive, ${shopName}!</h2>
      <p>Your Shopify store has been successfully connected to the Commercive platform.</p>
      <p><strong>Access your dashboard:</strong></p>
      <ul>
        <li>Dashboard URL: <a href="${dashboardUrl}">${dashboardUrl}</a></li>
        <li>Email: ${email}</li>
        <li>Temporary Password: <code>${tempPassword}</code></li>
      </ul>
      <p><strong>Important:</strong> Please reset your password after your first login for security.</p>
      <p>If you have any questions, contact our support team.</p>
      <p>Best regards,<br>The Commercive Team</p>
    `,
    text: `
Welcome to Commercive, ${shopName}!

Your Shopify store has been successfully connected to the Commercive platform.

Access your dashboard:
- Dashboard URL: ${dashboardUrl}
- Email: ${email}
- Temporary Password: ${tempPassword}

Important: Please reset your password after your first login for security.

If you have any questions, contact our support team.

Best regards,
The Commercive Team
    `,
  };

  try {
    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MAILERSEND_APIKEY}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      throw new Error(`MailerSend API error: ${response.statusText}`);
    }

    console.log('[sendWelcomeEmail] Email sent successfully');
  } catch (error) {
    console.error('[sendWelcomeEmail] Error:', error);
    throw error;
  }
}
