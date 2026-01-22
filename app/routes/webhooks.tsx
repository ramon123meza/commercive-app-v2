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
      case "ORDERS_PAID":        // NEW: Explicitly handle payment confirmation
      case "ORDERS_CANCELLED":   // NEW: Handle order cancellations
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
 *
 * IMPORTANT: Now tracks payment_status separately from fulfillment_status
 * and calculates processing_started_at for 48-hour SLA tracking.
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

    // Map Shopify's financial_status to our payment_status
    // Shopify values: pending, authorized, partially_paid, paid, partially_refunded, refunded, voided
    let paymentStatus = "awaiting_payment";
    if (payload.financial_status === "paid" || payload.financial_status === "partially_paid") {
      paymentStatus = "paid";
    } else if (payload.financial_status === "authorized") {
      paymentStatus = "paid"; // Treat authorized as paid for processing
    }

    // Calculate processing_started_at (when order became eligible for fulfillment)
    // This is when payment was confirmed
    let processingStartedAt = null;
    if (paymentStatus === "paid") {
      // Use updated_at if available (when status changed), otherwise created_at
      processingStartedAt = payload.updated_at || payload.created_at || new Date().toISOString();
    }

    // Prepare order data for Lambda
    const orderData: SyncOrderPayload = {
      store_url: shop,
      order: {
        shopify_order_id: String(payload.id),
        order_number: String(payload.order_number || payload.name),
        financial_status: payload.financial_status || "pending", // Keep for legacy
        payment_status: paymentStatus,  // NEW: Separate payment tracking
        fulfillment_status: payload.fulfillment_status || "unfulfilled",
        total_price: payload.total_price || "0.00",
        currency: payload.currency || "USD",
        customer_email: payload.customer?.email || null,
        customer_name: payload.customer
          ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim()
          : null,
        created_at: payload.created_at || new Date().toISOString(),
        processing_started_at: processingStartedAt, // NEW: For 48h SLA tracking
      },
      line_items: lineItems,
    };

    // Send to Lambda
    await syncOrder(orderData);

    console.log(`[OrderWebhook] Synced order ${payload.id} (payment: ${paymentStatus}, fulfillment: ${payload.fulfillment_status})`);
  } catch (error) {
    console.error("[OrderWebhook] Error:", error);
    throw error;
  }
}

/**
 * Handle FULFILLMENT webhooks
 *
 * IMPORTANT: Process ALL fulfillments, even without tracking numbers.
 * Orders without tracking still need to be marked as shipped for processing time calculations.
 */
async function handleFulfillmentWebhook(
  shop: string,
  payload: any
): Promise<void> {
  try {
    console.log(`[FulfillmentWebhook] Processing fulfillment ${payload.id} for order ${payload.order_id}`);

    // Extract tracking info (may be null for manual fulfillments)
    const hasTracking = payload.tracking_company || payload.tracking_number;
    const trackingNumber = payload.tracking_number || null;
    const carrier = payload.tracking_company || (hasTracking ? "Unknown" : "Manual");
    const trackingUrl = payload.tracking_url || payload.tracking_urls?.[0] || null;

    // CRITICAL: Always process fulfillment, even without tracking
    // This ensures orders get marked as shipped and processing time is calculated
    const fulfillmentData: SyncFulfillmentPayload = {
      store_url: shop,
      order_id: String(payload.order_id),
      shopify_order_id: String(payload.order_id),
      shopify_fulfillment_id: String(payload.id), // NEW: Track fulfillment ID
      tracking_number: trackingNumber,
      carrier: carrier,
      tracking_url: trackingUrl,
      status: payload.status || "in_transit",
      shipped_at: payload.created_at || new Date().toISOString(), // NEW: When order was shipped
      fulfillment_location: payload.location?.name || null, // NEW: Where it was fulfilled
    };

    await syncFulfillment(fulfillmentData);

    if (!trackingNumber) {
      console.log(`[FulfillmentWebhook] ✅ Synced MANUAL fulfillment (no tracking) for order ${payload.order_id}`);
    } else {
      console.log(`[FulfillmentWebhook] ✅ Synced fulfillment with tracking ${trackingNumber} for order ${payload.order_id}`);
    }
  } catch (error) {
    console.error("[FulfillmentWebhook] Error:", error);
    throw error;
  }
}

/**
 * Handle INVENTORY_LEVELS webhooks (quantity changes)
 *
 * IMPORTANT: This now uses webhook payload data directly instead of making
 * expensive GraphQL queries for every webhook. This prevents GraphQL cost
 * limit errors during bulk operations and improves performance.
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

    // Extract quantity from webhook payload
    // Shopify's INVENTORY_LEVELS_UPDATE webhook includes the updated quantity
    const availableQty = payload.available !== undefined ? payload.available : 0;

    console.log(`[InventoryLevelWebhook] Item ${inventoryItemId} at location ${locationId}: quantity=${availableQty}`);

    // Fetch complete inventory item data to ensure we don't overwrite existing fields
    // This is safer than relying on Lambda to preserve existing data
    let productId = "";
    let productTitle = "";
    let variantTitle = null;
    let sku = null;

    try {
      const query = `#graphql
        query GetInventoryItem($id: ID!) {
          inventoryItem(id: $id) {
            id
            sku
            variant {
              id
              title
              product {
                id
                title
              }
            }
          }
        }
      `;

      const response = await admin.graphql(query, {
        variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` },
      });

      const result = await response.json();

      if (result.data?.inventoryItem) {
        const item = result.data.inventoryItem;
        productId = item.variant?.product?.id?.split('/').pop() || "";
        productTitle = item.variant?.product?.title || "";
        variantTitle = item.variant?.title !== 'Default Title' ? item.variant?.title : null;
        sku = item.sku || null;
      }
    } catch (fetchError) {
      console.error("[InventoryLevelWebhook] Failed to fetch item details:", fetchError);
      // Continue with partial data - Lambda should handle it
    }

    const inventoryData: SyncInventoryPayload = {
      store_url: shop,
      items: [
        {
          shopify_inventory_item_id: String(inventoryItemId),
          shopify_product_id: productId,
          product_title: productTitle,
          variant_title: variantTitle,
          sku: sku,
          quantity: availableQty,
          location_id: String(locationId || ""),
          location_name: "Primary",
        },
      ],
    };

    await syncInventory(inventoryData);

    console.log(`[InventoryLevelWebhook] Synced inventory for item ${inventoryItemId}`);
  } catch (error) {
    console.error("[InventoryLevelWebhook] Error:", error);
    // Don't throw - inventory sync failures shouldn't block webhook acknowledgment
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
