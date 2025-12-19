import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  Banner,
  Button,
  Layout,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { supabase } from "../supabase.server";
import {
  isInventoryFetched,
  saveInventoryDataToSupabase,
  saveOrdersToSupabase,
  setInventoryFetched,
  saveFulfillmentDataToSupabase,
} from "app/utils/supabaseHelpers";
import {
  fetchAllInventoryLevels,
  fetchAllOrders,
  fetchAllFulfillments,
} from "app/utils/shopify";
import {
  transformInventoryData,
  transformOrderInitialData,
  transformFulfillmentDataFromShopify,
} from "app/utils/transformDataHelpers";
import type { StoreInfo } from "app/types/payload";
import globalCssUrl from "./global.css?url";

export const links = () => [{ rel: "stylesheet", href: globalCssUrl }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // GraphQL query to fetch store information
  const query = `#graphql
    query {
      shop {
        name
        email
        myshopifyDomain
        primaryDomain {
          url
          host
        }
      }
    }
  `;
  const response = await admin.graphql(query);
  const storeData = (await response.json()).data as StoreInfo;
  console.log("storeData :>> ", storeData);
  const storeName = storeData.shop.name;
  const storeUrl = storeData.shop.myshopifyDomain;
  const inventoryFetched = await isInventoryFetched(storeUrl);

  // Perform initial data sync if this is the first load
  if (!inventoryFetched) {
    try {
      console.log(`[loader] Performing initial data sync for store: ${storeName}`);

      // Fetch all data in parallel
      const [inventoryData, orders, fulfillments] = await Promise.all([
        fetchAllInventoryLevels(admin),
        fetchAllOrders(admin),
        fetchAllFulfillments(admin),
      ]);

      console.log(`[loader] Fetched ${orders.length} orders, ${fulfillments.length} fulfillments`);

      // Transform data
      const transformedInventory = transformInventoryData(inventoryData, storeUrl);
      const transformedOrders = await transformOrderInitialData(orders, storeUrl);
      const transformedFulfillments = transformFulfillmentDataFromShopify(fulfillments, storeUrl);

      // Save to Supabase in parallel
      await Promise.all([
        saveInventoryDataToSupabase(transformedInventory),
        saveOrdersToSupabase(transformedOrders),
        saveFulfillmentDataToSupabase(transformedFulfillments),
        setInventoryFetched({ storeName, storeUrl }),
      ]);

      console.log(`[loader] Initial data sync completed for store: ${storeName}`);
    } catch (error) {
      console.error(`[loader] Error during initial data sync for ${storeName}:`, error);
    }
  } else {
    console.log(
      `[loader] Inventory already fetched for store: ${storeName}. Skipping initial sync...`,
    );
  }

  // Get store connection info
  const { data: storeInfo } = await supabase
    .from("stores")
    .select("created_at, is_inventory_fetched")
    .eq("store_url", storeUrl)
    .single();

  return {
    storeData: storeData.shop,
    storeInfo: storeInfo,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "disconnect") {
    try {
      console.log("[action] Processing store disconnect request");
      const { admin, session } = await authenticate.admin(request);

      const storeUrl = session.shop;
      console.log(`[action] Disconnecting store: ${storeUrl}`);

      // 1. Get store ID from database
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select("id")
        .eq("store_url", storeUrl)
        .single();

      if (storeError && storeError.code !== "PGRST116") {
        console.error("[action] Error fetching store data:", storeError);
        throw new Error(`Failed to fetch store data: ${storeError.message}`);
      }

      if (storeData) {
        const storeId = storeData.id;

        // 2. Delete store_to_user relationships
        const { error: linkError } = await supabase
          .from("store_to_user")
          .delete()
          .eq("store_id", storeId);

        if (linkError) {
          console.error("[action] Error deleting store-user links:", linkError);
        } else {
          console.log(`[action] Deleted store-user links for store ${storeId}`);
        }

        // 3. Delete store record (cascading deletes should handle inventory, orders, etc.)
        const { error: deleteError } = await supabase
          .from("stores")
          .delete()
          .eq("id", storeId);

        if (deleteError) {
          console.error("[action] Error deleting store record:", deleteError);
          throw new Error(`Failed to delete store record: ${deleteError.message}`);
        }

        console.log(`[action] Successfully deleted store record for ${storeUrl}`);
      }

      // 4. Delete webhooks from Shopify
      try {
        const webhooksResponse = await admin.rest.resources.Webhook.all({
          session: session,
        });

        const webhooks = webhooksResponse.data || [];
        console.log(`[action] Found ${webhooks.length} webhooks to delete`);

        for (const webhook of webhooks) {
          try {
            await admin.rest.resources.Webhook.delete({
              session: session,
              id: webhook.id,
            });
            console.log(`[action] Deleted webhook ${webhook.id} (${webhook.topic})`);
          } catch (webhookError) {
            console.error(`[action] Error deleting webhook ${webhook.id}:`, webhookError);
          }
        }
      } catch (webhookError) {
        console.error("[action] Error managing webhooks:", webhookError);
        // Continue with disconnect even if webhook deletion fails
      }

      // 5. Clear Shopify session from database
      try {
        const db = (await import("../db.server")).default;
        await db.session.deleteMany({ where: { shop: storeUrl } });
        console.log(`[action] Cleared sessions for shop: ${storeUrl}`);
      } catch (sessionError) {
        console.error("[action] Error clearing sessions:", sessionError);
      }

      console.log(`[action] Store ${storeUrl} disconnected successfully`);

      return {
        success: true,
        message: "Store disconnected successfully. All data has been removed.",
      };
    } catch (error) {
      console.error("[action] Error during store disconnect:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while disconnecting the store",
      };
    }
  }

  return { success: false, message: "Invalid action" };
};

