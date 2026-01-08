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
  Link,
} from "@shopify/polaris";
import { ClipboardIcon, ExternalIcon } from "@shopify/polaris-icons";
import { DASHBOARD_URLS } from "~/config/lambda.server";
import { getStore } from "~/utils/lambdaClient";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await getStore(session.shop);

  return json({
    shop: session.shop,
    shopName: session.shop.split(".")[0],
    storeCode: store?.store_code || null,
    isLinked: store?.is_linked_to_affiliate || false,
    dashboardUrl: DASHBOARD_URLS.affiliate || "https://main.d17uirvlkd5qgw.amplifyapp.com",
  });
};

export default function Index() {
  const { shop, shopName, storeCode, isLinked, dashboardUrl } =
    useLoaderData<typeof loader>();

  const copyToClipboard = () => {
    if (storeCode) {
      navigator.clipboard.writeText(storeCode);
      shopify.toast.show("Store code copied to clipboard!");
    }
  };

  return (
    <Page title="Commercive">
      <BlockStack gap="500">
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
                  Store code not yet generated. Please refresh this page or
                  reinstall the app if this persists.
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
                  url={`${dashboardUrl}/signup`}
                  external
                  variant="primary"
                  icon={ExternalIcon}
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
                  url={`${dashboardUrl}/login`}
                  external
                  variant="secondary"
                  icon={ExternalIcon}
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
              <Button url={`${dashboardUrl}/support`} external>
                Support Center
              </Button>
              <Button url="mailto:support@commercive.co" external>
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
      </BlockStack>
    </Page>
  );
}
