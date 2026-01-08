/**
 * Unified Webhook Handler
 *
 * Processes all Shopify webhooks and sends data to Lambda functions.
 * Replaces old Supabase operations with Lambda API calls.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  syncOrder,
  syncInventory,
  syncFulfillment,
  logWebhook,
} from "~/utils/lambdaClient";
import type {
  SyncOrderPayload,
  SyncInventoryPayload,
  SyncFulfillmentPayload,
} from "~/types/api.types";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(
      request
    );

    console.log(`[Webhook] Received: ${topic} from ${shop}`);

    // Log webhook reception (non-blocking)
    logWebhook(topic, shop, payload).catch((err) => {
      console.error("[Webhook] Failed to log:", err);
    });

    // Process webhook based on topic
    switch (topic) {
      // =====================================================================
      // ORDER WEBHOOKS
      // =====================================================================
      case "ORDERS_CREATE":
      case "ORDERS_UPDATED":
        await handleOrderWebhook(shop, payload);
        break;

      // =====================================================================
      // FULFILLMENT WEBHOOKS
      // =====================================================================
      case "FULFILLMENTS_CREATE":
      case "FULFILLMENTS_UPDATE":
        await handleFulfillmentWebhook(shop, payload);
        break;

      // =====================================================================
      // INVENTORY LEVEL WEBHOOKS (quantity changes)
      // =====================================================================
      case "INVENTORY_LEVELS_UPDATE":
      case "INVENTORY_LEVELS_CONNECT":
      case "INVENTORY_LEVELS_DISCONNECT":
        await handleInventoryLevelWebhook(shop, payload, admin, session);
        break;

      // =====================================================================
      // INVENTORY ITEM WEBHOOKS (metadata changes)
      // =====================================================================
      case "INVENTORY_ITEMS_CREATE":
      case "INVENTORY_ITEMS_UPDATE":
      case "INVENTORY_ITEMS_DELETE":
        await handleInventoryItemWebhook(shop, payload, topic);
        break;

      // =====================================================================
      // PRODUCT WEBHOOKS
      // =====================================================================
      case "PRODUCTS_CREATE":
      case "PRODUCTS_UPDATE":
      case "PRODUCTS_DELETE":
        console.log(`[Webhook] ${topic} - Catalog update (no action needed)`);
        // Products are synced via inventory, no separate action needed
        break;

      // =====================================================================
      // APP LIFECYCLE
      // =====================================================================
      case "APP_UNINSTALLED":
        console.log(`[Webhook] App uninstalled for ${shop}`);
        // Cleanup handled separately in app.uninstalled route
        break;

      default:
        console.log(`[Webhook] Unhandled topic: ${topic}`);
    }

    return new Response("Webhook processed", { status: 200 });
  } catch (error: any) {
    console.error("[Webhook] Error:", error);
    // Return 200 to prevent Shopify retries for non-critical errors
    return new Response(error.message || "Error processing webhook", {
      status: 200,
    });
  }
};

/**
 * Handle ORDER_CREATE and ORDER_UPDATED webhooks
 */
async function handleOrderWebhook(shop: string, payload: any): Promise<void> {
  try {
    console.log(`[OrderWebhook] Processing order ${payload.id} for ${shop}`);

    // Extract line items
    const lineItems = (payload.line_items || []).map((item: any) => ({
      shopify_line_item_id: String(item.id),
      product_title: item.title || "",
      variant_title: item.variant_title || null,
      sku: item.sku || null,
      quantity: item.quantity || 0,
      price: item.price || "0.00",
    }));

    // Prepare order data for Lambda
    const orderData: SyncOrderPayload = {
      store_url: shop,
      order: {
        shopify_order_id: String(payload.id),
        order_number: String(payload.order_number || payload.name),
        financial_status: payload.financial_status || "pending",
        fulfillment_status: payload.fulfillment_status || "unfulfilled",
        total_price: payload.total_price || "0.00",
        currency: payload.currency || "USD",
        customer_email: payload.customer?.email || null,
        customer_name: payload.customer
          ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim()
          : null,
        created_at: payload.created_at || new Date().toISOString(),
      },
      line_items: lineItems,
    };

    // Send to Lambda
    await syncOrder(orderData);

    console.log(`[OrderWebhook] Synced order ${payload.id}`);
  } catch (error) {
    console.error("[OrderWebhook] Error:", error);
    throw error;
  }
}

/**
 * Handle FULFILLMENT webhooks
 */
