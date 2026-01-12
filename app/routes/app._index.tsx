/**
 * Main Shopify App Dashboard
 *
 * Clean interface showing:
 * 1. Store Code prominently displayed (for linking to affiliate dashboard)
 * 2. Instructions for users who don't have an account
 * 3. Links to external affiliate dashboard (NOT embedded)
 *
 * Users must sign up manually on the affiliate dashboard and wait for
 * admin approval before they can link their store using the store code.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  List,
  Divider,
} from "@shopify/polaris";
import { ClipboardIcon } from "@shopify/polaris-icons";
import { DASHBOARD_URLS } from "~/config/lambda.server";
import { getStore, isInventoryFetched, setInventoryFetched } from "~/utils/lambdaClient";
import { syncInitialInventory } from "~/utils/syncInitialInventory";
import { syncInitialOrders } from "~/utils/syncInitialOrders";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  console.log(`[app._index] Loading store data for: ${session.shop}`);

  let store = null;
  let storeCode = null;
  let isLinked = false;
  let syncStatus = { inventory: 0, orders: 0, error: null as string | null };

  try {
    store = await getStore(session.shop);
    console.log(`[app._index] Store data retrieved:`, store ? 'found' : 'not found');
    if (store) {
      console.log(`[app._index] Store code: ${store.store_code || 'none'}`);
      storeCode = store.store_code || null;
      isLinked = store.is_linked_to_affiliate || false;
    }
  } catch (error) {
    console.error(`[app._index] Error fetching store:`, error);
  }

  // CRITICAL FIX: Sync inventory and orders on first load (like old version)
  // This runs in the loader (blocking) instead of afterAuth (background)
  // to ensure it completes in serverless environments
  try {
    const alreadySynced = await isInventoryFetched(session.shop);
    console.log(`[app._index] Inventory already synced: ${alreadySynced}`);

    if (!alreadySynced) {
      console.log(`[app._index] Starting initial sync for ${session.shop}`);

      // Sync inventory (blocking)
      try {
        const inventoryCount = await syncInitialInventory(session, admin);
        syncStatus.inventory = inventoryCount;
        console.log(`[app._index] ✓ Inventory sync complete: ${inventoryCount} items`);

        // Mark as synced to prevent re-sync on next page load
        await setInventoryFetched(session.shop, true);
      } catch (invError) {
        console.error(`[app._index] Inventory sync failed:`, invError);
        syncStatus.error = invError instanceof Error ? invError.message : 'Inventory sync failed';
      }

      // Sync orders (blocking)
      try {
        const ordersCount = await syncInitialOrders(session, admin);
        syncStatus.orders = ordersCount;
        console.log(`[app._index] ✓ Orders sync complete: ${ordersCount} orders`);
      } catch (ordError) {
        console.error(`[app._index] Orders sync failed:`, ordError);
        if (!syncStatus.error) {
          syncStatus.error = ordError instanceof Error ? ordError.message : 'Orders sync failed';
        }
      }
    } else {
      console.log(`[app._index] Skipping sync - inventory already fetched`);
    }
  } catch (syncCheckError) {
    console.error(`[app._index] Error checking sync status:`, syncCheckError);
  }

  // Use environment variable for dashboard URL
  const dashboardUrl = DASHBOARD_URLS.affiliate || process.env.AFFILIATE_DASHBOARD_URL || "https://main.d17uirvlkd5qgw.amplifyapp.com";

  console.log(`[app._index] Dashboard URL: ${dashboardUrl}`);

  return json({
    shop: session.shop,
    shopName: session.shop.split(".")[0],
    storeCode,
    isLinked,
    dashboardUrl,
    syncStatus,
  });
};

export default function Index() {
  const { shop, shopName, storeCode, isLinked, dashboardUrl, syncStatus } =
    useLoaderData<typeof loader>();

  const copyToClipboard = () => {
    if (storeCode) {
      navigator.clipboard.writeText(storeCode);
      shopify.toast.show("Store code copied to clipboard!");
    }
  };

  // Function to open external URLs properly (breaks out of iframe)
  const openExternal = (url: string) => {
    // Use window.open with _top to break out of Shopify iframe
    window.open(url, "_top");
  };

  return (
    <Page title="Commercive">
      <BlockStack gap="500">
        {/* Sync Status Banner */}
        {syncStatus && (syncStatus.inventory > 0 || syncStatus.orders > 0) && (
          <Banner tone="success">
            <p>
              <strong>Initial Sync Complete!</strong> Synced {syncStatus.inventory} inventory items and {syncStatus.orders} orders.
            </p>
          </Banner>
        )}
        {syncStatus && syncStatus.error && (
          <Banner tone="warning">
            <p>
              <strong>Sync Warning:</strong> {syncStatus.error}. Inventory will sync via webhooks going forward.
            </p>
          </Banner>
        )}

        {/* Welcome Banner */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Welcome to Commercive, {shopName}!
            </Text>
            <Text as="p" tone="subdued">
              Your Shopify store <strong>{shop}</strong> has been registered
              with Commercive. Use your Store Code below to link this store to
              your affiliate dashboard account.
            </Text>
          </BlockStack>
        </Card>

        {/* Store Code Card - Primary Focus */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Your Store Code
            </Text>

            {storeCode ? (
              <BlockStack gap="400">
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderRadius="200"
                >
                  <InlineStack gap="400" align="center" blockAlign="center">
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      {storeCode}
                    </Text>
                    <Button
                      icon={ClipboardIcon}
                      onClick={copyToClipboard}
                      variant="primary"
                    >
                      Copy Code
                    </Button>
                  </InlineStack>
                </Box>

                <Banner tone="info">
                  <p>
                    Use this code in the Commercive dashboard to link your
                    store. Each store can only be linked to one account.
                  </p>
                </Banner>
              </BlockStack>
            ) : (
              <Banner tone="warning">
                <p>
                  Store code not yet generated. Please refresh this page. If the issue persists,
                  try reinstalling the app or contact support.
                </p>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Instructions Card */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              How to Connect Your Store
            </Text>

            <Divider />

            {/* If user doesn't have an account */}
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                New to Commercive?
              </Text>
              <List type="number">
                <List.Item>
                  Go to the Commercive Dashboard and create a new account
                </List.Item>
                <List.Item>
                  Wait for an admin to approve your account as a Store Owner
                </List.Item>
                <List.Item>
                  Once approved, navigate to "Stores" in your dashboard
                </List.Item>
                <List.Item>
                  Click "Connect Store" and enter your Store Code:{" "}
                  <strong>{storeCode || "XXXXXXXX"}</strong>
                </List.Item>
              </List>
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={() => openExternal(`${dashboardUrl}/signup`)}
                >
                  Create Account
                </Button>
              </InlineStack>
            </BlockStack>

            <Divider />

            {/* If user already has an account */}
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Already have an account?
              </Text>
              <List type="number">
                <List.Item>Copy your Store Code above</List.Item>
                <List.Item>
                  Log in to your Commercive Dashboard
                </List.Item>
                <List.Item>
                  Go to "Stores" and click "Connect Store"
                </List.Item>
                <List.Item>
                  Paste your Store Code and click "Link Store"
                </List.Item>
              </List>
              <InlineStack gap="300">
                <Button
                  variant="secondary"
                  onClick={() => openExternal(`${dashboardUrl}/login`)}
                >
                  Log In to Dashboard
                </Button>
              </InlineStack>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Features Card */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              What You Get with Commercive
            </Text>

            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-success"
                  padding="100"
                  borderRadius="100"
                >
                  <Text as="span" variant="bodySm" tone="success">
                    ✓
                  </Text>
                </Box>
                <Text as="p">
                  <strong>Real-time Inventory Sync</strong> - Your inventory
                  levels are automatically synced via webhooks
                </Text>
              </InlineStack>

              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-success"
                  padding="100"
                  borderRadius="100"
                >
                  <Text as="span" variant="bodySm" tone="success">
                    ✓
                  </Text>
                </Box>
                <Text as="p">
                  <strong>Order Tracking</strong> - View and manage all your
                  orders in one place
                </Text>
              </InlineStack>

              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-success"
                  padding="100"
                  borderRadius="100"
                >
                  <Text as="span" variant="bodySm" tone="success">
                    ✓
                  </Text>
                </Box>
                <Text as="p">
                  <strong>Restock Recommendations</strong> - AI-powered
                  suggestions for when to reorder inventory
                </Text>
              </InlineStack>

              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-success"
                  padding="100"
                  borderRadius="100"
                >
                  <Text as="span" variant="bodySm" tone="success">
                    ✓
                  </Text>
                </Box>
                <Text as="p">
                  <strong>Analytics Dashboard</strong> - Comprehensive insights
                  into your store performance
                </Text>
              </InlineStack>

              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-success"
                  padding="100"
                  borderRadius="100"
                >
                  <Text as="span" variant="bodySm" tone="success">
                    ✓
                  </Text>
                </Box>
                <Text as="p">
                  <strong>Affiliate Program</strong> - Generate tracking links
                  and earn commissions
                </Text>
              </InlineStack>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Help Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Need Help?
            </Text>
            <Text as="p" tone="subdued">
              If you have questions about connecting your store or using
              Commercive, visit our support page or contact our team.
            </Text>
            <InlineStack gap="300">
              <Button onClick={() => openExternal(`${dashboardUrl}/support`)}>
                Support Center
              </Button>
              <Button onClick={() => openExternal("mailto:support@commercive.co")}>
                Contact Support
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Store Status */}
        {isLinked && (
          <Banner tone="success">
            <p>
              <strong>Store Connected!</strong> This store is linked to your
              Commercive account. Visit your dashboard to access all features.
            </p>
          </Banner>
        )}

        {/* Debug info - remove in production */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" tone="subdued">
              Debug Info (Remove in production)
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Shop: {shop}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Store Code: {storeCode || "Not generated"}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Dashboard URL: {dashboardUrl}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
