/**
 * Background Sync Route
 *
 * This route handles initial inventory and orders sync in the background.
 * Called via fetch from the app._index page to avoid blocking the UI.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getInventory } from "~/utils/lambdaClient";
import { syncInitialInventory } from "~/utils/syncInitialInventory";
import { syncInitialOrders } from "~/utils/syncInitialOrders";
import { syncInitialFulfillments } from "~/utils/syncInitialFulfillments";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  console.log(`[app.sync] Starting background sync for: ${session.shop}`);

  let syncResult = {
    inventory: 0,
    orders: 0,
    fulfillments: 0,
    error: null as string | null,
    alreadySynced: false,
    fulfillmentsSyncNeeded: false,
  };

  try {
    // Check if inventory already exists
    const existingInventory = await getInventory(session.shop, 1);
    const inventoryAlreadySynced = existingInventory && existingInventory.length > 0;

    // Check if fulfillments need syncing (separate from inventory check)
    // This ensures existing stores can backfill fulfillments without re-syncing everything
    let fulfillmentsSyncNeeded = true;

    try {
      // Check if store has fulfillments_synced flag
      const { getStore } = await import('~/utils/lambdaClient');
      const store = await getStore(session.shop);

      if (store && store.fulfillments_synced === true) {
        console.log(`[app.sync] Fulfillments already synced for ${session.shop}`);
        fulfillmentsSyncNeeded = false;
      } else {
        console.log(`[app.sync] Fulfillments need syncing for ${session.shop}`);
        fulfillmentsSyncNeeded = true;
      }
    } catch (err) {
      console.log(`[app.sync] Could not check fulfillment sync status, will sync: ${err}`);
      fulfillmentsSyncNeeded = true;
    }

    syncResult.fulfillmentsSyncNeeded = fulfillmentsSyncNeeded;

    // If inventory is synced and fulfillments are synced, skip
    if (inventoryAlreadySynced && !fulfillmentsSyncNeeded) {
      console.log(`[app.sync] All data already synced for ${session.shop}`);
      syncResult.alreadySynced = true;
      return json(syncResult);
    }

    console.log(`[app.sync] Starting sync for ${session.shop} (inventory: ${!inventoryAlreadySynced}, fulfillments: ${fulfillmentsSyncNeeded})`);

    // Sync inventory (only if not already synced)
    if (!inventoryAlreadySynced) {
      try {
        const inventoryCount = await syncInitialInventory(session as any, admin);
        syncResult.inventory = inventoryCount;
        console.log(`[app.sync] ✓ Inventory sync complete: ${inventoryCount} items`);
      } catch (invError) {
        console.error(`[app.sync] Inventory sync failed:`, invError);
        syncResult.error = invError instanceof Error ? invError.message : 'Inventory sync failed';
      }

      // Sync orders (only if inventory wasn't synced - means it's a new store)
      try {
        const ordersCount = await syncInitialOrders(session as any, admin);
        syncResult.orders = ordersCount;
        console.log(`[app.sync] ✓ Orders sync complete: ${ordersCount} orders`);
      } catch (ordError) {
        console.error(`[app.sync] Orders sync failed:`, ordError);
        if (!syncResult.error) {
          syncResult.error = ordError instanceof Error ? ordError.message : 'Orders sync failed';
        }
      }
    } else {
      console.log(`[app.sync] Skipping inventory/orders sync (already synced)`);
    }

    // Sync fulfillments (historical tracking data) - run if needed
    if (fulfillmentsSyncNeeded) {
      try {
        const fulfillmentsCount = await syncInitialFulfillments(session as any, admin);
        syncResult.fulfillments = fulfillmentsCount;
        console.log(`[app.sync] ✓ Fulfillments sync complete: ${fulfillmentsCount} tracking records created`);

        // Mark fulfillments as synced in store record
        try {
          const { upsertStore } = await import('~/utils/lambdaClient');
          await upsertStore({
            store_url: session.shop,
            fulfillments_synced: true,
          });
          console.log(`[app.sync] ✓ Marked fulfillments as synced for ${session.shop}`);
        } catch (updateError) {
          console.error(`[app.sync] Could not update fulfillments_synced flag:`, updateError);
          // Non-critical error, continue
        }
      } catch (fulfError) {
        console.error(`[app.sync] Fulfillments sync failed:`, fulfError);
        if (!syncResult.error) {
          syncResult.error = fulfError instanceof Error ? fulfError.message : 'Fulfillments sync failed';
        }
      }
    } else {
      console.log(`[app.sync] Skipping fulfillments sync (already synced)`);
    }

  } catch (error) {
    console.error(`[app.sync] Sync error:`, error);
    syncResult.error = error instanceof Error ? error.message : 'Sync failed';
  }

  console.log(`[app.sync] Sync complete:`, syncResult);
  return json(syncResult);
};