export default function Index() {
  const { storeData, storeInfo } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleDisconnect = () => {
    if (confirm("Are you sure you want to disconnect this store? All data will be removed.")) {
      fetcher.submit({ action: "disconnect" }, { method: "POST" });
    }
  };

  const isLoading = fetcher.state === "loading" || fetcher.state === "submitting";

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Page>
      <TitleBar title="Commercive"></TitleBar>
      <BlockStack gap="500">
        {/* Success Banner */}
        {storeInfo && (
          <Banner tone="success" title="Store Connected Successfully">
            <Text as="p" variant="bodyMd">
              Your store {storeData.name} has been connected to Commercive. Data is being synced automatically.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Connected on: {formatDate(storeInfo.created_at)}
            </Text>
          </Banner>
        )}

        {/* Disconnect Result */}
        {fetcher.data?.success !== undefined && (
          <Banner
            tone={fetcher.data.success ? "success" : "critical"}
            title={fetcher.data.success ? "Store Disconnected" : "Disconnection Failed"}
          >
            <Text as="p" variant="bodyMd">
              {fetcher.data.message}
            </Text>
          </Banner>
        )}

        {/* Main Card - Welcome & CTA */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                {/* Hero Section */}
                <div style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  borderRadius: "8px",
                  color: "white",
                }}>
                  <div style={{ marginBottom: "24px" }}>
                    <Text as="h1" variant="heading2xl" tone="inherit">
                      Welcome to Commercive
                    </Text>
                  </div>
                  <div style={{ marginBottom: "32px", maxWidth: "600px", margin: "0 auto 32px" }}>
                    <Text as="p" variant="bodyLg" tone="inherit">
                      Your store is successfully connected. Manage your inventory, track shipments,
                      analyze orders, and access powerful logistics tools in the Commercive Dashboard.
                    </Text>
                  </div>
                  <InlineStack align="center" gap="300">
                    <Button
                      variant="primary"
                      size="large"
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      Open Commercive Dashboard
                    </Button>
                  </InlineStack>
                </div>

                {/* Features Overview */}
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">
                    What you can do in the Dashboard
                  </Text>
                  <InlineGrid gap="400" columns={{ xs: 1, sm: 2 }}>
                    <Card>
                      <BlockStack gap="200">
                        <div style={{ fontSize: "32px" }}>📦</div>
                        <Text variant="headingSm" as="h4">
                          Inventory Management
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Track stock levels, receive low stock alerts, and manage reorder requests
                          with AI-powered insights.
                        </Text>
                      </BlockStack>
                    </Card>

                    <Card>
                      <BlockStack gap="200">
                        <div style={{ fontSize: "32px" }}>🚚</div>
                        <Text variant="headingSm" as="h4">
                          Order & Shipment Tracking
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Monitor all your orders, track shipments in real-time, and view
                          fulfillment status across carriers.
                        </Text>
                      </BlockStack>
                    </Card>

                    <Card>
                      <BlockStack gap="200">
                        <div style={{ fontSize: "32px" }}>📊</div>
                        <Text variant="headingSm" as="h4">
                          Analytics & Reporting
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Get detailed insights into your business performance with advanced
                          analytics and custom reports.
                        </Text>
                      </BlockStack>
                    </Card>

                    <Card>
                      <BlockStack gap="200">
                        <div style={{ fontSize: "32px" }}>🤝</div>
                        <Text variant="headingSm" as="h4">
                          Affiliate Program
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Manage your affiliate partners, track commissions, and process
                          payouts seamlessly.
                        </Text>
                      </BlockStack>
                    </Card>
                  </InlineGrid>
                </BlockStack>

                {/* Quick Links */}
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Quick Links
                  </Text>
                  <InlineGrid gap="300" columns={{ xs: 1, sm: 2, md: 3 }}>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com/dashboard",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      fullWidth
                    >
                      Dashboard Home
                    </Button>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com/inventory",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      fullWidth
                    >
                      View Inventory
                    </Button>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com/orders",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      fullWidth
                    >
                      Manage Orders
                    </Button>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com/shipments",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      fullWidth
                    >
                      Track Shipments
                    </Button>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com/support",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      fullWidth
                    >
                      Get Support
                    </Button>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://www.commercive-admin.com/settings",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      fullWidth
                    >
                      Account Settings
                    </Button>
                  </InlineGrid>
                </BlockStack>

                {/* Data Sync Info */}
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <div>
                        <Text variant="headingSm" as="h4">
                          Automatic Data Sync
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Your Shopify data is automatically synced to Commercive in real-time via webhooks.
                        </Text>
                      </div>
                      <Button onClick={() => window.location.reload()}>
                        Refresh Connection
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Support & Disconnect */}
                <InlineStack align="space-between" blockAlign="center">
                  <div>
                    <Text variant="bodyMd" as="p">
                      Need help? Contact us at{" "}
                      <a href="mailto:support@commercive.co" style={{ color: "#667eea", textDecoration: "none" }}>
                        support@commercive.co
                      </a>
                    </Text>
                  </div>
                  <Button
                    tone="critical"
                    onClick={handleDisconnect}
                    loading={isLoading}
                  >
                    Disconnect Store
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
