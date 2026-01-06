/**
 * Link User to Store Utility
 *
 * Handles linking an affiliate dashboard user account to an existing
 * Shopify store installation.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const ddbDocClient = DynamoDBDocumentClient.from(client);

export interface LinkUserToStoreParams {
  userId: string;
  shopDomain: string;
  accessToken?: string;
}

export interface LinkUserToStoreResult {
  success: boolean;
  message: string;
  userId?: string;
  storeId?: string;
}

/**
 * Link a user account to an existing Shopify store
 *
 * This function:
 * 1. Uses user_id directly (no email lookup needed)
 * 2. Finds store by shop_domain in commercive_stores
 * 3. Creates a link in commercive_store_users
 * 4. Handles duplicate link prevention
 *
 * Updated 2026-01-06: Uses user_id instead of email for shop_handle-based matching
 */
export async function linkUserToStore(
  params: LinkUserToStoreParams
): Promise<LinkUserToStoreResult> {
  const { userId, shopDomain } = params;

  try {
    console.log(`[linkUserToStore] Linking user ${userId} to ${shopDomain}`);

    // Validate userId is provided
    if (!userId) {
      return {
        success: false,
        message: 'User ID is required to link your account.',
      };
    }

    // Step 1: Find store by shop_domain
    const storeQuery = new QueryCommand({
      TableName: 'commercive_stores',
      IndexName: 'domain-index',
      KeyConditionExpression: 'shop_domain = :domain',
      ExpressionAttributeValues: {
        ':domain': shopDomain,
      },
    });

    const storeResult = await ddbDocClient.send(storeQuery);
    const stores = storeResult.Items || [];

    if (stores.length === 0) {
      return {
        success: false,
        message:
          'Store not found in our system. Please ensure the Shopify app is installed first.',
      };
    }

    const store = stores[0];
    console.log(`[linkUserToStore] Found store: ${store.store_id}`);

    // Step 2: Check if link already exists
    const existingLinksQuery = new QueryCommand({
      TableName: 'commercive_store_users',
      IndexName: 'user-stores-index',
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    const linksResult = await ddbDocClient.send(existingLinksQuery);
    const existingLinks = linksResult.Items || [];

    // Check if this specific store is already linked
    const alreadyLinked = existingLinks.some(
      (link) => link.store_id === store.store_id
    );

    if (alreadyLinked) {
      console.log(
        `[linkUserToStore] Account already linked to store ${store.store_id}`
      );
      return {
        success: true,
        message: 'Your account is already linked to this store.',
        userId: userId,
        storeId: store.store_id,
      };
    }

    // Step 3: Create store-user link
    const linkId = `${userId}_${store.store_id}`;
    const now = new Date().toISOString();

    const linkData = {
      link_id: linkId,
      user_id: userId,
      store_id: store.store_id,
      role: 'owner', // User who links is the owner
      created_at: now,
    };

    const putCommand = new PutCommand({
      TableName: 'commercive_store_users',
      Item: linkData,
    });

    await ddbDocClient.send(putCommand);

    console.log(
      `[linkUserToStore] Successfully linked user ${userId} to store ${store.store_id}`
    );

    return {
      success: true,
      message: 'Store linked successfully to your account!',
      userId: userId,
      storeId: store.store_id,
    };
  } catch (error) {
    console.error('[linkUserToStore] Error:', error);

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while linking your account.',
    };
  }
}
