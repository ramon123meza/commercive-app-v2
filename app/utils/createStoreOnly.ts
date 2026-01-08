/**
 * Create Store Only via Lambda (No User Creation)
 *
 * This function is called after successful Shopify OAuth to register
 * the store in the system WITHOUT creating a dashboard user.
 *
 * Users must sign up manually on the affiliate dashboard and wait for
 * admin approval before they can link their store using the store code.
 */

import { upsertStore, getStore } from './lambdaClient';
import type { UpsertStorePayload, Store } from '~/types/api.types';
import { generateStoreCode } from './generateStoreCode';

interface CreateStoreOnlyParams {
  shopDomain: string;
  accessToken: string;
  email?: string;
  shopName?: string;
}

interface CreateStoreOnlyResult {
  success: boolean;
  storeId?: string;
  storeCode?: string;
  error?: string;
}

/**
 * Create or update store record in DynamoDB
 * Generates a unique store code that users will use to link their account
 */
export async function createStoreOnly(
  params: CreateStoreOnlyParams
): Promise<CreateStoreOnlyResult> {
  const { shopDomain, accessToken, email, shopName } = params;

  try {
    console.log(`[createStoreOnly] Starting for shop: ${shopDomain}`);

    // Check if store already exists
    const existingStore = await getStore(shopDomain);

    if (existingStore && existingStore.store_code) {
      console.log(`[createStoreOnly] Store already exists with code: ${existingStore.store_code}`);

      // Update access token (it may have changed during re-install)
      const storeData: UpsertStorePayload = {
        store_url: shopDomain,
        shop_name: shopName || shopDomain,
        email: email || '',
        access_token: accessToken,
        store_code: existingStore.store_code, // Keep existing code
      };

      const store = await upsertStore(storeData);

      return {
        success: true,
        storeId: store.store_id,
        storeCode: existingStore.store_code,
      };
    }

    // Generate new store code for new installations
    const storeCode = generateStoreCode();
    console.log(`[createStoreOnly] Generated store code: ${storeCode}`);

    const storeData: UpsertStorePayload = {
      store_url: shopDomain,
      shop_name: shopName || shopDomain,
      email: email || '',
      access_token: accessToken,
      store_code: storeCode,
    };

    console.log(`[createStoreOnly] Upserting store: ${shopDomain}`);

    const store = await upsertStore(storeData);

    console.log(`[createStoreOnly] Store created/updated successfully`);

    return {
      success: true,
      storeId: store.store_id,
      storeCode: storeCode,
    };
  } catch (error: any) {
    console.error('[createStoreOnly] Error:', error);

    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}