async function handleFulfillmentWebhook(
  shop: string,
  payload: any
): Promise<void> {
  try {
    console.log(`[FulfillmentWebhook] Processing for ${shop}`);

    const trackingInfo = payload.tracking_company || payload.tracking_number
      ? {
          tracking_number: payload.tracking_number || "",
          carrier: payload.tracking_company || "Unknown",
          tracking_url: payload.tracking_url || payload.tracking_urls?.[0] || null,
        }
      : null;

    if (!trackingInfo?.tracking_number) {
      console.log("[FulfillmentWebhook] No tracking info, skipping");
      return;
    }

    const fulfillmentData: SyncFulfillmentPayload = {
      store_url: shop,
      order_id: String(payload.order_id),
      shopify_order_id: String(payload.order_id),
      tracking_number: trackingInfo.tracking_number,
      carrier: trackingInfo.carrier,
      tracking_url: trackingInfo.tracking_url,
      status: payload.status || "in_transit",
    };

    await syncFulfillment(fulfillmentData);

    console.log(`[FulfillmentWebhook] Synced fulfillment for order ${payload.order_id}`);
  } catch (error) {
    console.error("[FulfillmentWebhook] Error:", error);
    throw error;
  }
}

/**
 * Handle INVENTORY_LEVELS webhooks (quantity changes)
 */
async function handleInventoryLevelWebhook(
  shop: string,
  payload: any,
  admin: any,
  session: any
): Promise<void> {
  try {
    console.log(`[InventoryLevelWebhook] Processing for ${shop}`);

    const inventoryItemId = payload.inventory_item_id;
    const locationId = payload.location_id;

    if (!inventoryItemId) {
      console.log("[InventoryLevelWebhook] No inventory_item_id, skipping");
      return;
    }

    // Convert numeric IDs to Shopify GID format
    const inventoryItemGid = `gid://shopify/InventoryItem/${inventoryItemId}`;
    const locationGid = locationId ? `gid://shopify/Location/${locationId}` : null;

    console.log(`[InventoryLevelWebhook] Fetching item ${inventoryItemGid}, location ${locationGid}`);

    // Fetch full inventory item details from Shopify
    const response = await admin.graphql(
      `#graphql
        query GetInventoryItem($id: ID!, $locationId: ID) {
          inventoryItem(id: $id) {
            id
            sku
            tracked
            variant {
              id
              title
              displayName
              product {
                id
                title
              }
            }
            inventoryLevel(locationId: $locationId) {
              id
              available
              quantities(names: ["available", "on_hand", "committed"]) {
                name
                quantity
              }
            }
          }
        }
      `,
      {
        variables: {
          id: inventoryItemGid,
          locationId: locationGid,
        },
      }
    );

    const result = await response.json();
    const item = result.data?.inventoryItem;

    if (!item) {
      console.log("[InventoryLevelWebhook] Item not found in Shopify");
      return;
    }

    // Prepare inventory data
    const inventoryData: SyncInventoryPayload = {
      store_url: shop,
      items: [
        {
          shopify_inventory_item_id: String(inventoryItemId),
          shopify_product_id: item.variant?.product?.id?.split("/").pop() || "",
          product_title: item.variant?.product?.title || "Unknown Product",
          variant_title: item.variant?.title || null,
          sku: item.sku || null,
          quantity: payload.available || 0,
          location_id: String(payload.location_id),
          location_name: "Primary", // Could fetch location name if needed
        },
      ],
    };

    await syncInventory(inventoryData);

    console.log(`[InventoryLevelWebhook] Synced inventory for item ${inventoryItemId}`);
  } catch (error) {
    console.error("[InventoryLevelWebhook] Error:", error);
    // Don't throw - inventory sync failures shouldn't block webhooks
  }
}

/**
 * Handle INVENTORY_ITEMS webhooks (metadata changes)
 */
async function handleInventoryItemWebhook(
  shop: string,
  payload: any,
  topic: string
): Promise<void> {
  try {
    console.log(`[InventoryItemWebhook] ${topic} for ${shop}`);

    if (topic === "INVENTORY_ITEMS_DELETE") {
      // Handle deletion if needed
      console.log(`[InventoryItemWebhook] Item ${payload.id} deleted`);
      return;
    }

    // For CREATE/UPDATE, metadata changes are captured via inventory levels
    console.log(`[InventoryItemWebhook] Metadata updated for item ${payload.id}`);
  } catch (error) {
    console.error("[InventoryItemWebhook] Error:", error);
  }
}
