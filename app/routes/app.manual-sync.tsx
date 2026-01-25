/**
 * Manual Sync Route
 *
 * Allows manually triggering fulfillment sync for stores that were
 * installed before this fix was deployed. This backfills tracking data
 * for historical orders.
 *
 * Usage: Navigate to /app/manual-sync in your browser
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { syncInitialFulfillments } from "~/utils/syncInitialFulfillments";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  console.log(`[app.manual-sync] Starting manual fulfillment sync for: ${session.shop}`);

  let result = {
    shop: session.shop,
    fulfillments: 0,
    success: false,
    error: null as string | null,
  };

  try {
    const fulfillmentsCount = await syncInitialFulfillments(session as any, admin);
    result.fulfillments = fulfillmentsCount;
    result.success = true;
    console.log(`[app.manual-sync] ✓ Sync complete: ${fulfillmentsCount} tracking records created`);
  } catch (error) {
    console.error(`[app.manual-sync] Sync failed:`, error);
    result.error = error instanceof Error ? error.message : 'Sync failed';
  }

  return json(result);
};

export default function ManualSync() {
  const data = useLoaderData<typeof loader>();

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Manual Fulfillment Sync</h1>

      <div style={{
        marginTop: '24px',
        padding: '20px',
        backgroundColor: data.success ? '#d4edda' : '#f8d7da',
        border: `1px solid ${data.success ? '#c3e6cb' : '#f5c6cb'}`,
        borderRadius: '4px',
        color: data.success ? '#155724' : '#721c24'
      }}>
        {data.success ? (
          <>
            <h2 style={{ marginTop: 0 }}>✓ Sync Successful</h2>
            <p>
              <strong>Store:</strong> {data.shop}<br />
              <strong>Tracking Records Created:</strong> {data.fulfillments}
            </p>
            <p style={{ marginTop: '16px', fontSize: '14px' }}>
              Historical fulfillments have been synced to DynamoDB.
              You can now see tracking data for orders that were fulfilled
              before the app was installed.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>✗ Sync Failed</h2>
            <p>
              <strong>Store:</strong> {data.shop}<br />
              <strong>Error:</strong> {data.error}
            </p>
          </>
        )}
      </div>

      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h3>What This Does</h3>
        <p>This sync fetches all fulfilled orders from Shopify and creates tracking records for them.</p>

        <h3>When To Use This</h3>
        <ul>
          <li>Your store was installed before the fulfillment sync fix was deployed</li>
          <li>You have orders showing as "fulfilled" but no tracking data</li>
          <li>Dashboard shows fewer trackings than Shopify</li>
        </ul>

        <h3>How It Works</h3>
        <ol>
          <li>Fetches all orders with fulfillment_status="fulfilled" from Shopify</li>
          <li>Extracts tracking information from each fulfillment</li>
          <li>Creates tracking records in DynamoDB</li>
          <li>Same process as real-time webhooks, but for historical data</li>
        </ol>

        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107' }}>
          <strong>Note:</strong> This is safe to run multiple times. Duplicate tracking records
          will be skipped by the Lambda function.
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <a
          href="/app"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#008060',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: '500'
          }}
        >
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
