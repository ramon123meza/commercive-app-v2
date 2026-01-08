import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { DynamoDBSessionStorage } from "@shopify/shopify-app-session-storage-dynamodb";
import dynamoDb from "./db.server";

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
  sessionStorage: new DynamoDBSessionStorage({
    sessionTableName: "commercive_shopify_sessions",
    config: {
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    },
  }),
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
      console.log("[afterAuth] Registering webhooks...");
      shopify.registerWebhooks({ session });

      // Create store record with store code (NO auto user creation)
      // Users must sign up manually on the affiliate dashboard
      try {
        const { createStoreOnly } = await import("./utils/createStoreOnly");

        // Fetch shop details from Shopify to get owner email and name
        const shopResponse = await admin.rest.resources.Shop.all({
          session: session,
        });

        const shop = shopResponse.data?.[0];
        const shopEmail = shop?.email || shop?.shop_owner || undefined;
        const shopName = shop?.name || session.shop.split(".")[0];

        console.log(`[afterAuth] Creating/updating store record for ${session.shop}`);

        // Create store record with store code (no user account created)
        const result = await createStoreOnly({
          shopDomain: session.shop,
          accessToken: session.accessToken!,
          email: shopEmail,
          shopName: shopName,
        });

        if (result.success) {
          console.log(`[afterAuth] Store created with code: ${result.storeCode}`);
        } else {
          console.error(`[afterAuth] Store creation failed:`, result.error);
        }
      } catch (error) {
        // Non-blocking error - merchant can still use Shopify app
        console.error(`[afterAuth] Error creating store record:`, error);
      }

      // Sync initial inventory in background (non-blocking)
      (async () => {
        try {
          const { syncInitialInventory } = await import(
            "./utils/syncInitialInventory"
          );
          console.log(`[afterAuth] Starting initial inventory sync for ${session.shop}`);
          const count = await syncInitialInventory(session, admin);
          console.log(`[afterAuth] Initial sync complete: ${count} items`);
        } catch (error) {
          console.error(`[afterAuth] Error syncing initial inventory:`, error);
        }
      })();
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
