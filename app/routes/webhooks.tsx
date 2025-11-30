import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  saveOrdersToSupabase,
  saveLineItemsToSupabase,
  saveTrackingData,
  saveBackorderDataToSupabase,
  saveInventoryDataToSupabase,
  deleteInventoryFromSupabase,
} from "../utils/supabaseHelpers";
import {
  transformOrderData,
  transformLineItemsData,
  transformFulfillmentData,
  transformInventoryLevelWebhookData,
} from "../utils/transformDataHelpers";
import type { Payload, StoreInfo, TrackingData } from "../types/payload";
import { storeInfoQuery, inventoryItemByIdQuery } from "app/utils/queries";
import { supabase } from "app/supabase.server";

// Type for inventory_levels webhook payload
interface InventoryLevelPayload {
  inventory_item_id: number;
  location_id: number;
  available: number;
  updated_at: string;
  admin_graphql_api_id: string;
}

// Type for inventory_items webhook payload
interface InventoryItemPayload {
  id: number;
  sku: string | null;
  created_at: string;
  updated_at: string;
  requires_shipping: boolean;
  cost: string | null;
  country_code_of_origin: string | null;
  admin_graphql_api_id: string;
}

// Type for products webhook payload
interface ProductPayload {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  status: string;
  variants: Array<{
    id: number;
    product_id: number;
    title: string;
    sku: string | null;
    inventory_item_id: number;
    inventory_quantity: number;
  }>;
  admin_graphql_api_id: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get store information
  const response = await admin.graphql(storeInfoQuery);
  const storeData = (await response.json()).data as StoreInfo;
  const storeUrl = storeData.shop.myshopifyDomain;

  // Log webhook to database with await for proper error handling
  try {
    await supabase.from("webhooks").insert({
      store_url: storeUrl,
      topic: topic,
      payload: payload,
    });
  } catch (webhookLogError) {
    console.error("Failed to log webhook:", webhookLogError);
    // Continue processing even if logging fails
  }

  console.log(`📥 Webhook received: ${topic} for store ${storeUrl}`);

