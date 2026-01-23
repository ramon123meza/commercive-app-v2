import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { DynamoDBSessionStorage } from "@shopify/shopify-app-session-storage-dynamodb";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October24,
  scopes: [
    "write_products",
    "read_products",
    "read_orders",
    "write_orders",
    "read_fulfillments",
    "write_fulfillments",
    "read_inventory",
    "write_inventory",
    "read_locations",
  ],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // Cast to any due to version mismatch between @shopify/shopify-api packages
  sessionStorage: new DynamoDBSessionStorage({
    sessionTableName: "commercive_shopify_sessions",
    shopIndexName: "shop-index",
    config: {
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    },
  }) as any,
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  webhooks: {
    // Fulfillment webhooks
    FULFILLMENTS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    FULFILLMENTS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // Order webhooks - both CREATE and UPDATED for real-time sync
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    ORDERS_UPDATED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // NEW: Order payment webhook - Critical for 48h SLA tracking
    ORDERS_PAID: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // NEW: Order cancellation webhook
    ORDERS_CANCELLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // INVENTORY LEVELS webhooks - fire when QUANTITIES change
    INVENTORY_LEVELS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    INVENTORY_LEVELS_CONNECT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    INVENTORY_LEVELS_DISCONNECT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // INVENTORY ITEMS webhooks - fire when item metadata changes
    INVENTORY_ITEMS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    INVENTORY_ITEMS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    INVENTORY_ITEMS_DELETE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // Product webhooks for keeping product catalog in sync
    PRODUCTS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    PRODUCTS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    PRODUCTS_DELETE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // App uninstall webhook
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app-uninstalled",
    },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log("[afterAuth] ====== STARTING afterAuth HOOK ======");
      console.log(`[afterAuth] Shop: ${session.shop}`);
      console.log(`[afterAuth] Access Token exists: ${!!session.accessToken}`);

      // Register webhooks
      try {
        console.log("[afterAuth] Registering webhooks...");
        await shopify.registerWebhooks({ session });
        console.log("[afterAuth] Webhooks registered successfully");
      } catch (webhookError) {
        console.error("[afterAuth] Webhook registration failed:", webhookError);
      }

      // Create store record with store code (NO auto user creation)
      // Users must sign up manually on the affiliate dashboard
      try {
        console.log("[afterAuth] Starting store creation process...");

        // Fetch shop details using GraphQL (REST is disabled with removeRest: true)
        let shopEmail = "";
        let shopName = session.shop.split(".")[0];

        try {
          console.log("[afterAuth] Fetching shop details via GraphQL...");
          const shopResponse = await admin.graphql(
            `#graphql
              query {
                shop {
                  name
                  email
                  myshopifyDomain
                }
              }
            `
          );
          const shopData = await shopResponse.json();
          console.log("[afterAuth] GraphQL shop response:", JSON.stringify(shopData));

          if (shopData?.data?.shop) {
            shopEmail = shopData.data.shop.email || "";
            shopName = shopData.data.shop.name || shopName;
          }
        } catch (graphqlError) {
          console.error("[afterAuth] GraphQL shop query failed:", graphqlError);
          // Continue with defaults - shop creation should still work
        }

        console.log(`[afterAuth] Shop details - name: ${shopName}, email: ${shopEmail}`);

        // Import and call createStoreOnly
        const { createStoreOnly } = await import("./utils/createStoreOnly");
        console.log("[afterAuth] createStoreOnly imported successfully");

        console.log(`[afterAuth] Calling createStoreOnly for ${session.shop}`);
        const result = await createStoreOnly({
          shopDomain: session.shop,
          accessToken: session.accessToken!,
          email: shopEmail,
          shopName: shopName,
        });

        console.log("[afterAuth] createStoreOnly result:", JSON.stringify(result));

        if (result.success) {
          console.log(`[afterAuth] SUCCESS: Store created with code: ${result.storeCode}`);
        } else {
          console.error(`[afterAuth] FAILED: Store creation failed:`, result.error);

          // Fallback: Try direct DynamoDB write if Lambda failed
          console.log("[afterAuth] Attempting direct DynamoDB fallback...");
          try {
            const { createStoreDirectToDynamo } = await import("./utils/createStoreDirect");
            const fallbackResult = await createStoreDirectToDynamo({
              shopDomain: session.shop,
              accessToken: session.accessToken!,
              email: shopEmail,
              shopName: shopName,
            });
            console.log("[afterAuth] DynamoDB fallback result:", JSON.stringify(fallbackResult));
          } catch (fallbackError) {
            console.error("[afterAuth] DynamoDB fallback also failed:", fallbackError);
          }
        }
      } catch (error) {
        console.error(`[afterAuth] CRITICAL ERROR in store creation:`, error);

        // Try fallback even on exception
        try {
          console.log("[afterAuth] Attempting emergency DynamoDB fallback...");
          const { createStoreDirectToDynamo } = await import("./utils/createStoreDirect");
          const fallbackResult = await createStoreDirectToDynamo({
            shopDomain: session.shop,
            accessToken: session.accessToken!,
            email: "",
            shopName: session.shop.split(".")[0],
          });
          console.log("[afterAuth] Emergency fallback result:", JSON.stringify(fallbackResult));
        } catch (fallbackError) {
          console.error("[afterAuth] Emergency fallback failed:", fallbackError);
        }
      }

      console.log("[afterAuth] ====== afterAuth HOOK COMPLETE ======");
      console.log(`[afterAuth] Initial data sync will occur when user loads the app dashboard`);

      // NOTE: Initial sync has been moved to app._index loader to ensure
      // it completes in serverless environments. Background promises in
      // afterAuth get killed when the serverless function exits.
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
