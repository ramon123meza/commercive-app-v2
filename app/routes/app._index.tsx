import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  Badge,
  Banner,
  Button,
  Layout,
  DataTable,
  ProgressBar,
  InlineStack,
  Box,
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
  transformOrderData,
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
  const orders = await fetchAllOrders(admin);
  console.log("orders.length :>> ", orders.length);
  const orderData = await transformOrderInitialData(
    orders,
    storeData.shop.myshopifyDomain,
  );

  // Fetch fulfillments from Shopify
  const fulfillments = await fetchAllFulfillments(admin);
  console.log("fulfillments.length :>> ", fulfillments.length);
  const fulfillmentData = transformFulfillmentDataFromShopify(
    fulfillments,
    storeUrl,
  );

  if (!inventoryFetched || true) {
    try {
      const inventoryData = await fetchAllInventoryLevels(admin);
      const transformedData = transformInventoryData(inventoryData, storeUrl);
      await saveInventoryDataToSupabase(transformedData);
      await setInventoryFetched({ storeName: storeName, storeUrl: storeUrl });
      await saveOrdersToSupabase(orderData);
      await saveFulfillmentDataToSupabase(fulfillmentData);
    } catch (error) {
      console.error(`Error fetching data for ${storeName}:`, error);
    }
  } else {
    console.log(
      `✅Inventory already fetched for store: ${storeName}. Skipping...`,
    );
  }

  // Get counts
  const { count: orderCount } = await supabase
    .from("order")
    .select("id", { count: "exact" })
    .eq("store_url", storeUrl);
  const { count: trackingCount } = await supabase
    .from("trackings")
    .select("id", { count: "exact" })
    .eq("store_url", storeUrl);
  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("store_url", { count: "exact" })
    .eq("store_url", storeUrl);

  // Fetch recent orders (last 10)
  const { data: recentOrders } = await supabase
    .from("order")
    .select("order_number, created_at, total_order_value, currency, fulfillment_status, financial_status, customer_email")
    .eq("store_url", storeUrl)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get order trends (this week vs last week)
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  const { count: thisWeekCount } = await supabase
    .from("order")
    .select("id", { count: "exact" })
    .eq("store_url", storeUrl)
    .gte("created_at", startOfThisWeek.toISOString());

  const { count: lastWeekCount } = await supabase
    .from("order")
    .select("id", { count: "exact" })
    .eq("store_url", storeUrl)
    .gte("created_at", startOfLastWeek.toISOString())
    .lt("created_at", startOfThisWeek.toISOString());

  // Get shipment status summary
  const { data: shipmentStatuses } = await supabase
    .from("trackings")
    .select("shipment_status, status")
    .eq("store_url", storeUrl);

  // Count by status
  const statusCounts = {
    in_transit: 0,
    delivered: 0,
    pending: 0,
    success: 0,
    other: 0,
  };

  shipmentStatuses?.forEach((item) => {
    const status = (item.shipment_status || item.status || "").toLowerCase();
    if (status.includes("transit") || status.includes("shipping")) {
      statusCounts.in_transit++;
    } else if (status.includes("delivered")) {
      statusCounts.delivered++;
    } else if (status.includes("pending")) {
      statusCounts.pending++;
    } else if (status.includes("success") || status.includes("fulfilled")) {
      statusCounts.success++;
    } else {
      statusCounts.other++;
    }
  });

  // Fetch low stock inventory items
  const { data: inventoryItems } = await supabase
    .from("inventory")
    .select("product_name, sku, inventory_level, product_image, variant_name")
    .eq("store_url", storeUrl)
    .limit(100);

  // Process inventory to find low stock items
  const lowStockItems = inventoryItems
    ?.map((item) => {
      try {
        const inventoryLevel = item.inventory_level as any;
        if (inventoryLevel && Array.isArray(inventoryLevel) && inventoryLevel.length > 0) {
          const node = inventoryLevel[0]?.node;
          if (node && node.quantities) {
            const availableQty = node.quantities.find(
              (q: any) => q.name === "available"
            )?.quantity || 0;
            return {
              ...item,
              availableQuantity: availableQty,
            };
          }
        }
        return { ...item, availableQuantity: 0 };
      } catch (e) {
        return { ...item, availableQuantity: 0 };
      }
    })
    .filter((item) => item.availableQuantity !== null && item.availableQuantity < 10)
    .sort((a, b) => (a.availableQuantity || 0) - (b.availableQuantity || 0))
    .slice(0, 10);

  // Get recent fulfillments
  const { data: recentFulfillments } = await supabase
    .from("trackings")
    .select("order_id, tracking_number, tracking_company, shipment_status, status, created_at")
    .eq("store_url", storeUrl)
    .order("created_at", { ascending: false })
    .limit(5);

  // Get store sync info
  const { data: storeInfo } = await supabase
    .from("stores")
    .select("created_at, is_inventory_fetched")
    .eq("store_url", storeUrl)
    .single();

  console.log(orderCount, trackingCount, inventoryCount);
  return {
    storeData: storeData.shop,
    orderCount: orderCount || 0,
    trackingCount: trackingCount || 0,
    inventoryCount: inventoryCount || 0,
    recentOrders: recentOrders || [],
    thisWeekCount: thisWeekCount || 0,
    lastWeekCount: lastWeekCount || 0,
    shipmentStatusCounts: statusCounts,
    lowStockItems: lowStockItems || [],
    recentFulfillments: recentFulfillments || [],
    storeInfo: storeInfo,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "disconnect") {
    // Add logic to handle disconnecting the store
    console.log("Store disconnected!");
    // Example: Clear session or remove store-related data from the database
    return { success: true, message: "Store disconnected successfully.." };
  }

  return { success: false, message: "Invalid action" };
};

