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
  email: string;
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
 * 1. Finds user by email in commercive_users
 * 2. Finds store by shop_domain in commercive_stores
 * 3. Creates a link in commercive_store_users
 * 4. Handles duplicate link prevention
 */
export async function linkUserToStore(
  params: LinkUserToStoreParams
): Promise<LinkUserToStoreResult> {
  const { email, shopDomain, accessToken } = params;

  try {
    console.log(`[linkUserToStore] Linking ${email} to ${shopDomain}`);

    // Step 1: Find user by email
    const userQuery = new QueryCommand({
      TableName: 'commercive_users',
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase(),
      },
    });

    const userResult = await ddbDocClient.send(userQuery);
    const users = userResult.Items || [];

    if (users.length === 0) {
      return {
        success: false,
        message:
          'No account found with that email. Please create an account in the affiliate dashboard first.',
      };
    }

    const user = users[0];
    console.log(`[linkUserToStore] Found user: ${user.user_id}`);

    // Step 2: Find store by shop_domain
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

    // Step 3: Check if link already exists
    const existingLinksQuery = new QueryCommand({
      TableName: 'commercive_store_users',
      IndexName: 'user-stores-index',
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': user.user_id,
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
        userId: user.user_id,
        storeId: store.store_id,
      };
    }

    // Step 4: Create store-user link
    const linkId = `${user.user_id}_${store.store_id}`;
    const now = new Date().toISOString();

    const linkData = {
      link_id: linkId,
      user_id: user.user_id,
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
      `[linkUserToStore] Successfully linked user ${user.user_id} to store ${store.store_id}`
    );

    return {
      success: true,
      message: 'Store linked successfully to your account!',
      userId: user.user_id,
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
