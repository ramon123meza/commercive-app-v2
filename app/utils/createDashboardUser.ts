import { supabase } from "../supabase.server";
import { randomUUID } from "crypto";

/**
 * FIX Issue 19: Auto-create dashboard user when Shopify merchant installs app
 *
 * This function creates a user account in the dashboard system automatically
 * when a merchant installs the Shopify app, eliminating the manual signup process.
 */
export async function createDashboardUser({
  shopDomain,
  email,
  shopName,
}: {
  shopDomain: string;
  email?: string;
  shopName?: string;
}) {
  try {
    console.log(`[createDashboardUser] Starting for shop: ${shopDomain}`);

    // 1. Check if store already exists in stores table
    const { data: existingStore } = await supabase
      .from("stores")
      .select("id, store_url")
      .eq("store_url", shopDomain)
      .single();

    if (existingStore) {
      console.log(`[createDashboardUser] Store already exists: ${shopDomain}`);

      // Check if there's already a user linked to this store
      const { data: existingLink } = await supabase
        .from("store_to_user")
        .select("user_id")
        .eq("store_id", existingStore.id)
        .single();

      if (existingLink) {
        console.log(`[createDashboardUser] User already linked to store`);
        return { success: true, existing: true };
      }
    }

    // 2. If no email provided, create a default email based on shop domain
    const userEmail = email || `${shopDomain.split(".")[0]}@shopify-merchant.commercive.co`;
    const displayName = shopName || shopDomain.split(".")[0];

    // 3. Check if user already exists with this email
    const { data: existingUser } = await supabase
      .from("user")
      .select("id, email")
      .eq("email", userEmail)
      .single();

    let userId: string;
    let tempPassword: string | null = null;

    if (existingUser) {
      console.log(`[createDashboardUser] User already exists: ${userEmail}`);
      userId = existingUser.id;
    } else {
      // 4. Create Supabase auth user with temporary password
      tempPassword = generateSecurePassword();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userEmail,
        password: tempPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          shop_domain: shopDomain,
          created_via: "shopify_oauth",
        },
      });

      if (authError) {
        console.error(`[createDashboardUser] Auth creation failed:`, authError);
        throw authError;
      }

      console.log(`[createDashboardUser] Supabase auth user created: ${authData.user.id}`);

      // 5. Insert into 'user' table
      const { data: userData, error: userError } = await supabase
        .from("user")
        .insert({
          id: authData.user.id,
          email: userEmail,
          user_name: displayName,
          role: "user",
          first_name: displayName,
        })
        .select()
        .single();

      if (userError) {
        console.error(`[createDashboardUser] User table insert failed:`, userError);
        throw userError;
      }

      userId = userData.id;
      console.log(`[createDashboardUser] User record created: ${userId}`);
    }

    // 6. Upsert store in 'stores' table
    const { data: storeData, error: storeError } = await supabase
      .from("stores")
      .upsert(
        {
          store_url: shopDomain,
          store_name: displayName,
          is_inventory_fetched: false,
          is_store_listed: true,
        },
        { onConflict: "store_url" }
      )
      .select()
      .single();

    if (storeError) {
      console.error(`[createDashboardUser] Store upsert failed:`, storeError);
      throw storeError;
    }

    console.log(`[createDashboardUser] Store record created/updated: ${storeData.id}`);

    // 7. Link user to store in 'store_to_user' table
    // First check if link already exists to avoid duplicates
    const { data: existingLinkCheck } = await supabase
      .from("store_to_user")
      .select("uuid")
      .eq("user_id", userId)
      .eq("store_id", storeData.id)
      .single();

    if (!existingLinkCheck) {
      // Create new link with required uuid field
      const { error: linkError } = await supabase
        .from("store_to_user")
        .insert({
          uuid: randomUUID(),
          user_id: userId,
          store_id: storeData.id,
        });

      if (linkError) {
        console.error(`[createDashboardUser] Store-user link failed:`, linkError);
        throw linkError;
      }
    } else {
      console.log(`[createDashboardUser] User-store link already exists`);
    }

    console.log(`[createDashboardUser] User linked to store successfully`);

    // 8. Send welcome email with dashboard link and temporary password
    if (!existingUser) {
      // Only send email for newly created users
      try {
        await sendWelcomeEmail(userEmail, shopDomain, displayName, tempPassword);
        console.log(`[createDashboardUser] Welcome email sent to ${userEmail}`);
      } catch (emailError) {
        console.error(`[createDashboardUser] Failed to send welcome email:`, emailError);
        // Don't fail the whole process if email fails
      }
    }

    return {
      success: true,
      userId,
      storeId: storeData.id,
      email: userEmail,
    };
  } catch (error) {
    console.error(`[createDashboardUser] Failed for ${shopDomain}:`, error);
    // Don't throw - we don't want to block Shopify app installation if dashboard creation fails
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate a secure random password for temporary use
 */
function generateSecurePassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Send welcome email to new merchant using MailerSend
 * @param email Merchant email
 * @param shopDomain Shop domain
 * @param displayName Store display name
 * @param tempPassword Temporary password for dashboard access
 */
async function sendWelcomeEmail(
  email: string,
  shopDomain: string,
  displayName: string,
  tempPassword: string
): Promise<void> {
  const maxRetries = 3;
  const apiKey = process.env.MAILERSEND_APIKEY;
  const dashboardUrl = process.env.NEXT_PUBLIC_CLIENT_URL || "https://dashboard.commercive.co";

  if (!apiKey) {
    console.warn(`[sendWelcomeEmail] MAILERSEND_APIKEY not configured. Skipping email send.`);
    return;
  }

  const emailData = {
    from: {
      email: "noreply@commercive.co",
      name: "Commercive Team"
    },
    to: [
      {
        email: email,
        name: displayName
      }
    ],
    subject: "Welcome to Commercive - Your Dashboard is Ready!",
    html: generateWelcomeEmailHTML(displayName, shopDomain, dashboardUrl, email, tempPassword),
    text: generateWelcomeEmailText(displayName, shopDomain, dashboardUrl, email, tempPassword)
  };

  // Retry logic for email sending
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[sendWelcomeEmail] Attempt ${attempt}/${maxRetries} to send email to ${email}`);

      const response = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        const responseData = await response.json().catch(() => ({}));
        console.log(`[sendWelcomeEmail] Email sent successfully to ${email}`, responseData);
        return;
      }

      const errorText = await response.text();
      console.warn(`[sendWelcomeEmail] Attempt ${attempt}/${maxRetries} failed with status ${response.status}:`, errorText);

      if (attempt === maxRetries) {
        throw new Error(`Failed to send email after ${maxRetries} attempts. Last status: ${response.status}`);
      }

      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));

    } catch (error) {
      console.error(`[sendWelcomeEmail] Attempt ${attempt}/${maxRetries} error:`, error);

      if (attempt === maxRetries) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

/**
 * Generate HTML email template for welcome email
 */
function generateWelcomeEmailHTML(
  displayName: string,
  shopDomain: string,
  dashboardUrl: string,
  email: string,
  tempPassword: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Commercive</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Commercive!</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${displayName},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! Your Shopify store <strong>${shopDomain}</strong> has been successfully connected to Commercive.
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      We've automatically created a dashboard account for you. Use the credentials below to access your full Commercive dashboard:
    </p>

    <div style="background: white; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 10px 0;"><strong>Dashboard URL:</strong> <a href="${dashboardUrl}" style="color: #667eea;">${dashboardUrl}</a></p>
      <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
      <p style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background: #f0f0f0; padding: 5px 10px; border-radius: 3px; font-size: 14px;">${tempPassword}</code></p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">Access Your Dashboard</a>
    </div>

    <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="margin: 0; color: #856404; font-size: 14px;">
        <strong>Important:</strong> Please change your password after your first login for security purposes.
      </p>
    </div>

    <p style="font-size: 16px; margin-top: 30px;">
      What you can do with Commercive:
    </p>
    <ul style="font-size: 15px; line-height: 1.8;">
      <li>Track all your orders in real-time</li>
      <li>Monitor inventory levels and backorders</li>
      <li>Manage fulfillments and shipments</li>
      <li>View comprehensive analytics</li>
    </ul>

    <p style="font-size: 16px; margin-top: 30px;">
      If you have any questions or need assistance, don't hesitate to reach out to our support team at
      <a href="mailto:support@commercive.co" style="color: #667eea;">support@commercive.co</a>.
    </p>

    <p style="font-size: 16px; margin-top: 30px;">
      Best regards,<br>
      <strong>The Commercive Team</strong>
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>This email was sent to ${email} because your Shopify store was connected to Commercive.</p>
    <p>&copy; ${new Date().getFullYear()} Commercive. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email template for welcome email
 */
function generateWelcomeEmailText(
  displayName: string,
  shopDomain: string,
  dashboardUrl: string,
  email: string,
  tempPassword: string
): string {
  return `
Welcome to Commercive!

Hi ${displayName},

Great news! Your Shopify store ${shopDomain} has been successfully connected to Commercive.

We've automatically created a dashboard account for you. Use the credentials below to access your full Commercive dashboard:

Dashboard URL: ${dashboardUrl}
Email: ${email}
Temporary Password: ${tempPassword}

IMPORTANT: Please change your password after your first login for security purposes.

What you can do with Commercive:
- Track all your orders in real-time
- Monitor inventory levels and backorders
- Manage fulfillments and shipments
- View comprehensive analytics

If you have any questions or need assistance, don't hesitate to reach out to our support team at support@commercive.co.

Best regards,
The Commercive Team

---
This email was sent to ${email} because your Shopify store was connected to Commercive.
© ${new Date().getFullYear()} Commercive. All rights reserved.
  `.trim();
}
