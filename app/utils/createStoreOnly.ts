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
import { LAMBDA_URLS } from '~/config/lambda.server';
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
    console.log(`[createStoreOnly] ====== STARTING ======`);
    console.log(`[createStoreOnly] Shop domain: ${shopDomain}`);
    console.log(`[createStoreOnly] Access token exists: ${!!accessToken}`);
    console.log(`[createStoreOnly] Email: ${email || 'not provided'}`);
    console.log(`[createStoreOnly] Shop name: ${shopName || 'not provided'}`);

    // Validate Lambda URL is configured
    const storesLambdaUrl = LAMBDA_URLS.stores;
    console.log(`[createStoreOnly] Lambda URL configured: ${storesLambdaUrl ? 'YES' : 'NO (EMPTY!)'}`);
    console.log(`[createStoreOnly] Lambda URL value: ${storesLambdaUrl || 'EMPTY'}`);

    if (!storesLambdaUrl) {
      console.error('[createStoreOnly] CRITICAL: LAMBDA_STORES_URL is not configured!');
      return {
        success: false,
        error: 'LAMBDA_STORES_URL environment variable is not configured',
      };
    }

    // Check if store already exists
    console.log(`[createStoreOnly] Checking if store exists...`);
    let existingStore: Store | null = null;

    try {
      existingStore = await getStore(shopDomain);
      console.log(`[createStoreOnly] getStore result: ${existingStore ? 'Found' : 'Not found'}`);
      if (existingStore) {
        console.log(`[createStoreOnly] Existing store code: ${existingStore.store_code || 'NONE'}`);
      }
    } catch (getError: any) {
      console.error(`[createStoreOnly] getStore error:`, getError.message);
      // Continue - we'll create a new store
    }

    if (existingStore && existingStore.store_code) {
      console.log(`[createStoreOnly] Store exists with code: ${existingStore.store_code}`);

      // Update access token (it may have changed during re-install)
      const storeData: UpsertStorePayload = {
        store_url: shopDomain,
        shop_name: shopName || shopDomain,
        email: email || '',
        access_token: accessToken,
        store_code: existingStore.store_code, // Keep existing code
      };

      console.log(`[createStoreOnly] Calling upsertStore to update existing store...`);
      const store = await upsertStore(storeData);
      console.log(`[createStoreOnly] upsertStore returned: ${JSON.stringify(store)}`);

      return {
        success: true,
        storeId: store.store_id,
        storeCode: existingStore.store_code,
      };
    }

    // Generate new store code for new installations
    const storeCode = generateStoreCode();
    console.log(`[createStoreOnly] Generated new store code: ${storeCode}`);

    const storeData: UpsertStorePayload = {
      store_url: shopDomain,
      shop_name: shopName || shopDomain,
      email: email || '',
      access_token: accessToken,
      store_code: storeCode,
    };

    console.log(`[createStoreOnly] Calling upsertStore to create new store...`);
    console.log(`[createStoreOnly] Payload: ${JSON.stringify({ ...storeData, access_token: '[REDACTED]' })}`);

    const store = await upsertStore(storeData);

    console.log(`[createStoreOnly] upsertStore returned: ${JSON.stringify(store)}`);
    console.log(`[createStoreOnly] ====== SUCCESS ======`);

    return {
      success: true,
      storeId: store.store_id,
      storeCode: storeCode,
    };
  } catch (error: any) {
    console.error('[createStoreOnly] ====== ERROR ======');
    console.error('[createStoreOnly] Error type:', error?.constructor?.name);
    console.error('[createStoreOnly] Error message:', error?.message);
    console.error('[createStoreOnly] Error stack:', error?.stack);

    if (error?.response) {
      console.error('[createStoreOnly] Response status:', error.response?.status);
      console.error('[createStoreOnly] Response data:', JSON.stringify(error.response?.data));
    }

    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}
