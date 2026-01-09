/**
 * Direct DynamoDB Store Creation
 *
 * This is a fallback that writes directly to DynamoDB if Lambda fails.
 * Used when Lambda URL is misconfigured or Lambda is unavailable.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const TABLE_NAME = "commercive_stores";

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const docClient = DynamoDBDocumentClient.from(client);

interface CreateStoreParams {
  shopDomain: string;
  accessToken: string;
  email?: string;
  shopName?: string;
}

interface CreateStoreResult {
  success: boolean;
  storeId?: string;
  storeCode?: string;
  error?: string;
}

/**
 * Generate an 8-character store code
 */
function generateStoreCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Extract shop handle from domain
 */
function extractShopHandle(shopDomain: string): string {
  const domain = shopDomain
    .replace("https://", "")
    .replace("http://", "")
    .replace(/\/$/, "");

  if (domain.includes(".myshopify.com")) {
    return domain.split(".myshopify.com")[0].toLowerCase();
  }

  return domain.split(".")[0].toLowerCase();
}

/**
 * Find existing store by shop_handle
 */
async function findExistingStore(shopHandle: string): Promise<any | null> {
  try {
    // Try GSI query first
    try {
      const queryResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "shop-handle-index",
          KeyConditionExpression: "shop_handle = :handle",
          ExpressionAttributeValues: {
            ":handle": shopHandle,
          },
          Limit: 1,
        })
      );

      if (queryResult.Items && queryResult.Items.length > 0) {
        return queryResult.Items[0];
      }
    } catch (gsiError) {
      console.log("[createStoreDirect] GSI query failed, trying scan");
    }

    // Fallback to scan
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "shop_handle = :handle",
        ExpressionAttributeValues: {
          ":handle": shopHandle,
        },
        Limit: 1,
      })
    );

    if (scanResult.Items && scanResult.Items.length > 0) {
      return scanResult.Items[0];
    }

    return null;
  } catch (error) {
    console.error("[createStoreDirect] Error finding existing store:", error);
    return null;
  }
}

/**
 * Create or update store directly in DynamoDB
 */
export async function createStoreDirectToDynamo(
  params: CreateStoreParams
): Promise<CreateStoreResult> {
  const { shopDomain, accessToken, email, shopName } = params;

  try {
    console.log(`[createStoreDirect] Starting direct DynamoDB write for: ${shopDomain}`);

    // Normalize domain and extract handle
    const normalizedDomain = shopDomain
      .replace("https://", "")
      .replace("http://", "")
      .replace(/\/$/, "");
    const shopHandle = extractShopHandle(normalizedDomain);

    console.log(`[createStoreDirect] Shop handle: ${shopHandle}`);

    // Check for existing store
    const existingStore = await findExistingStore(shopHandle);

    const now = new Date().toISOString();

    if (existingStore) {
      console.log(`[createStoreDirect] Store exists, updating: ${existingStore.store_id}`);

      // Update existing store - we can't use UpdateCommand easily, so we'll put with all fields
      const updatedStore = {
        ...existingStore,
        shop_domain: normalizedDomain,
        shop_name: shopName || existingStore.shop_name,
        shop_email: email || existingStore.shop_email,
        access_token: accessToken,
        is_active: true,
        updated_at: now,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: updatedStore,
        })
      );

      console.log(`[createStoreDirect] Store updated successfully`);

      return {
        success: true,
        storeId: existingStore.store_id,
        storeCode: existingStore.store_code,
      };
    }

    // Create new store
    const storeId = uuidv4();
    const storeCode = generateStoreCode();

    console.log(`[createStoreDirect] Creating new store: ${storeId}, code: ${storeCode}`);

    const newStore = {
      store_id: storeId,
      shop_domain: normalizedDomain,
      shop_handle: shopHandle,
      shop_name: shopName || normalizedDomain.split(".")[0],
      shop_email: email || "",
      access_token: accessToken,
      store_code: storeCode,
      is_active: true,
      is_linked_to_affiliate: false,
      linked_affiliate_id: null,
      webhooks_registered: false,
      inventory_synced_at: null,
      created_at: now,
      updated_at: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: newStore,
      })
    );

    console.log(`[createStoreDirect] Store created successfully in DynamoDB`);

    return {
      success: true,
      storeId: storeId,
      storeCode: storeCode,
    };
  } catch (error: any) {
    console.error("[createStoreDirect] Error:", error);
    return {
      success: false,
      error: error.message || "DynamoDB write failed",
    };
  }
}