  try {
    switch (topic) {
      // ==================== FULFILLMENT WEBHOOKS ====================
      case "FULFILLMENTS_CREATE":
      case "FULFILLMENTS_UPDATE": {
        console.log(`✅ ${topic} - Processing fulfillment`);
        const trackingData = transformFulfillmentData(
          payload as TrackingData,
          storeUrl,
          storeData.shop.billingAddress,
        );
        await saveTrackingData(trackingData);
        break;
      }

      // ==================== ORDER WEBHOOKS ====================
      case "ORDERS_CREATE":
      case "ORDERS_UPDATED": {
        console.log(`✅ ${topic} - Processing order`);
        const _payload = payload as Payload;

        // Transform and save order data
        const orderData = await transformOrderData(_payload, storeUrl);
        await saveOrdersToSupabase([orderData]);

        // Transform and save line items
        const lineItemData = transformLineItemsData(_payload, storeUrl);
        await saveLineItemsToSupabase(lineItemData);

        // Process backorder data if there are line items
        const lineItems = _payload.line_items;
        const order_id = _payload.id;
        if (lineItems && lineItems.length > 0) {
          await saveBackorderDataToSupabase(lineItems, order_id);
        }
        break;
      }

      // ==================== INVENTORY LEVELS WEBHOOKS (QUANTITY CHANGES) ====================
      // These are the CRITICAL webhooks for real-time inventory quantity updates
      case "INVENTORY_LEVELS_UPDATE":
      case "INVENTORY_LEVELS_CONNECT": {
        console.log(`✅ ${topic} - Processing inventory LEVEL change (quantities)`);
        const levelPayload = payload as InventoryLevelPayload;

        // The inventory_levels webhook only contains:
        // - inventory_item_id, location_id, available, updated_at
        // We need to fetch the full inventory item details from Shopify
        const inventoryItemId = `gid://shopify/InventoryItem/${levelPayload.inventory_item_id}`;

        try {
          const inventoryResponse = await admin.graphql(inventoryItemByIdQuery, {
            variables: { id: inventoryItemId },
          });
          const inventoryData = await inventoryResponse.json();

          if (inventoryData?.data?.inventoryItem) {
            const item = inventoryData.data.inventoryItem;

            // Transform the inventory data to match our database schema
            const transformedData = transformInventoryLevelWebhookData(item, storeUrl);

            if (transformedData) {
              await saveInventoryDataToSupabase([transformedData]);
              console.log(`✅ Inventory updated for item ${levelPayload.inventory_item_id}`);
            }
          } else {
            console.error(`Failed to fetch inventory item details for ${inventoryItemId}`);
          }
        } catch (fetchError) {
          console.error(`Error fetching inventory item ${inventoryItemId}:`, fetchError);
        }
        break;
      }

      case "INVENTORY_LEVELS_DISCONNECT": {
        console.log(`✅ ${topic} - Inventory disconnected from location`);
        // When inventory is disconnected, we might want to update or remove the record
        const levelPayload = payload as InventoryLevelPayload;
        console.log(`Inventory item ${levelPayload.inventory_item_id} disconnected from location ${levelPayload.location_id}`);
        // For now, we'll just log this - the quantity will be updated when reconnected
        break;
      }

      // ==================== INVENTORY ITEMS WEBHOOKS (METADATA CHANGES) ====================
      // These fire when SKU, cost, or other metadata changes - NOT quantities
      case "INVENTORY_ITEMS_CREATE":
      case "INVENTORY_ITEMS_UPDATE": {
        console.log(`✅ ${topic} - Processing inventory ITEM metadata change`);
        const itemPayload = payload as InventoryItemPayload;

        // Fetch full inventory item details including quantities
        const inventoryItemId = itemPayload.admin_graphql_api_id;

        try {
          const inventoryResponse = await admin.graphql(inventoryItemByIdQuery, {
            variables: { id: inventoryItemId },
          });
          const inventoryData = await inventoryResponse.json();

          if (inventoryData?.data?.inventoryItem) {
            const item = inventoryData.data.inventoryItem;
            const transformedData = transformInventoryLevelWebhookData(item, storeUrl);

            if (transformedData) {
              await saveInventoryDataToSupabase([transformedData]);
              console.log(`✅ Inventory metadata updated for item ${itemPayload.id}`);
            }
          }
        } catch (fetchError) {
          console.error(`Error fetching inventory item ${inventoryItemId}:`, fetchError);
        }
        break;
      }

      case "INVENTORY_ITEMS_DELETE": {
        console.log(`✅ ${topic} - Inventory item deleted`);
        const itemPayload = payload as InventoryItemPayload;
        // Delete the inventory record from our database
        await deleteInventoryFromSupabase(itemPayload.admin_graphql_api_id, storeUrl);
        break;
      }

      // ==================== PRODUCT WEBHOOKS ====================
      case "PRODUCTS_CREATE":
      case "PRODUCTS_UPDATE": {
        console.log(`✅ ${topic} - Processing product change`);
        const productPayload = payload as ProductPayload;

        // When a product is created/updated, fetch and update inventory for all its variants
        if (productPayload.variants && productPayload.variants.length > 0) {
          for (const variant of productPayload.variants) {
            if (variant.inventory_item_id) {
              const inventoryItemId = `gid://shopify/InventoryItem/${variant.inventory_item_id}`;

              try {
                const inventoryResponse = await admin.graphql(inventoryItemByIdQuery, {
                  variables: { id: inventoryItemId },
                });
                const inventoryData = await inventoryResponse.json();

                if (inventoryData?.data?.inventoryItem) {
                  const item = inventoryData.data.inventoryItem;
                  const transformedData = transformInventoryLevelWebhookData(item, storeUrl);

                  if (transformedData) {
                    await saveInventoryDataToSupabase([transformedData]);
                  }
                }
              } catch (fetchError) {
                console.error(`Error fetching inventory for variant ${variant.id}:`, fetchError);
              }
            }
          }
        }
        break;
      }

      case "PRODUCTS_DELETE": {
        console.log(`✅ ${topic} - Product deleted`);
        const productPayload = payload as ProductPayload;
        // Delete inventory records for all variants of this product
        const productId = productPayload.id.toString();

        try {
          const { error } = await supabase
            .from("inventory")
            .delete()
            .eq("product_id", productId)
            .eq("store_url", storeUrl);

          if (error) {
            console.error(`Error deleting inventory for product ${productId}:`, error);
          } else {
            console.log(`✅ Deleted inventory records for product ${productId}`);
          }
        } catch (deleteError) {
          console.error(`Error deleting product inventory:`, deleteError);
        }
        break;
      }

      // ==================== APP LIFECYCLE WEBHOOKS ====================
      case "APP_UNINSTALLED": {
        console.log(`⚠️ App uninstalled for store ${storeUrl}`);
        // This is handled by webhooks.app.uninstalled.tsx
        break;
      }

      default:
        console.log(`⚠️ Unhandled webhook topic: ${topic}`);
        // Don't throw error for unhandled webhooks - just log and continue
        break;
    }
  } catch (processingError) {
    console.error(`❌ Error processing webhook ${topic}:`, processingError);
    // Log the error but still return 200 to prevent Shopify from retrying
    // Shopify will retry on non-200 responses, which could cause duplicates
  }

  return new Response("Webhook processed successfully", { status: 200 });
};