export default function Index() {
  const {
    storeData,
    orderCount,
    trackingCount,
    inventoryCount,
    recentOrders,
    thisWeekCount,
    lastWeekCount,
    shipmentStatusCounts,
    lowStockItems,
    recentFulfillments,
    storeInfo,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleDisconnect = () => {
    fetcher.submit({ action: "disconnect" }, { method: "POST" });
  };

  const isLoading =
    fetcher.state === "loading" || fetcher.state === "submitting";

  // Calculate order trend
  const orderTrend = lastWeekCount > 0
    ? ((thisWeekCount - lastWeekCount) / lastWeekCount * 100).toFixed(1)
    : thisWeekCount > 0 ? "100" : "0";
  const isPositiveTrend = parseFloat(orderTrend) >= 0;

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format currency helper
  const formatCurrency = (value: string, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(parseFloat(value || "0"));
  };

  // Prepare recent orders table data
  const orderRows = recentOrders.map((order) => [
    `#${order.order_number}`,
    formatDate(order.created_at),
    formatCurrency(order.total_order_value, order.currency || "USD"),
    <Badge
      key={order.order_number}
      tone={
        order.fulfillment_status === "fulfilled"
          ? "success"
          : order.fulfillment_status === "partial"
          ? "attention"
          : "info"
      }
    >
      {order.fulfillment_status || "unfulfilled"}
    </Badge>,
    <Badge
      key={`${order.order_number}-financial`}
      tone={order.financial_status === "paid" ? "success" : "critical"}
    >
      {order.financial_status || "pending"}
    </Badge>,
    order.customer_email || "N/A",
  ]);

  // Prepare low stock items table data
  const lowStockRows = lowStockItems.map((item) => [
    <div key={item.sku} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      {item.product_image && (
        <img
          src={item.product_image}
          alt={item.product_name || "Product"}
          style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }}
        />
      )}
      <div>
        <div style={{ fontWeight: "500" }}>{item.product_name || "Unknown Product"}</div>
        {item.variant_name && (
          <div style={{ fontSize: "12px", color: "#6D7175" }}>{item.variant_name}</div>
        )}
      </div>
    </div>,
    item.sku || "N/A",
    <Badge key={item.sku} tone={item.availableQuantity === 0 ? "critical" : "warning"}>
      {item.availableQuantity} units
    </Badge>,
  ]);

  // Prepare fulfillments table data
  const fulfillmentRows = recentFulfillments.map((fulfillment) => [
    `#${fulfillment.order_id}`,
    fulfillment.tracking_number || "N/A",
    fulfillment.tracking_company || "N/A",
    <Badge
      key={fulfillment.order_id}
      tone={
        fulfillment.shipment_status?.toLowerCase().includes("delivered")
          ? "success"
          : fulfillment.shipment_status?.toLowerCase().includes("transit")
          ? "info"
          : "attention"
      }
    >
      {fulfillment.shipment_status || fulfillment.status || "pending"}
    </Badge>,
    formatDate(fulfillment.created_at),
  ]);

  return (
    <Page>
      <TitleBar title="Commercive Dashboard"></TitleBar>
      <BlockStack gap="500">
        {/* Store Connection Status Banner */}
        {storeInfo && (
          <Banner
            tone="success"
            title="Store Connected"
          >
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodyMd">
                Last synced: {formatDate(storeInfo.created_at)}
              </Text>
              <Button
                size="slim"
                onClick={() => window.location.reload()}
              >
                Refresh Data
              </Button>
            </InlineStack>
          </Banner>
        )}

        {/* Key Metrics */}
        <Layout>
          <Layout.Section>
            <InlineGrid gap="400" columns={{ xs: 1, sm: 2, md: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    Total Orders
                  </Text>
                  <Text variant="heading2xl" as="h2">
                    {orderCount}
                  </Text>
                  <InlineStack gap="100" blockAlign="center">
                    <Badge tone={isPositiveTrend ? "success" : "critical"}>
                      {isPositiveTrend ? "+" : ""}{orderTrend}%
                    </Badge>
                    <Text variant="bodySm" as="span" tone="subdued">
                      vs last week
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    Active Shipments
                  </Text>
                  <Text variant="heading2xl" as="h2">
                    {trackingCount}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    {shipmentStatusCounts.in_transit} in transit
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    Inventory Items
                  </Text>
                  <Text variant="heading2xl" as="h2">
                    {inventoryCount}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    {lowStockItems.length} low stock alerts
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    This Week
                  </Text>
                  <Text variant="heading2xl" as="h2">
                    {thisWeekCount}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    orders received
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          {/* Shipment Status Overview */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Shipment Status Overview
                </Text>
                <InlineGrid gap="400" columns={{ xs: 1, sm: 2, md: 5 }}>
                  <Box>
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="span" tone="subdued">
                        Delivered
                      </Text>
                      <Text variant="headingLg" as="h4">
                        {shipmentStatusCounts.delivered}
                      </Text>
                      <ProgressBar
                        progress={
                          trackingCount > 0
                            ? (shipmentStatusCounts.delivered / trackingCount) * 100
                            : 0
                        }
                        tone="success"
                        size="small"
                      />
                    </BlockStack>
                  </Box>
                  <Box>
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="span" tone="subdued">
                        In Transit
                      </Text>
                      <Text variant="headingLg" as="h4">
                        {shipmentStatusCounts.in_transit}
                      </Text>
                      <ProgressBar
                        progress={
                          trackingCount > 0
                            ? (shipmentStatusCounts.in_transit / trackingCount) * 100
                            : 0
                        }
                        tone="primary"
                        size="small"
                      />
                    </BlockStack>
                  </Box>
                  <Box>
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="span" tone="subdued">
                        Fulfilled
                      </Text>
                      <Text variant="headingLg" as="h4">
                        {shipmentStatusCounts.success}
                      </Text>
                      <ProgressBar
                        progress={
                          trackingCount > 0
                            ? (shipmentStatusCounts.success / trackingCount) * 100
                            : 0
                        }
                        tone="success"
                        size="small"
                      />
                    </BlockStack>
                  </Box>
                  <Box>
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="span" tone="subdued">
                        Pending
                      </Text>
                      <Text variant="headingLg" as="h4">
                        {shipmentStatusCounts.pending}
                      </Text>
                      <ProgressBar
                        progress={
                          trackingCount > 0
                            ? (shipmentStatusCounts.pending / trackingCount) * 100
                            : 0
                        }
                        tone="attention"
                        size="small"
                      />
                    </BlockStack>
                  </Box>
                  <Box>
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="span" tone="subdued">
                        Other
                      </Text>
                      <Text variant="headingLg" as="h4">
                        {shipmentStatusCounts.other}
                      </Text>
                      <ProgressBar
                        progress={
                          trackingCount > 0
                            ? (shipmentStatusCounts.other / trackingCount) * 100
                            : 0
                        }
                        size="small"
                      />
                    </BlockStack>
                  </Box>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Orders */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Recent Orders
                  </Text>
                  <Button
                    onClick={() =>
                      window.open(
                        "https://dashboard.commercive.co",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    View All Orders
                  </Button>
                </InlineStack>
                {orderRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={[
                      "Order",
                      "Date",
                      "Total",
                      "Fulfillment",
                      "Payment",
                      "Customer",
                    ]}
                    rows={orderRows}
                  />
                ) : (
                  <Box paddingBlock="400">
                    <InlineStack align="center">
                      <Text variant="bodyMd" as="p" tone="subdued">
                        No orders found
                      </Text>
                    </InlineStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Low Stock Alerts */}
          {lowStockItems.length > 0 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h3">
                      Low Stock Alerts
                    </Text>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://dashboard.commercive.co",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      Manage Inventory
                    </Button>
                  </InlineStack>
                  <Banner tone="warning">
                    You have {lowStockItems.length} items with low stock levels that
                    need attention.
                  </Banner>
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["Product", "SKU", "Available"]}
                    rows={lowStockRows}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Recent Fulfillments */}
          {recentFulfillments.length > 0 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h3">
                      Recent Fulfillments
                    </Text>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://dashboard.commercive.co",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      View All Tracking
                    </Button>
                  </InlineStack>
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={[
                      "Order",
                      "Tracking Number",
                      "Carrier",
                      "Status",
                      "Date",
                    ]}
                    rows={fulfillmentRows}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Quick Actions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Quick Actions
                </Text>
                <InlineGrid gap="300" columns={{ xs: 1, sm: 2, md: 4 }}>
                  <Button
                    variant="primary"
                    onClick={() =>
                      window.open(
                        "https://dashboard.commercive.co",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    fullWidth
                  >
                    Open Full Dashboard
                  </Button>
                  <Button
                    onClick={() => window.location.reload()}
                    fullWidth
                  >
                    Sync Data
                  </Button>
                  <Button
                    onClick={() =>
                      window.open(
                        "https://dashboard.commercive.co/orders",
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
                        "https://dashboard.commercive.co/inventory",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    fullWidth
                  >
                    Manage Inventory
                  </Button>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Support Section */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  Need Help?
                </Text>
                <Text variant="bodyMd" as="p">
                  Our support team is here to help you get the most out of
                  Commercive.
                </Text>
                <InlineStack gap="200">
                  <Button
                    onClick={() =>
                      window.open("mailto:support@commercive.co", "_self")
                    }
                  >
                    Contact Support
                  </Button>
                  <Button
                    onClick={() =>
                      window.open(
                        "https://commercive.co",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    Learn More
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
