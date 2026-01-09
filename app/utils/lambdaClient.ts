/**
 * Lambda API Client
 *
 * This module replaces the old supabaseHelpers.tsx functionality.
 * All database operations now go through Lambda Function URLs.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { LAMBDA_URLS } from '~/config/lambda.server';
import type {
  ApiResponse,
  CreateUserPayload,
  CreateMerchantPayload,
  SignupResponse,
  UpsertStorePayload,
  Store,
  SyncOrderPayload,
  SyncInventoryPayload,
  SyncFulfillmentPayload,
  WebhookLogResponse,
  Order,
  Inventory,
  Tracking,
} from '~/types/api.types';

// Create axios instance with default config
const createApiClient = (baseURL: string): AxiosInstance => {
  return axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

/**
 * Retry helper with exponential backoff (like old Supabase helper)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Error handler for API calls
 */
function handleApiError(error: unknown, context: string): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    console.error(`Lambda API Error [${context}]:`, {
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message,
    });

    throw new Error(
      `API Error: ${axiosError.response?.data || axiosError.message}`
    );
  }

  console.error(`Unexpected Error [${context}]:`, error);
  throw error;
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Create a new user (replaces Supabase auth.admin.createUser + user insert)
 */
export async function createDashboardUser(
  userData: CreateUserPayload
): Promise<SignupResponse> {
  const client = createApiClient(LAMBDA_URLS.auth);

  return retryWithBackoff(async () => {
    try {
      const response = await client.post<SignupResponse>('/signup', userData);
      return response.data;
    } catch (error) {
      handleApiError(error, 'createDashboardUser');
    }
  });
}

/**
 * Create a Shopify merchant user (bypasses email verification)
 */
export async function createShopifyMerchant(
  merchantData: CreateMerchantPayload
): Promise<{ user_id: string; message: string }> {
  const client = createApiClient(LAMBDA_URLS.auth);

  return retryWithBackoff(async () => {
    try {
      const response = await client.post<ApiResponse<{ user_id: string; message: string }>>(
        '/create-merchant',
        merchantData
      );
      return response.data.data || { user_id: '', message: response.data.message || '' };
    } catch (error) {
      handleApiError(error, 'createShopifyMerchant');
    }
  });
}

// ============================================================================
// STORE OPERATIONS
// ============================================================================

/**
 * Upsert store data (replaces Supabase stores upsert)
 */
export async function upsertStore(
  storeData: UpsertStorePayload
): Promise<Store> {
  const client = createApiClient(LAMBDA_URLS.stores);

  return retryWithBackoff(async () => {
    try {
      const response = await client.post<ApiResponse<Store>>('/stores', storeData);
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      return response.data.data!;
    } catch (error) {
      handleApiError(error, 'upsertStore');
    }
  });
}

/**
 * Check if inventory has been fetched for a store
 */
export async function isInventoryFetched(storeUrl: string): Promise<boolean> {
  const client = createApiClient(LAMBDA_URLS.stores);

  try {
    const response = await client.get<ApiResponse<Store>>(`/stores`, {
      params: { store_url: storeUrl },
    });

    if (response.data.error || !response.data.data) {
      return false;
    }

    return response.data.data.is_inventory_fetched || false;
  } catch (error) {
    console.error('Error checking inventory fetch status:', error);
    return false;
  }
}

/**
 * Mark inventory as fetched for a store
 */
export async function setInventoryFetched(
  storeUrl: string,
  fetched = true
): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.stores);

  return retryWithBackoff(async () => {
    try {
      await client.post(`/stores/${encodeURIComponent(storeUrl)}/sync`, {
        is_inventory_fetched: fetched,
      });
    } catch (error) {
      handleApiError(error, 'setInventoryFetched');
    }
  });
}

/**
 * Get store details by shop domain
 * Uses /stores?shop_domain=xxx which routes to by-domain handler (no auth required)
 */
