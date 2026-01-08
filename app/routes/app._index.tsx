/**
 * Main Shopify App Dashboard
 *
 * Simplified dashboard showing welcome message and link to full dashboard.
 * This keeps the Shopify app lightweight and fast.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Page, Card, Button, Text, BlockStack, InlineStack, Icon } from "@shopify/polaris";
import { ClipboardIcon } from "@shopify/polaris-icons";
import { DASHBOARD_URLS } from "~/config/lambda.server";
import { getStore } from "~/utils/lambdaClient";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await getStore(session.shop);

  return json({
    shop: session.shop,
    shopName: session.shop.split('.')[0],
    storeCode: store?.store_code || null,
    dashboardUrl: DASHBOARD_URLS.affiliate || "#",
  });
};

export default function Index() {
  const { shop, shopName, storeCode, dashboardUrl } = useLoaderData<typeof loader>();

  const copyToClipboard = () => {
    if (storeCode) {
      navigator.clipboard.writeText(storeCode);
      shopify.toast.show("Store code copied to clipboard!");
    }
  };

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
        {/* Store Code Card */}
        {storeCode && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Your Store Code
              </Text>
              <Text as="p">
                Use this code to link your store in the Commercive dashboard:
              </Text>
              <InlineStack gap="300" blockAlign="center">
                <Text as="p" variant="headingLg" fontWeight="bold">
                  {storeCode}
                </Text>
                <Button
                  icon={ClipboardIcon}
                  onClick={copyToClipboard}
                  accessibilityLabel="Copy store code"
                >
                  Copy Code
                </Button>
              </InlineStack>
              <Text as="p" tone="subdued">
                Go to the dashboard, navigate to Stores, and enter this code to connect your account.
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* Welcome Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Welcome to Commercive, {shopName}!
            </Text>
            <Text as="p">
              Your Shopify store <strong>{shop}</strong> is successfully connected to the Commercive platform.
            </Text>
            <Text as="p">
              Access your full dashboard for complete inventory management, order tracking, affiliate features, and analytics.
            </Text>
            <Button
              url={dashboardUrl}
              external
              variant="primary"
              size="large"
            >
              Open Full Dashboard →
            </Button>
          </BlockStack>
        </Card>

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
