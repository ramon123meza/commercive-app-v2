import type { Session } from "@shopify/shopify-app-remix";
import { syncInventory } from "./lambdaClient";
import type { SyncInventoryPayload } from "~/types/api.types";

export async function syncInitialInventory(session: Session, admin: any): Promise<number> {
  let totalProductsSynced = 0;
  let hasNextPage = true;
  let cursor: string | null = null;

  console.log(`[InitialSync] Starting inventory sync for ${session.shop}`);

  while (hasNextPage) {
    const query = `#graphql
      query GetProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    inventoryItem {
                      id
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
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { cursor },
    });

    const result = await response.json();
    const products = result.data?.products?.edges || [];

    const inventoryItems: SyncInventoryPayload['items'] = [];

    for (const productEdge of products) {
      const product = productEdge.node;
      const productId = product.id.split('/').pop();

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const inventoryItemId = variant.inventoryItem?.id?.split('/').pop();

        if (!inventoryItemId) continue;

        const inventoryLevels = variant.inventoryItem.inventoryLevels?.edges || [];

        for (const levelEdge of inventoryLevels) {
          const level = levelEdge.node;
          const locationId = level.location.id.split('/').pop();

          // Extract quantity from the new quantities array structure
          const availableQuantity = level.quantities?.find((q: any) => q.name === 'available')?.quantity || 0;

          inventoryItems.push({
            shopify_inventory_item_id: inventoryItemId,
            shopify_product_id: productId || '',
            product_title: product.title,
            variant_title: variant.title !== 'Default Title' ? variant.title : null,
            sku: variant.sku || null,
            quantity: availableQuantity,
            location_id: locationId || '',
            location_name: level.location.name || 'Primary',
          });
        }
      }
    }

    if (inventoryItems.length > 0) {
      const payload: SyncInventoryPayload = {
        store_url: session.shop,
        items: inventoryItems,
      };

      await syncInventory(payload);
      totalProductsSynced += inventoryItems.length;
      console.log(`[InitialSync] Synced batch: ${inventoryItems.length} items (total: ${totalProductsSynced})`);
    }

    hasNextPage = result.data?.products?.pageInfo?.hasNextPage || false;
    cursor = result.data?.products?.pageInfo?.endCursor || null;

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[InitialSync] Completed: ${totalProductsSynced} inventory items synced`);
  return totalProductsSynced;
}
