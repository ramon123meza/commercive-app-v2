/**
 * Sync Initial Fulfillments
 *
 * This utility syncs all historical fulfillments from Shopify to DynamoDB.
 * Called during initial app installation to backfill tracking data for
 * orders that were fulfilled before the app was installed.
 *
 * Why This Is Needed:
 * - Webhooks only capture fulfillments created AFTER app install
 * - Historical fulfillments (pre-installation) have no tracking records
 * - This causes orders to show as "fulfilled" but have 0 tracking data
 */

import type { Session } from "@shopify/shopify-api";
import { fetchAllFulfillments } from "./shopify";
import { LAMBDA_URLS } from "~/config/lambda.server";

interface TrackingInfo {
  number?: string;
  url?: string;
  company?: string;
}

interface Fulfillment {
  id: string;
  status: string;
  trackingInfo: TrackingInfo[];
  createdAt: string;
  updatedAt: string;
}

interface OrderWithFulfillments {
  id: string;  // Shopify order ID (gid://shopify/Order/123456)
  name: string;  // Order number (#1001)
  fulfillments: Fulfillment[];
}

export async function syncInitialFulfillments(
  session: Session,
  admin: any
): Promise<number> {
  console.log(`[syncInitialFulfillments] Starting fulfillment sync for ${session.shop}`);

  try {
    // Fetch all fulfilled orders from Shopify
    const fulfilledOrders = await fetchAllFulfillments(admin);
    console.log(`[syncInitialFulfillments] Fetched ${fulfilledOrders.length} fulfilled orders from Shopify`);

    if (!fulfilledOrders || fulfilledOrders.length === 0) {
      console.log(`[syncInitialFulfillments] No fulfilled orders found - skipping sync`);
      return 0;
    }

    let totalFulfillments = 0;
    let successCount = 0;
    let errorCount = 0;

    // Process each order and extract fulfillments
    for (const order of fulfilledOrders) {
      const typedOrder = order as OrderWithFulfillments;

      if (!typedOrder.fulfillments || typedOrder.fulfillments.length === 0) {
        continue;  // Skip orders with no fulfillments
      }

      // Extract Shopify order ID from GID (gid://shopify/Order/123456 → 123456)
      const shopifyOrderId = typedOrder.id.split('/').pop() || '';

      // Process each fulfillment for this order
      for (const fulfillment of typedOrder.fulfillments) {
        totalFulfillments++;

        // Extract tracking info (can be multiple tracking numbers per fulfillment)
        const trackingInfoArray = fulfillment.trackingInfo || [];

        if (trackingInfoArray.length === 0) {
          // Fulfillment exists but has no tracking info - still create a record
          console.log(`[syncInitialFulfillments] Order ${typedOrder.name}: Fulfillment without tracking info`);
        }

        // Create a tracking entry for each tracking number
        // (Some fulfillments have multiple packages with different tracking numbers)
        const trackingEntries = trackingInfoArray.length > 0
          ? trackingInfoArray
          : [{ number: undefined, url: undefined, company: undefined }];  // Create one entry even if no tracking

        for (const trackingInfo of trackingEntries) {
          try {
            // Build fulfillment payload matching Shopify webhook format
            const fulfillmentPayload = {
              id: fulfillment.id.split('/').pop(),  // Extract ID from GID
              order_id: shopifyOrderId,
              status: fulfillment.status,
              created_at: fulfillment.createdAt,
              updated_at: fulfillment.updatedAt,
              tracking_number: trackingInfo.number || null,
              tracking_url: trackingInfo.url || null,
              tracking_company: trackingInfo.company || null,
            };

            // Build webhook payload format
            const webhookPayload = {
              id: shopifyOrderId,
              name: typedOrder.name,
              fulfillments: [fulfillmentPayload],
            };

            // Send to Lambda webhooks endpoint (same as Shopify webhook)
            const response = await fetch(
              `${LAMBDA_URLS.webhooks}/webhooks/fulfillment/create`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Shop-Domain': session.shop,
                  'X-Shopify-Topic': 'fulfillments/create',
                },
                body: JSON.stringify(webhookPayload),
              }
            );

            if (!response.ok) {
              console.error(
                `[syncInitialFulfillments] Failed to sync fulfillment for order ${typedOrder.name}:`,
                response.statusText
              );
              errorCount++;
            } else {
              successCount++;
            }
          } catch (err) {
            console.error(
              `[syncInitialFulfillments] Error syncing fulfillment for order ${typedOrder.name}:`,
              err
            );
            errorCount++;
          }
        }
      }
    }

    console.log(`[syncInitialFulfillments] Sync complete:`);
    console.log(`  - Total fulfillments processed: ${totalFulfillments}`);
    console.log(`  - Successfully synced: ${successCount}`);
    console.log(`  - Errors: ${errorCount}`);

    return successCount;
  } catch (error) {
    console.error(`[syncInitialFulfillments] Fatal error during sync:`, error);
    throw error;
  }
}
