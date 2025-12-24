/**
 * Main Shopify App Dashboard
 *
 * Shows store overview, recent orders, inventory status, and tracking info.
 * Uses Lambda functions instead of direct Supabase queries.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Button, Text, BlockStack } from "@shopify/polaris";
import {
  getOrders,
  getInventory,
  getLowStockItems,
  disconnectStore,
} from "~/utils/lambdaClient";
import { DASHBOARD_URLS } from "~/config/lambda.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Fetch data from Lambda functions
    const [recentOrders, inventory, lowStockItems] = await Promise.all([
      getOrders(session.shop, 10),
      getInventory(session.shop, 20),
      getLowStockItems(session.shop, 10),
    ]);

    return json({
      shop: session.shop,
      recentOrders,
      inventory,
      lowStockItems,
      dashboardUrl: DASHBOARD_URLS.affiliate,
    });
  } catch (error: any) {
    console.error("[Dashboard] Error loading data:", error);

    return json({
      shop: session.shop,
      recentOrders: [],
      inventory: [],
      lowStockItems: [],
      dashboardUrl: DASHBOARD_URLS.affiliate,
      error: error.message || "Failed to load data",
    });
  }
};

export default function Index() {
  const {
    shop,
    recentOrders,
    inventory,
    lowStockItems,
    dashboardUrl,
    error,
  } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Commercive Dashboard"
      primaryAction={{
        content: "Open Full Dashboard",
        url: dashboardUrl,
        external: true,
      }}
    >
      <BlockStack gap="500">
        {error && (
          <Card>
            <Text as="p" tone="critical">
              Error loading data: {error}
            </Text>
          </Card>
        )}

        {/* Welcome Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Welcome to Commercive!
            </Text>
            <Text as="p">
              Your Shopify store <strong>{shop}</strong> is connected to the Commercive platform.
            </Text>
            <Text as="p">
              Access your full dashboard for complete inventory management, order tracking, and affiliate features.
            </Text>
            <Button
              url={dashboardUrl}
              external
              variant="primary"
            >
              Open Full Dashboard →
            </Button>
          </BlockStack>
        </Card>

        {/* Quick Stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Recent Orders
                </Text>
                <Text as="p" variant="heading2xl">
                  {recentOrders.length}
                </Text>
                <Text as="p" tone="subdued">
                  Last 10 orders
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Inventory Items
                </Text>
                <Text as="p" variant="heading2xl">
                  {inventory.length}
                </Text>
                <Text as="p" tone="subdued">
                  Products synced
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Low Stock Alerts
                </Text>
                <Text as="p" variant="heading2xl" tone={lowStockItems.length > 0 ? "critical" : "success"}>
                  {lowStockItems.length}
                </Text>
                <Text as="p" tone="subdued">
                  Items need restock
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Low Stock Items */}
        {lowStockItems.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Low Stock Alerts
              </Text>
              {lowStockItems.slice(0, 5).map((item) => (
                <div key={item.inventory_id} style={{ padding: '8px 0', borderBottom: '1px solid #e1e3e5' }}>
                  <Text as="p" fontWeight="semibold">
                    {item.product_title}
                    {item.variant_title && ` - ${item.variant_title}`}
                  </Text>
                  <Text as="p" tone="subdued">
                    SKU: {item.sku || "N/A"} | Quantity: {item.quantity}
                  </Text>
                </div>
              ))}
              {lowStockItems.length > 5 && (
                <Text as="p" tone="subdued">
                  And {lowStockItems.length - 5} more items...
                </Text>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Help Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Need Help?
            </Text>
            <Text as="p">
              For complete documentation and support, visit your full dashboard or contact our support team.
            </Text>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button url={dashboardUrl} external>
                Full Dashboard
              </Button>
              <Button url={`${dashboardUrl}/support`} external>
                Support
              </Button>
            </div>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