export async function getStore(storeUrl: string): Promise<Store | null> {
  const client = createApiClient(LAMBDA_URLS.stores);

  try {
    console.log(`[getStore] Fetching store for: ${storeUrl}`);
    const response = await client.get<ApiResponse<{ store: Store }>>('/stores', {
      params: { shop_domain: storeUrl },
    });

    console.log(`[getStore] Response:`, response.data);
    return response.data.data?.store || null;
  } catch (error) {
    console.error('[getStore] Error getting store:', error);
    return null;
  }
}

/**
 * Disconnect a store (delete all data)
 */
export async function disconnectStore(storeUrl: string): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.stores);

  return retryWithBackoff(async () => {
    try {
      await client.post(`/stores/${encodeURIComponent(storeUrl)}/disconnect`);
    } catch (error) {
      handleApiError(error, 'disconnectStore');
    }
  });
}

// ============================================================================
// ORDER OPERATIONS
// ============================================================================

/**
 * Sync order and line items to Lambda (replaces saveOrdersToSupabase + saveLineItemsToSupabase)
 */
export async function syncOrder(orderData: SyncOrderPayload): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.webhooks);

  return retryWithBackoff(async () => {
    try {
      await client.post('/webhooks/orders/create', orderData);
    } catch (error) {
      handleApiError(error, 'syncOrder');
    }
  });
}

/**
 * Get orders for a store
 */
export async function getOrders(
  storeUrl: string,
  limit = 20
): Promise<Order[]> {
  const client = createApiClient(LAMBDA_URLS.orders);

  try {
    const response = await client.get<ApiResponse<Order[]>>('/orders', {
      params: { store_url: storeUrl, limit },
    });

    return response.data.data || [];
  } catch (error) {
    console.error('Error getting orders:', error);
    return [];
  }
}

// ============================================================================
// FULFILLMENT & TRACKING OPERATIONS
// ============================================================================

/**
 * Sync fulfillment and tracking data (replaces saveFulfillmentDataToSupabase + saveTrackingData)
 */
export async function syncFulfillment(
  fulfillmentData: SyncFulfillmentPayload
): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.webhooks);

  return retryWithBackoff(async () => {
    try {
      await client.post('/webhooks/fulfillment/create', fulfillmentData);
    } catch (error) {
      handleApiError(error, 'syncFulfillment');
    }
  });
}

/**
 * Get tracking data for an order
 */
export async function getTracking(orderId: string): Promise<Tracking[]> {
  const client = createApiClient(LAMBDA_URLS.orders);

  try {
    const response = await client.get<ApiResponse<Tracking[]>>(
      `/orders/${orderId}/tracking`
    );

    return response.data.data || [];
  } catch (error) {
    console.error('Error getting tracking:', error);
    return [];
  }
}

// ============================================================================
// INVENTORY OPERATIONS
// ============================================================================

/**
 * Sync inventory data (replaces saveInventoryDataToSupabase)
 */
export async function syncInventory(
  inventoryData: SyncInventoryPayload
): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.webhooks);

  return retryWithBackoff(async () => {
    try {
      await client.post('/webhooks/inventory/update', inventoryData);
    } catch (error) {
      handleApiError(error, 'syncInventory');
    }
  });
}

/**
 * Update inventory (replaces appUpdateInventoryDataToSupabase)
 */
export async function updateInventory(
  inventoryData: SyncInventoryPayload
): Promise<void> {
  return syncInventory(inventoryData); // Same endpoint
}

/**
 * Delete inventory item
 */
export async function deleteInventory(inventoryId: string): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.inventory);

  return retryWithBackoff(async () => {
    try {
      await client.delete(`/inventory/${inventoryId}`);
    } catch (error) {
      handleApiError(error, 'deleteInventory');
    }
  });
}

/**
 * Get inventory for a store
 */
