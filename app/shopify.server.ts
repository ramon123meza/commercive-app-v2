import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

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
  sessionStorage: new PrismaSessionStorage(prisma),
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
    // Order webhooks - need both CREATE and UPDATED for real-time sync
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    ORDERS_UPDATED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // INVENTORY LEVELS webhooks - these fire when QUANTITIES change (available, committed, on_hand)
    // This is the CRITICAL webhook for real-time inventory quantity updates!
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
    // INVENTORY ITEMS webhooks - these fire when item metadata changes (SKU, cost, etc.)
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
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log("webhooks is regirsteed..");
      shopify.registerWebhooks({ session });

      // FIX Issue 19: Auto-create dashboard user when merchant installs app
      try {
        // Import the utility function
        const { createDashboardUser } = await import("./utils/createDashboardUser");

        // Fetch shop details from Shopify to get owner email and name
        const shopResponse = await admin.rest.resources.Shop.all({
          session: session,
        });

        const shop = shopResponse.data?.[0];
        const shopEmail = shop?.email || shop?.shop_owner || undefined;
        const shopName = shop?.name || session.shop.split(".")[0];

        console.log(`[afterAuth] Creating dashboard user for ${session.shop}`);

        // Create dashboard user automatically
        const result = await createDashboardUser({
          shopDomain: session.shop,
          email: shopEmail,
          shopName: shopName,
        });

        if (result.success) {
          console.log(`[afterAuth] Dashboard user created successfully`, result);
        } else {
          console.error(`[afterAuth] Dashboard user creation failed:`, result.error);
        }
      } catch (error) {
        // Non-blocking error - merchant can still use Shopify app
        console.error(`[afterAuth] Error in createDashboardUser:`, error);
      }
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
