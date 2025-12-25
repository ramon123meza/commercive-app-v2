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
import { Page, Card, Button, Text, BlockStack } from "@shopify/polaris";
import { DASHBOARD_URLS } from "~/config/lambda.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return json({
    shop: session.shop,
    shopName: session.shop.split('.')[0],
    dashboardUrl: DASHBOARD_URLS.affiliate || "#",
  });
};

export default function Index() {
  const { shop, shopName, dashboardUrl } = useLoaderData<typeof loader>();

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
