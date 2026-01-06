/**
 * Store Linking Page
 *
 * Handles linking an affiliate dashboard user account to an existing
 * Shopify store installation. This page is shown when:
 * 1. User has already installed the app in Shopify
 * 2. User clicks "Connect Store" in the affiliate dashboard
 * 3. User needs to link their dashboard account to the installed app
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useActionData, Form, useNavigation } from '@remix-run/react';
import { authenticate } from '../shopify.server';
import { Page, Card, Button, Text, Banner, BlockStack, InlineStack } from '@shopify/polaris';
import { linkUserToStore } from '~/utils/linkUserToStore';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');

  return json({
    shop: session.shop,
    shopName: session.shop.split('.')[0],
    userId: userId || null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const userId = formData.get('user_id') as string;

  if (!userId) {
    return json(
      {
        success: false,
        error: 'User ID is required to link your account. Please access this page from the affiliate dashboard.',
      },
      { status: 400 }
    );
  }

  try {
    console.log(`[link-account] Attempting to link user ${userId} to ${session.shop}`);

    const result = await linkUserToStore({
      userId,
      shopDomain: session.shop,
      accessToken: session.accessToken,
    });

    if (!result.success) {
      return json(
        {
          success: false,
          error: result.message,
          errorCode: result.errorCode,
        },
        { status: 400 }
      );
    }

    return json({
      success: true,
      message: result.message,
      userId: result.userId,
      storeId: result.storeId,
    });
  } catch (error) {
    console.error('[link-account] Error:', error);

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while linking your account.',
      },
      { status: 500 }
    );
  }
};

export default function LinkAccount() {
  const { shop, shopName, userId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === 'submitting';

  return (
    <Page
      title="Link Your Account"
      backAction={{ url: '/app' }}
    >
      <BlockStack gap="500">
        {/* Success State */}
        {actionData?.success && (
          <Banner status="success" title="Account Linked Successfully!">
            <BlockStack gap="200">
              <Text as="p">
                Your Commercive dashboard account is now linked to this Shopify store.
              </Text>
              <Text as="p">
                You can now close this window and return to your affiliate dashboard to see your store data.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Error State - Account Not Approved */}
        {actionData?.success === false && actionData?.errorCode === 'ACCOUNT_NOT_APPROVED' && (
          <Banner status="warning" title="Account Pending Approval">
            <BlockStack gap="200">
              <Text as="p">{actionData.error}</Text>
              <Text as="p">
                Please wait for admin approval or contact support if you believe this is an error.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Error State - Not Store Owner */}
        {actionData?.success === false && actionData?.errorCode === 'NOT_STORE_OWNER' && (
          <Banner status="warning" title="Store Owner Permission Required">
            <BlockStack gap="200">
              <Text as="p">{actionData.error}</Text>
              <Text as="p">
                Only users with store owner permissions can connect a Shopify store. Please contact your admin to update your account permissions.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Error State - Already Has Store */}
        {actionData?.success === false && actionData?.errorCode === 'ALREADY_HAS_STORE' && (
          <Banner status="warning" title="Store Already Connected">
            <BlockStack gap="200">
              <Text as="p">{actionData.error}</Text>
              <Text as="p">
                To connect a different store, please disconnect your current store first from the affiliate dashboard.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Error State - Store Already Linked to Another Affiliate */}
        {actionData?.success === false && actionData?.errorCode === 'STORE_ALREADY_LINKED' && (
          <Banner status="critical" title="Store Unavailable">
            <BlockStack gap="200">
              <Text as="p">{actionData.error}</Text>
              <Text as="p">
                Each Shopify store can only be connected to one affiliate account.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Error State - Generic/Other Errors */}
        {actionData?.success === false && !['ACCOUNT_NOT_APPROVED', 'NOT_STORE_OWNER', 'ALREADY_HAS_STORE', 'STORE_ALREADY_LINKED'].includes(actionData?.errorCode || '') && (
          <Banner status="critical" title="Linking Failed">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}

        {/* Main Content - Only show if not yet linked */}
        {!actionData?.success && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Link Shopify Store to Dashboard
                </Text>
                <Text as="p">
                  Your store <strong>{shop}</strong> is already installed with the Commercive app.
                </Text>
                <Text as="p">
                  Click below to link this store to your Commercive dashboard account.
                </Text>
              </BlockStack>

              {!userId && (
                <Banner status="warning">
                  <Text as="p">
                    No account information was provided. Please make sure you're accessing this page from the "Connect Store" button in your affiliate dashboard.
                  </Text>
                </Banner>
              )}

              <Form method="post">
                <input type="hidden" name="user_id" value={userId || ''} />
                <InlineStack gap="300">
                  <Button
                    submit
                    variant="primary"
                    loading={isSubmitting}
                    disabled={!userId || isSubmitting}
                  >
                    {isSubmitting ? 'Linking Account...' : 'Link My Account'}
                  </Button>
                  <Button
                    url="/app"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                </InlineStack>
              </Form>

              <BlockStack gap="200">
                <Text as="h3" variant="headingS m">
                  What happens when I link my account?
                </Text>
                <ul style={{ paddingLeft: '20px' }}>
                  <li>
                    <Text as="p">
                      Your dashboard account will be connected to this Shopify store
                    </Text>
                  </li>
                  <li>
                    <Text as="p">
                      You'll be able to see this store's inventory, orders, and analytics in your dashboard
                    </Text>
                  </li>
                  <li>
                    <Text as="p">
                      Your store data will sync automatically in real-time
                    </Text>
                  </li>
                  <li>
                    <Text as="p">
                      You can manage multiple stores from a single dashboard account
                    </Text>
                  </li>
                </ul>
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* Instructions for Creating an Account */}
        {actionData?.error?.includes('No account found') && (
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Don't have an account yet?
              </Text>
              <Text as="p">
                You need to create an account in the Commercive affiliate dashboard first, then return here to link your store.
              </Text>
              <InlineStack gap="200">
                <Button
                  url={process.env.AFFILIATE_DASHBOARD_URL || 'https://dashboard.commercive.com'}
                  external
                  variant="primary"
                >
                  Create Dashboard Account
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
