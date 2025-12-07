import { supabase } from "../supabase.server";
import type { Database } from "app/types/database.types";
import type { Payload } from "app/types/payload";

// SECURITY FIX: Removed hardcoded Redis credentials
// Redis configuration should use environment variables if needed in the future

export async function saveOrdersToSupabase(
  orderData: Database["public"]["Tables"]["order"]["Insert"][],
) {
  try {
    const { data, error } = await supabase
      .from("order")
      .upsert(orderData, { onConflict: "order_id" });

    if (error) {
      console.error("Error upserting order data:", error);
      throw new Error(`Failed to upsert orders: ${error.message}`);
    }

    console.log("Orders upserted successfully:", data);
    return data;
  } catch (err) {
    console.error("Unexpected error while saving orders:", err);
    throw new Error("Something went wrong while saving orders to Supabase.");
  }
}

export async function saveLineItemsToSupabase(
  lineItemData: Database["public"]["Tables"]["order_items"]["Insert"][],
) {
  try {
    const { data, error } = await supabase
      .from("order_items")
      .upsert(lineItemData, { onConflict: "order_id,product_id" });

    if (error) {
      console.error("Error upserting line items:", error);
      throw new Error(`Failed to upsert line items: ${error.message}`);
    }

    console.log("Line items upserted successfully:", data);
    return data;
  } catch (err) {
    console.error("Unexpected error while saving line items:", err);
    throw new Error(
      "Something went wrong while saving line items to Supabase.",
    );
  }
}

export async function saveTrackingData(
  trackingData: Database["public"]["Tables"]["trackings"]["Insert"],
) {
  try {
    const { data, error } = await supabase
      .from("trackings")
      .upsert(trackingData, { onConflict: "order_id" });

    if (error) {
      console.error("Error upserting tracking data:", error);
      throw new Error(`Failed to upsert tracking data: ${error.message}`);
    }

    console.log("Tracking data upserted successfully:", data);
    return data;
  } catch (err) {
    console.error("Unexpected error while saving tracking data:", err);
    throw new Error(
      "Something went wrong while saving tracking data to Supabase.",
    );
  }
}

export async function saveFulfillmentDataToSupabase(
  fulfillmentData: Database["public"]["Tables"]["trackings"]["Insert"][],
) {
  try {
    const { data, error } = await supabase
      .from("trackings")
      .upsert(fulfillmentData, { onConflict: "order_id" });

    if (error) {
      console.error("Error upserting fulfillment data:", error);
      throw new Error(`Failed to upsert fulfillment data: ${error.message}`);
    }

    return data;
  } catch (err) {
    console.error("Unexpected error while saving fulfillment data:", err);
    throw new Error(
      "Something went wrong while saving fulfillment data to Supabase.",
    );
  }
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
  try {
    // Ensure inventoryData is always an array
    const dataArray = Array.isArray(inventoryData) ? inventoryData : [inventoryData];

    // Filter out any null/undefined entries
    const validData = dataArray.filter(item => item && item.inventory_id);

    if (validData.length === 0) {
      console.log("No valid inventory data to save");
      return null;
    }

    const { data, error } = await supabase
      .from("inventory")
      .upsert(validData, {
        onConflict: "inventory_id",
        ignoreDuplicates: false
      });

    if (error) {
      console.error("Error saving inventory data:", error);
      throw new Error(`Failed to upsert inventory data: ${error.message}`);
    }

    console.log(`Successfully saved ${validData.length} inventory records`);
    return data;
  } catch (err) {
    console.error("Unexpected error while saving Inventory data:", err);
    throw new Error(
      "Something went wrong while saving Inventory data to Supabase.",
    );
  }
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
  try {
    const redisKey = `backorder_lock:${order_id}`;

    const isSet = true; //await redis.set(redisKey, "locked", "EX", 60, "NX");
    if (!isSet) {
      return;
    }

    for (const item of lineItems) {
      const variant_id = item.variant_id;

      const { data: inventoryData, error } = await supabase
        .from("inventory")
        .select("back_orders, product_id, inventory_level")
        .eq("variant_id", variant_id)
        .single();

      if (error)
        throw new Error(`Error fetching inventory data: ${error.message}`);
      if (!inventoryData) {
        return new Error(`No inventory record found for product ${variant_id}`);
      }

      const inventoryLevels = inventoryData.inventory_level as any;
      if (
        !inventoryLevels ||
        !Array.isArray(inventoryLevels) ||
        inventoryLevels.length === 0
      ) {
        throw new Error(
          `No inventory level data found for product ${variant_id}`,
        );
      }

      const inventoryNode = inventoryLevels[0].node;
      if (!inventoryNode)
        throw new Error(
          `No matching inventory node found for product ${variant_id}`,
        );

      const quantities = inventoryNode.quantities;
      const availableQuantity = quantities.find(
        (q: { name: string }) => q.name === "available",
      )?.quantity;

      if (availableQuantity === undefined)
        throw new Error(
          `No 'available' quantity found for product ${variant_id}`,
        );

      if (availableQuantity < 1) {
        // BUG FIX: Added parentheses for correct operator precedence
        const updatedBackOrders = (inventoryData.back_orders || 0) + 1;

        const { error: updateError } = await supabase
          .from("inventory")
          .update({ back_orders: updatedBackOrders })
          .eq("variant_id", variant_id);

        if (updateError) {
          console.error(
            `Error updating back_orders for product ${variant_id}:`,
            updateError,
          );
        } else {
          console.log(
            `Back order updated for product ${variant_id} in order ${order_id}`,
          );
        }
      }
    }
  } catch (err) {
    console.error(
      `Unexpected error while adding backorder data for order ${order_id}:`,
      err,
    );
    throw new Error(
      "Something went wrong while adding backorder data to Supabase.",
    );
  }
}
