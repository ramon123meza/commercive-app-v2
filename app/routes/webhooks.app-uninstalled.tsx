/**
 * App Uninstall Webhook Handler
 *
 * Cleans up Shopify sessions when merchant uninstalls the app.
 * Store data in DynamoDB remains accessible via dashboard.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  console.log(`[AppUninstalled] Cleaning up sessions for ${shop}`);

  try {
    // Delete all sessions for this shop from Prisma
    await db.session.deleteMany({
      where: { shop },
    });

    console.log(`[AppUninstalled] Sessions deleted for ${shop}`);

    // Note: We do NOT delete store data from DynamoDB
    // Users can still access their dashboard and reconnect later

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error(`[AppUninstalled] Error:`, error);
    return new Response("Error", { status: 500 });
  }
};
