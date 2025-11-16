import { supabase } from "../supabase.server";

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

    if (existingUser) {
      console.log(`[createDashboardUser] User already exists: ${userEmail}`);
      userId = existingUser.id;
    } else {
      // 4. Create Supabase auth user with temporary password
      const tempPassword = generateSecurePassword();

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
          username: displayName,
          role: "user",
          full_name: displayName,
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
    const { error: linkError } = await supabase
      .from("store_to_user")
      .upsert(
        {
          user_id: userId,
          store_id: storeData.id,
        },
        { onConflict: "user_id,store_id" }
      );

    if (linkError) {
      console.error(`[createDashboardUser] Store-user link failed:`, linkError);
      throw linkError;
    }

    console.log(`[createDashboardUser] User linked to store successfully`);

    // 8. TODO: Send welcome email with dashboard link
    // This can be implemented using MailerSend as the system already has it configured
    // await sendWelcomeEmail(userEmail, shopDomain);

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
 * Future: Send welcome email to new merchant
 * @param email Merchant email
 * @param shopDomain Shop domain
 */
async function sendWelcomeEmail(email: string, shopDomain: string) {
  // Implementation using MailerSend
  // This can be added later when email templates are ready
  console.log(`[sendWelcomeEmail] Would send to ${email} for ${shopDomain}`);
}
