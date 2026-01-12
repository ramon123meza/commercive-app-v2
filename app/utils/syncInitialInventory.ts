import type { Session } from "@shopify/shopify-app-remix";
import { syncInventory } from "./lambdaClient";
import type { SyncInventoryPayload } from "~/types/api.types";

export async function syncInitialInventory(session: Session, admin: any): Promise<number> {
  let totalItemsSynced = 0;
  let hasNextPage = true;
  let cursor: string | null = null;

  console.log(`[InitialSync] Starting inventory sync for ${session.shop}`);

  while (hasNextPage) {
    // Use inventoryItems query instead of products to reduce GraphQL cost
    // This matches the old working version and avoids the cost limit error
    const query = `#graphql
      query GetInventoryItems($cursor: String) {
        inventoryItems(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              sku
              tracked
              variant {
                id
                title
                image {
                  url
                }
                product {
                  id
                  title
                  featuredMedia {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
              }
              inventoryLevels(first: 10) {
                edges {
                  node {
                    id
                    location {
                      id
                      name
                    }
                    quantities(names: ["available", "on_hand"]) {
                      name
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, {
        variables: { cursor },
      });

      const result = await response.json();

      // Check for GraphQL errors
      if (result.errors) {
        console.error(`[InitialSync] GraphQL errors:`, result.errors);
        throw new Error(`GraphQL query failed: ${JSON.stringify(result.errors)}`);
      }

      const inventoryEdges = result.data?.inventoryItems?.edges || [];

      const inventoryItems: SyncInventoryPayload['items'] = [];

      for (const edge of inventoryEdges) {
        const item = edge.node;
        const inventoryItemId = item.id.split('/').pop();
        const productId = item.variant?.product?.id?.split('/').pop();

        // Get product image - prefer variant image, fallback to product featured media
        const productImage = item.variant?.image?.url ||
                           item.variant?.product?.featuredMedia?.preview?.image?.url ||
                           null;

        if (!inventoryItemId) continue;

        const inventoryLevels = item.inventoryLevels?.edges || [];

        for (const levelEdge of inventoryLevels) {
          const level = levelEdge.node;
          const locationId = level.location.id.split('/').pop();

          // Extract quantity from the quantities array
          const availableQuantity = level.quantities?.find((q: any) => q.name === 'available')?.quantity || 0;

          inventoryItems.push({
            shopify_inventory_item_id: inventoryItemId,
            shopify_product_id: productId || '',
            product_title: item.variant?.product?.title || 'Unknown Product',
            variant_title: item.variant?.title !== 'Default Title' ? item.variant?.title : null,
            sku: item.sku || null,
            quantity: availableQuantity,
            location_id: locationId || '',
            location_name: level.location.name || 'Primary',
          });
        }
      }

      // Send items ONE AT A TIME to prevent HTTP 500 errors
      // This matches how inventory webhooks work and prevents payload size/timeout issues
      if (inventoryItems.length > 0) {
        for (const item of inventoryItems) {
          try {
            const payload: SyncInventoryPayload = {
              store_url: session.shop,
              items: [item], // Send one item at a time
            };

            await syncInventory(payload);
            totalItemsSynced++;
          } catch (itemError) {
            console.error(`[InitialSync] Failed to sync inventory item ${item.shopify_inventory_item_id}:`, itemError);
            // Continue with next item even if this one fails
          }
        }

        console.log(`[InitialSync] Synced batch: ${inventoryItems.length} items (total: ${totalItemsSynced})`);
      }

      hasNextPage = result.data?.inventoryItems?.pageInfo?.hasNextPage || false;
      cursor = result.data?.inventoryItems?.pageInfo?.endCursor || null;

      // Rate limiting - wait between batches to avoid hitting API limits
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`[InitialSync] Error syncing inventory batch:`, error);

      // If it's a GraphQL cost error, log it clearly
      if (error instanceof Error && error.message.includes('cost')) {
        console.error(`[InitialSync] GraphQL COST LIMIT ERROR - This query exceeds Shopify's cost limits`);
      }

      throw error; // Re-throw to be caught by afterAuth hook
    }
  }

  console.log(`[InitialSync] Completed: ${totalItemsSynced} inventory items synced`);
  return totalItemsSynced;
}
