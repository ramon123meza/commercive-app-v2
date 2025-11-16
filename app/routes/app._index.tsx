import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  EmptyState,
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
  console.log(orderCount, trackingCount, inventoryCount);
  return {
    storeData: storeData.shop,
    orderCount: orderCount,
    trackingCount: trackingCount,
    inventoryCount: inventoryCount,
  }; // Returning the store information
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
  const { storeData, orderCount, trackingCount, inventoryCount } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleDisconnect = () => {
    fetcher.submit({ action: "disconnect" }, { method: "POST" });
  };

  const isLoading =
    fetcher.state === "loading" || fetcher.state === "submitting";

  return (
    <Page>
      <TitleBar title="Commercive - Order & Inventory Management"></TitleBar>
      <BlockStack gap="500">
        <InlineGrid gap="400" columns={3}>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingLg" as="h4" alignment="center">
                Order Count
              </Text>
              <Text variant="heading3xl" as="h1" alignment="center">
                {orderCount ?? 0}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingLg" as="h4" alignment="center">
                Tracking Count
              </Text>
              <Text variant="heading3xl" as="h1" alignment="center">
                {trackingCount ?? 0}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingLg" as="h4" alignment="center">
                Inventory Count
              </Text>
              <Text variant="heading3xl" as="h1" alignment="center">
                {inventoryCount ?? 0}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>
        <Card>
          <EmptyState
            heading="Unlock the full potential of your Shopify store with Commercive!"
            action={{
              content: "Start managing",
              onAction: () => {
                window.open(
                  "https://dashboard.commercive.co",
                  "_blank",
                  "noopener,noreferrer",
                );
              },
            }}
            secondaryAction={{
              content: "Learn more",
              url: "https://commercive.co",
              external: true,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Our app seamlessly integrates with your Shopify account to help
              you manage orders, track shipments, and oversee your inventory
              efficiently.
            </p>
          </EmptyState>
        </Card>

        <p>
          Need help? <a href="mailto:support@commercive.co">Contact Support</a>
        </p>
      </BlockStack>
    </Page>
  );
}
