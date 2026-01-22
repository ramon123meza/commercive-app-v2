/**
 * Shopify GraphQL Mutations
 *
 * Two-way sync utilities for updating Shopify from the dashboard.
 * These mutations enable dashboard → Shopify data flow.
 */

export interface UpdateInventoryParams {
  inventoryItemId: string;  // gid://shopify/InventoryItem/123...
  locationId: string;        // gid://shopify/Location/123...
  availableQuantity: number;
  reason?: string;           // 'correction' | 'damage' | 'recount' | 'received_items'
}

export interface CreateFulfillmentParams {
  orderId: string;                    // gid://shopify/Order/123...
  locationId?: string;                // gid://shopify/Location/123... (optional)
  trackingCompany?: string;           // e.g., 'USPS', 'FedEx', 'UPS'
  trackingNumber?: string;            // Tracking number
  trackingUrl?: string;               // Custom tracking URL
  notifyCustomer?: boolean;           // Send shipment notification email
  lineItems?: Array<{                 // Optional: specific line items to fulfill
    id: string;                       // gid://shopify/LineItem/123...
    quantity: number;
  }>;
}

/**
 * Update inventory quantity in Shopify
 *
 * Uses inventorySetQuantities mutation (replaces deprecated inventoryAdjustQuantity)
 *
 * @param admin - Shopify admin GraphQL client
 * @param params - Inventory update parameters
 * @returns Updated inventory level data
 */
export async function updateInventoryQuantity(
  admin: any,
  params: UpdateInventoryParams
): Promise<{ success: boolean; error?: string; inventoryLevel?: any }> {
  try {
    const mutation = `#graphql
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
            reason
            createdAt
            changes {
              name
              delta
              quantityAfterChange
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        reason: params.reason || 'correction',
        name: 'available',  // Update 'available' quantity
        quantities: [
          {
            inventoryItemId: params.inventoryItemId,
            locationId: params.locationId,
            quantity: params.availableQuantity
          }
        ]
      }
    };

    console.log('[updateInventoryQuantity] Mutation variables:', JSON.stringify(variables, null, 2));

    const response = await admin.graphql(mutation, { variables });
    const result = await response.json();

    console.log('[updateInventoryQuantity] Response:', JSON.stringify(result, null, 2));

    if (result.data?.inventorySetQuantities?.userErrors?.length > 0) {
      const errors = result.data.inventorySetQuantities.userErrors;
      console.error('[updateInventoryQuantity] User errors:', errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(', ')
      };
    }

    return {
      success: true,
      inventoryLevel: result.data?.inventorySetQuantities?.inventoryAdjustmentGroup
    };

  } catch (error: any) {
    console.error('[updateInventoryQuantity] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update inventory'
    };
  }
}

/**
 * Create a fulfillment in Shopify
 *
 * Marks an order (or specific line items) as fulfilled/shipped.
 * Can optionally include tracking information.
 *
 * @param admin - Shopify admin GraphQL client
 * @param params - Fulfillment creation parameters
 * @returns Created fulfillment data
 */
export async function createFulfillment(
  admin: any,
  params: CreateFulfillmentParams
): Promise<{ success: boolean; error?: string; fulfillment?: any }> {
  try {
    const mutation = `#graphql
      mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
            trackingInfo {
              company
              number
              url
            }
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Build tracking info if provided
    const trackingInfo: any[] = [];
    if (params.trackingNumber || params.trackingCompany) {
      trackingInfo.push({
        company: params.trackingCompany || 'Other',
        number: params.trackingNumber || '',
        url: params.trackingUrl || ''
      });
    }

    // Build fulfillment input
    const fulfillmentInput: any = {
      orderId: params.orderId,
      notifyCustomer: params.notifyCustomer !== false  // Default true
    };

    // Add location if provided
    if (params.locationId) {
      fulfillmentInput.locationId = params.locationId;
    }

    // Add tracking info if provided
    if (trackingInfo.length > 0) {
      fulfillmentInput.trackingInfo = trackingInfo;
    }

    // Add specific line items if provided
    // If not provided, Shopify will fulfill all unfulfilled items
    if (params.lineItems && params.lineItems.length > 0) {
      fulfillmentInput.lineItemsByFulfillmentOrder = params.lineItems.map(item => ({
        fulfillmentOrderLineItems: [{
          id: item.id,
          quantity: item.quantity
        }]
      }));
    }

    const variables = {
      fulfillment: fulfillmentInput
    };

    console.log('[createFulfillment] Mutation variables:', JSON.stringify(variables, null, 2));

    const response = await admin.graphql(mutation, { variables });
    const result = await response.json();

    console.log('[createFulfillment] Response:', JSON.stringify(result, null, 2));

    if (result.data?.fulfillmentCreateV2?.userErrors?.length > 0) {
      const errors = result.data.fulfillmentCreateV2.userErrors;
      console.error('[createFulfillment] User errors:', errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(', ')
      };
    }

    return {
      success: true,
      fulfillment: result.data?.fulfillmentCreateV2?.fulfillment
    };

  } catch (error: any) {
    console.error('[createFulfillment] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create fulfillment'
    };
  }
}

/**
 * Cancel a fulfillment in Shopify
 *
 * @param admin - Shopify admin GraphQL client
 * @param fulfillmentId - Shopify fulfillment ID (gid://shopify/Fulfillment/123...)
 * @returns Cancellation result
 */
export async function cancelFulfillment(
  admin: any,
  fulfillmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const mutation = `#graphql
      mutation fulfillmentCancel($id: ID!) {
        fulfillmentCancel(id: $id) {
          fulfillment {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = { id: fulfillmentId };

    console.log('[cancelFulfillment] Mutation variables:', JSON.stringify(variables, null, 2));

    const response = await admin.graphql(mutation, { variables });
    const result = await response.json();

    console.log('[cancelFulfillment] Response:', JSON.stringify(result, null, 2));

    if (result.data?.fulfillmentCancel?.userErrors?.length > 0) {
      const errors = result.data.fulfillmentCancel.userErrors;
      console.error('[cancelFulfillment] User errors:', errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(', ')
      };
    }

    return { success: true };

  } catch (error: any) {
    console.error('[cancelFulfillment] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel fulfillment'
    };
  }
}
