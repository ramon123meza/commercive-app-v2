/**
 * App Uninstall Webhook Handler
 *
 * Cleans up Shopify sessions when merchant uninstalls the app.
 * Store data in DynamoDB remains accessible via dashboard.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  console.log(`[AppUninstalled] Cleaning up sessions for ${shop}`);

  try {
    // Delete the session from DynamoDB using Shopify's session storage
    if (session?.id) {
      await sessionStorage.deleteSession(session.id);
      console.log(`[AppUninstalled] Session deleted for ${shop}`);
    }

    // Note: We do NOT delete store data from DynamoDB
    // Users can still access their dashboard and reconnect later

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`[AppUninstalled] Error:`, error);
    return new Response("Error", { status: 500 });
  }
};
