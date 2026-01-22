/**
 * Admin Actions Route
 *
 * Handles two-way sync operations for admin dashboard.
 * Allows admins to update Shopify from the dashboard:
 * - Update inventory quantities
 * - Create fulfillments
 * - Cancel fulfillments
 *
 * These actions require admin authentication and update both Shopify and Lambda.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  updateInventoryQuantity,
  createFulfillment,
  cancelFulfillment,
  type UpdateInventoryParams,
  type CreateFulfillmentParams
} from "~/utils/shopifyMutations";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Authenticate the request
    const { admin, session } = await authenticate.admin(request);

    if (!admin || !session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse request body
    const body = await request.json();
    const { action: actionType, ...params } = body;

    console.log(`[Admin Action] ${actionType} for shop ${session.shop}`);
    console.log(`[Admin Action] Params:`, JSON.stringify(params, null, 2));

    let result;

    switch (actionType) {
      // =====================================================================
      // UPDATE INVENTORY QUANTITY
      // =====================================================================
      case "updateInventory":
        result = await handleUpdateInventory(admin, params);
        break;

      // =====================================================================
      // CREATE FULFILLMENT
      // =====================================================================
      case "createFulfillment":
        result = await handleCreateFulfillment(admin, params);
        break;

      // =====================================================================
      // CANCEL FULFILLMENT
      // =====================================================================
      case "cancelFulfillment":
        result = await handleCancelFulfillment(admin, params);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${actionType}` }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
    }

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[Admin Action] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

/**
 * Handle inventory update
 *
 * Request params:
 * {
 *   inventoryItemId: string,  // Shopify inventory item ID (numeric or GID)
 *   locationId: string,        // Shopify location ID (numeric or GID)
 *   quantity: number,          // New quantity
 *   reason?: string            // 'correction' | 'damage' | 'recount' | 'received_items'
 * }
 */
async function handleUpdateInventory(
  admin: any,
  params: any
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // Ensure IDs are in GID format
    const inventoryItemId = params.inventoryItemId.startsWith('gid://')
      ? params.inventoryItemId
      : `gid://shopify/InventoryItem/${params.inventoryItemId}`;

    const locationId = params.locationId.startsWith('gid://')
      ? params.locationId
      : `gid://shopify/Location/${params.locationId}`;

    const updateParams: UpdateInventoryParams = {
      inventoryItemId,
      locationId,
      availableQuantity: parseInt(params.quantity),
      reason: params.reason || 'correction'
    };

    const result = await updateInventoryQuantity(admin, updateParams);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        inventoryLevel: result.inventoryLevel,
        message: 'Inventory updated successfully'
      }
    };

  } catch (error: any) {
    console.error('[handleUpdateInventory] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle fulfillment creation
 *
 * Request params:
 * {
 *   orderId: string,              // Shopify order ID (numeric or GID)
 *   trackingNumber?: string,      // Optional tracking number
 *   trackingCompany?: string,     // Optional carrier name
 *   trackingUrl?: string,         // Optional tracking URL
 *   notifyCustomer?: boolean,     // Send email notification (default: true)
 *   locationId?: string           // Optional location ID
 * }
 */
async function handleCreateFulfillment(
  admin: any,
  params: any
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // Ensure order ID is in GID format
    const orderId = params.orderId.startsWith('gid://')
      ? params.orderId
      : `gid://shopify/Order/${params.orderId}`;

    const locationId = params.locationId
      ? (params.locationId.startsWith('gid://')
          ? params.locationId
          : `gid://shopify/Location/${params.locationId}`)
      : undefined;

    const fulfillmentParams: CreateFulfillmentParams = {
      orderId,
      trackingNumber: params.trackingNumber,
      trackingCompany: params.trackingCompany,
      trackingUrl: params.trackingUrl,
      notifyCustomer: params.notifyCustomer !== false,
      locationId
    };

    const result = await createFulfillment(admin, fulfillmentParams);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        fulfillment: result.fulfillment,
        message: 'Fulfillment created successfully'
      }
    };

  } catch (error: any) {
    console.error('[handleCreateFulfillment] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle fulfillment cancellation
 *
 * Request params:
 * {
 *   fulfillmentId: string  // Shopify fulfillment ID (numeric or GID)
 * }
 */
async function handleCancelFulfillment(
  admin: any,
  params: any
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // Ensure fulfillment ID is in GID format
    const fulfillmentId = params.fulfillmentId.startsWith('gid://')
      ? params.fulfillmentId
      : `gid://shopify/Fulfillment/${params.fulfillmentId}`;

    const result = await cancelFulfillment(admin, fulfillmentId);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        message: 'Fulfillment cancelled successfully'
      }
    };

  } catch (error: any) {
    console.error('[handleCancelFulfillment] Error:', error);
    return { success: false, error: error.message };
  }
}