export async function getInventory(
  storeUrl: string,
  limit = 50
): Promise<Inventory[]> {
  const client = createApiClient(LAMBDA_URLS.inventory);

  try {
    const response = await client.get<ApiResponse<Inventory[]>>('/inventory', {
      params: { store_url: storeUrl, limit },
    });

    return response.data.data || [];
  } catch (error) {
    console.error('Error getting inventory:', error);
    return [];
  }
}

/**
 * Get low stock items
 */
export async function getLowStockItems(
  storeUrl: string,
  threshold = 10
): Promise<Inventory[]> {
  const client = createApiClient(LAMBDA_URLS.inventory);

  try {
    const response = await client.get<ApiResponse<Inventory[]>>(
      '/inventory/restock-analysis',
      {
        params: { store_url: storeUrl, threshold },
      }
    );

    return response.data.data || [];
  } catch (error) {
    console.error('Error getting low stock items:', error);
    return [];
  }
}

// ============================================================================
// WEBHOOK LOGGING
// ============================================================================

/**
 * Log webhook reception
 */
export async function logWebhook(
  topic: string,
  shop: string,
  payload: any
): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.webhooks);

  try {
    await client.post<WebhookLogResponse>('/webhooks/log', {
      topic,
      shop,
      payload: JSON.stringify(payload),
      received_at: new Date().toISOString(),
    });
  } catch (error) {
    // Don't fail webhook processing if logging fails
    console.error('Error logging webhook:', error);
  }
}

// ============================================================================
// BACKORDER OPERATIONS (DynamoDB-based locking)
// ============================================================================

/**
 * Acquire backorder lock (prevents race conditions)
 * Uses DynamoDB conditional writes instead of Supabase RLS
 */
export async function acquireBackorderLock(
  itemId: string,
  lockId: string
): Promise<boolean> {
  const client = createApiClient(LAMBDA_URLS.inventory);

  try {
    const response = await client.post<ApiResponse<{ acquired: boolean }>>(
      '/inventory/acquire-lock',
      {
        item_id: itemId,
        lock_id: lockId,
        ttl: 300, // 5 minutes
      }
    );

    return response.data.data?.acquired || false;
  } catch (error) {
    console.error('Error acquiring backorder lock:', error);
    return false;
  }
}

/**
 * Release backorder lock
 */
export async function releaseBackorderLock(
  itemId: string,
  lockId: string
): Promise<void> {
  const client = createApiClient(LAMBDA_URLS.inventory);

  try {
    await client.post('/inventory/release-lock', {
      item_id: itemId,
      lock_id: lockId,
    });
  } catch (error) {
    console.error('Error releasing backorder lock:', error);
  }
}

/**
 * Process backorder (replaces saveBackorderDataToSupabase)
 */
export async function processBackorder(
  storeUrl: string,
  inventoryItemId: string,
  quantity: number
): Promise<void> {
  const lockId = `backorder-${inventoryItemId}-${Date.now()}`;

  // Try to acquire lock
  const acquired = await acquireBackorderLock(inventoryItemId, lockId);

  if (!acquired) {
    console.log('Could not acquire lock for backorder processing');
    return;
  }

  try {
    const client = createApiClient(LAMBDA_URLS.inventory);

    await retryWithBackoff(async () => {
      await client.post('/inventory/reorder', {
        store_url: storeUrl,
        shopify_inventory_item_id: inventoryItemId,
        quantity,
        status: 'pending',
      });
    });
  } finally {
    // Always release lock
    await releaseBackorderLock(inventoryItemId, lockId);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Health check for Lambda endpoints
 */
export async function checkLambdaHealth(): Promise<{
  [key: string]: boolean;
}> {
  const results: { [key: string]: boolean } = {};

  for (const [name, url] of Object.entries(LAMBDA_URLS)) {
    if (!url) {
      results[name] = false;
      continue;
    }

    try {
      const response = await axios.get(`${url}/health`, { timeout: 5000 });
      results[name] = response.status === 200;
    } catch {
      results[name] = false;
    }
  }

  return results;
}
