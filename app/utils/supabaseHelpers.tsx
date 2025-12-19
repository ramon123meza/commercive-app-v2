import { supabase } from "../supabase.server";
import type { Database } from "app/types/database.types";
import type { Payload } from "app/types/payload";

// SECURITY FIX: Removed hardcoded Redis credentials
// Redis configuration should use environment variables if needed in the future

/**
 * Retry helper for Supabase operations with exponential backoff
 * @param operation Function that performs the Supabase operation
 * @param operationName Name of the operation for logging
 * @param maxRetries Maximum number of retry attempts
 * @returns Result of the operation
 */
async function retrySupabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        console.log(`[${operationName}] Succeeded on attempt ${attempt}/${maxRetries}`);
      }
      return result;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.error(
        `[${operationName}] Attempt ${attempt}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error
      );

      if (isLastAttempt) {
        console.error(`[${operationName}] All retry attempts exhausted. Operation failed.`);
        throw error;
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      const backoffMs = 100 * Math.pow(2, attempt - 1);
      console.log(`[${operationName}] Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error(`[${operationName}] Unexpected exit from retry loop`);
}

export async function saveOrdersToSupabase(
  orderData: Database["public"]["Tables"]["order"]["Insert"][],
) {
  return retrySupabaseOperation(async () => {
    const { data, error } = await supabase
      .from("order")
      .upsert(orderData, { onConflict: "order_id" });

    if (error) {
      console.error("[saveOrdersToSupabase] Error upserting order data:", error);
      throw new Error(`Failed to upsert orders: ${error.message}`);
    }

    console.log(`[saveOrdersToSupabase] Successfully upserted ${orderData.length} orders`);
    return data;
  }, "saveOrdersToSupabase");
}

export async function saveLineItemsToSupabase(
  lineItemData: Database["public"]["Tables"]["order_items"]["Insert"][],
) {
  return retrySupabaseOperation(async () => {
    const { data, error } = await supabase
      .from("order_items")
      .upsert(lineItemData, { onConflict: "order_id,product_id" });

    if (error) {
      console.error("[saveLineItemsToSupabase] Error upserting line items:", error);
      throw new Error(`Failed to upsert line items: ${error.message}`);
    }

    console.log(`[saveLineItemsToSupabase] Successfully upserted ${lineItemData.length} line items`);
    return data;
  }, "saveLineItemsToSupabase");
}

export async function saveTrackingData(
  trackingData: Database["public"]["Tables"]["trackings"]["Insert"],
) {
  return retrySupabaseOperation(async () => {
    const { data, error } = await supabase
      .from("trackings")
      .upsert(trackingData, { onConflict: "order_id" });

    if (error) {
      console.error("[saveTrackingData] Error upserting tracking data:", error);
      throw new Error(`Failed to upsert tracking data: ${error.message}`);
    }

    console.log("[saveTrackingData] Tracking data upserted successfully");
    return data;
  }, "saveTrackingData");
}

export async function saveFulfillmentDataToSupabase(
  fulfillmentData: Database["public"]["Tables"]["trackings"]["Insert"][],
) {
  return retrySupabaseOperation(async () => {
    const { data, error } = await supabase
      .from("trackings")
      .upsert(fulfillmentData, { onConflict: "order_id" });

    if (error) {
      console.error("[saveFulfillmentDataToSupabase] Error upserting fulfillment data:", error);
      throw new Error(`Failed to upsert fulfillment data: ${error.message}`);
    }

    console.log(`[saveFulfillmentDataToSupabase] Successfully upserted ${fulfillmentData.length} fulfillments`);
    return data;
  }, "saveFulfillmentDataToSupabase");
}

