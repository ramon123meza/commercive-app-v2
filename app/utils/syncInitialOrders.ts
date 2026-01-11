import type { Session } from "@shopify/shopify-app-remix";
import axios from 'axios';
import { LAMBDA_URLS } from '~/config/lambda.server';

interface SyncOrderPayload {
  store_url: string;
  orders: Array<{
    shopify_order_id: string;
    order_number: string;
    customer_name: string;
    customer_email: string;
    total_price: string;
    currency: string;
    financial_status: string;
    fulfillment_status: string;
    created_at: string;
    line_items: Array<{
      shopify_line_item_id: string;
      product_title: string;
      variant_title: string;
      sku: string;
      quantity: number;
      price: string;
    }>;
  }>;
}

export async function syncInitialOrders(session: Session, admin: any): Promise<number> {
  let totalOrdersSynced = 0;
  let hasNextPage = true;
  let cursor: string | null = null;

  console.log(`[InitialOrdersSync] Starting orders sync for ${session.shop}`);

  // Fetch last 90 days of orders
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const createdAtMin = ninetyDaysAgo.toISOString();

  while (hasNextPage) {
    const query = `#graphql
      query GetOrders($cursor: String, $queryFilter: String) {
        orders(first: 50, after: $cursor, query: $queryFilter) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              displayFinancialStatus
              displayFulfillmentStatus
              customer {
                firstName
                lastName
                email
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    title
                    variantTitle
                    sku
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                        amount
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

    try {
      const response = await admin.graphql(query, {
        variables: {
          cursor,
          queryFilter: `created_at:>=${createdAtMin}`
        },
      });

      const result = await response.json();
      const orders = result.data?.orders?.edges || [];

      if (orders.length === 0) {
        console.log(`[InitialOrdersSync] No orders found`);
        break;
      }

      // Transform orders for our API
      const transformedOrders: SyncOrderPayload['orders'] = orders.map((orderEdge: any) => {
        const order = orderEdge.node;
        const orderId = order.id.split('/').pop();

        return {
          shopify_order_id: orderId,
          order_number: order.name,
          customer_name: order.customer
            ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
            : '',
          customer_email: order.customer?.email || '',
          total_price: order.totalPriceSet?.shopMoney?.amount || '0',
          currency: order.totalPriceSet?.shopMoney?.currencyCode || 'USD',
          financial_status: order.displayFinancialStatus?.toLowerCase() || 'pending',
          fulfillment_status: order.displayFulfillmentStatus?.toLowerCase() || 'unfulfilled',
          created_at: order.createdAt,
          line_items: order.lineItems.edges.map((lineItemEdge: any) => {
            const lineItem = lineItemEdge.node;
            const lineItemId = lineItem.id.split('/').pop();

            return {
              shopify_line_item_id: lineItemId,
              product_title: lineItem.title || '',
              variant_title: lineItem.variantTitle || '',
              sku: lineItem.sku || '',
              quantity: lineItem.quantity || 1,
              price: lineItem.originalUnitPriceSet?.shopMoney?.amount || '0',
            };
          }),
        };
      });

      // Send to Lambda
      if (transformedOrders.length > 0) {
        const payload: SyncOrderPayload = {
          store_url: session.shop,
          orders: transformedOrders,
        };

        const ordersLambdaUrl = LAMBDA_URLS.orders;
        if (ordersLambdaUrl) {
          await axios.post(`${ordersLambdaUrl}/orders/sync`, payload, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        totalOrdersSynced += transformedOrders.length;
        console.log(`[InitialOrdersSync] Synced batch: ${transformedOrders.length} orders (total: ${totalOrdersSynced})`);
      }

      hasNextPage = result.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = result.data?.orders?.pageInfo?.endCursor || null;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`[InitialOrdersSync] Error fetching orders:`, error);
      break;
    }
  }

  console.log(`[InitialOrdersSync] Completed: ${totalOrdersSynced} orders synced`);
  return totalOrdersSynced;
}
