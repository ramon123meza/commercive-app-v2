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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  console.log(`[app.sync] Starting background sync for: ${session.shop}`);

  let syncResult = {
    inventory: 0,
    orders: 0,
    error: null as string | null,
    alreadySynced: false,
  };

  try {
    // Check if inventory already exists
    const existingInventory = await getInventory(session.shop, 1);
    const alreadySynced = existingInventory && existingInventory.length > 0;

    if (alreadySynced) {
      console.log(`[app.sync] Inventory already synced for ${session.shop}`);
      syncResult.alreadySynced = true;
      return json(syncResult);
    }

    console.log(`[app.sync] Starting initial sync for ${session.shop}`);

    // Sync inventory
    try {
      const inventoryCount = await syncInitialInventory(session, admin);
      syncResult.inventory = inventoryCount;
      console.log(`[app.sync] ✓ Inventory sync complete: ${inventoryCount} items`);
    } catch (invError) {
      console.error(`[app.sync] Inventory sync failed:`, invError);
      syncResult.error = invError instanceof Error ? invError.message : 'Inventory sync failed';
    }

    // Sync orders
    try {
      const ordersCount = await syncInitialOrders(session, admin);
      syncResult.orders = ordersCount;
      console.log(`[app.sync] ✓ Orders sync complete: ${ordersCount} orders`);
    } catch (ordError) {
      console.error(`[app.sync] Orders sync failed:`, ordError);
      if (!syncResult.error) {
        syncResult.error = ordError instanceof Error ? ordError.message : 'Orders sync failed';
      }
    }

  } catch (error) {
    console.error(`[app.sync] Sync error:`, error);
    syncResult.error = error instanceof Error ? error.message : 'Sync failed';
  }

  console.log(`[app.sync] Sync complete:`, syncResult);
  return json(syncResult);
};