export const isInventoryFetched = async (
  storeUrl: string,
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("stores")
    .select("is_inventory_fetched")
    .eq("store_url", storeUrl)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Error fetching inventory flag: ${error.message}`);
  }

  return data?.is_inventory_fetched || false;
};

export const setInventoryFetched = async ({
  storeName,
  storeUrl,
}: {
  storeName: string;
  storeUrl: string;
}): Promise<void> => {
  const { error } = await supabase.from("stores").upsert(
    {
      store_name: storeName,
      store_url: storeUrl,
      is_inventory_fetched: true,
    },
    { onConflict: "store_url" },
  );

  if (error) {
    throw new Error(`Error setting inventory flag: ${error.message}`);
  }
};

export async function saveInventoryDataToSupabase(inventoryData: any | any[]) {
  return retrySupabaseOperation(async () => {
    // Ensure inventoryData is always an array
    const dataArray = Array.isArray(inventoryData) ? inventoryData : [inventoryData];

    // Filter out any null/undefined entries
    const validData = dataArray.filter(item => item && item.inventory_id);

    if (validData.length === 0) {
      console.log("[saveInventoryDataToSupabase] No valid inventory data to save");
      return null;
    }

    const { data, error } = await supabase
      .from("inventory")
      .upsert(validData, {
        onConflict: "inventory_id",
        ignoreDuplicates: false
      });

    if (error) {
      console.error("[saveInventoryDataToSupabase] Error saving inventory data:", error);
      throw new Error(`Failed to upsert inventory data: ${error.message}`);
    }

    console.log(`[saveInventoryDataToSupabase] Successfully saved ${validData.length} inventory records`);
    return data;
  }, "saveInventoryDataToSupabase");
}

export async function appUpdateInventoryDataToSupabase(
  inventoryData: any,
  storeUrl: string,
) {
  try {
    const { data, error } = await supabase.from("inventory").upsert({
      inventory_id: inventoryData.admin_graphql_api_id,
      sku: inventoryData.sku,
      store_url: storeUrl,
    });

    if (error) {
      console.error("Error update inventory data:", error);
      throw new Error(`Failed to upsert tracking data: ${error.message}`);
    }
    return data;
  } catch (err) {
    console.error("Unexpected error while update Inventory data:", err);
    throw new Error(
      "Something went wrong while update Inventory data to Supabase.",
    );
  }
}

// Delete inventory record from Supabase (used when inventory items are deleted)
export async function deleteInventoryFromSupabase(
  inventoryId: string,
  storeUrl: string,
) {
  try {
    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("inventory_id", inventoryId)
      .eq("store_url", storeUrl);

    if (error) {
      console.error("Error deleting inventory data:", error);
      throw new Error(`Failed to delete inventory data: ${error.message}`);
    }
    console.log(`Inventory ${inventoryId} deleted successfully`);
  } catch (err) {
    console.error("Unexpected error while deleting Inventory data:", err);
    throw new Error(
      "Something went wrong while deleting Inventory data from Supabase.",
    );
  }
}

export async function saveBackorderDataToSupabase(
  lineItems: Payload["line_items"],
  order_id: number,
) {
  const maxRetries = 3;
  const lockKey = `backorder_lock_${order_id}`;

  try {
    // Attempt to acquire a database-level advisory lock to prevent race conditions
    // Using order_id as a unique identifier for the lock
    const lockAcquired = await acquireBackorderLock(order_id);

    if (!lockAcquired) {
      console.log(`[saveBackorderDataToSupabase] Order ${order_id} is already being processed by another request. Skipping...`);
      return;
    }

    try {
      for (const item of lineItems) {
        const variant_id = item.variant_id;

        // Retry logic for fetching inventory data
        let inventoryData = null;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const { data, error } = await supabase
            .from("inventory")
            .select("back_orders, product_id, inventory_level")
            .eq("variant_id", variant_id)
            .single();

          if (!error) {
            inventoryData = data;
            break;
          }

          lastError = error;
          console.warn(`[saveBackorderDataToSupabase] Attempt ${attempt}/${maxRetries} failed for variant ${variant_id}:`, error.message);

          if (attempt < maxRetries) {
            // Exponential backoff: wait 100ms, 200ms, 400ms
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
          }
        }

        if (!inventoryData) {
          console.error(`[saveBackorderDataToSupabase] Failed to fetch inventory data after ${maxRetries} attempts for variant ${variant_id}:`, lastError?.message);
          continue; // Skip this item but continue processing others
        }

        const inventoryLevels = inventoryData.inventory_level as any;
        if (
          !inventoryLevels ||
          !Array.isArray(inventoryLevels) ||
          inventoryLevels.length === 0
        ) {
          console.warn(`[saveBackorderDataToSupabase] No inventory level data found for variant ${variant_id}`);
          continue;
        }

        const inventoryNode = inventoryLevels[0].node;
        if (!inventoryNode) {
          console.warn(`[saveBackorderDataToSupabase] No matching inventory node found for variant ${variant_id}`);
          continue;
        }

        const quantities = inventoryNode.quantities;
        const availableQuantity = quantities.find(
          (q: { name: string }) => q.name === "available",
        )?.quantity;

        if (availableQuantity === undefined) {
          console.warn(`[saveBackorderDataToSupabase] No 'available' quantity found for variant ${variant_id}`);
          continue;
        }

        if (availableQuantity < 1) {
          // Update back orders with retry logic
          const updatedBackOrders = (inventoryData.back_orders || 0) + 1;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const { error: updateError } = await supabase
              .from("inventory")
              .update({ back_orders: updatedBackOrders })
              .eq("variant_id", variant_id);

            if (!updateError) {
              console.log(`[saveBackorderDataToSupabase] Back order updated for variant ${variant_id} in order ${order_id}. New count: ${updatedBackOrders}`);
              break;
            }

            console.warn(`[saveBackorderDataToSupabase] Update attempt ${attempt}/${maxRetries} failed for variant ${variant_id}:`, updateError.message);

            if (attempt === maxRetries) {
              console.error(`[saveBackorderDataToSupabase] Failed to update back_orders after ${maxRetries} attempts for variant ${variant_id}:`, updateError);
            } else {
              await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
            }
          }
        }
      }
    } finally {
      // Always release the lock, even if an error occurred
      await releaseBackorderLock(order_id);
    }
  } catch (err) {
    console.error(
      `[saveBackorderDataToSupabase] Unexpected error while processing backorder data for order ${order_id}:`,
      err,
    );
    // Don't throw - we don't want to block order processing if backorder tracking fails
    // Just log the error for monitoring
  }
}

/**
 * Acquire a database-level lock for backorder processing
 * Uses a separate locking table to prevent race conditions
 */
async function acquireBackorderLock(orderId: number): Promise<boolean> {
  try {
    const lockExpiry = new Date(Date.now() + 60000); // Lock expires in 60 seconds

    // Try to insert a lock record
    const { error } = await supabase
      .from("backorder_locks")
      .insert({
        order_id: orderId,
        locked_at: new Date().toISOString(),
        expires_at: lockExpiry.toISOString(),
      });

    if (error) {
      // If insert fails due to unique constraint, lock already exists
      if (error.code === '23505') { // PostgreSQL unique violation
        console.log(`[acquireBackorderLock] Lock already exists for order ${orderId}`);
        return false;
      }

      // For other errors, log and return false to be safe
      console.error(`[acquireBackorderLock] Error acquiring lock for order ${orderId}:`, error);
      return false;
    }

    console.log(`[acquireBackorderLock] Lock acquired for order ${orderId}`);
    return true;
  } catch (err) {
    console.error(`[acquireBackorderLock] Unexpected error:`, err);
    return false;
  }
}

/**
 * Release a database-level lock for backorder processing
 */
async function releaseBackorderLock(orderId: number): Promise<void> {
  try {
    const { error } = await supabase
      .from("backorder_locks")
      .delete()
      .eq("order_id", orderId);

    if (error) {
      console.error(`[releaseBackorderLock] Error releasing lock for order ${orderId}:`, error);
    } else {
      console.log(`[releaseBackorderLock] Lock released for order ${orderId}`);
    }
  } catch (err) {
    console.error(`[releaseBackorderLock] Unexpected error:`, err);
  }
}
