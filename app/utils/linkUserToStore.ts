/**
 * Link User to Store Utility
 *
 * Handles linking an affiliate dashboard user account to a Shopify store.
 *
 * Updated 2026-01-06:
 * - Uses user_id instead of email for shop_handle-based matching
 * - Creates store record if it doesn't exist (for new installations)
 * - Validates user is approved as store_owner before linking
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

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
  errorCode?: string;
}

/**
 * Extract shop handle from Shopify domain
 * e.g., "mystore.myshopify.com" → "mystore"
 */
function extractShopHandle(shopDomain: string): string {
  if (!shopDomain) return '';
  const domain = shopDomain.replace('https://', '').replace('http://', '').trim();
  if (domain.includes('.myshopify.com')) {
    return domain.split('.myshopify.com')[0].toLowerCase();
  }
  return domain.split('.')[0].toLowerCase();
}

/**
 * Link a user account to an existing Shopify store
 *
 * This function:
 * 1. Validates user is approved as store_owner
 * 2. Finds or creates store by shop_domain
 * 3. Validates shop_handle is not already linked to another affiliate
 * 4. Creates a link in commercive_store_users
 * 5. Creates affiliate-store link if user has affiliate account
 *
 * Updated 2026-01-06: Uses user_id instead of email for shop_handle-based matching
 */
export async function linkUserToStore(
  params: LinkUserToStoreParams
): Promise<LinkUserToStoreResult> {
  const { userId, shopDomain, accessToken } = params;

  try {
    console.log(`[linkUserToStore] Linking user ${userId} to ${shopDomain}`);

    // Validate userId is provided
    if (!userId) {
      return {
        success: false,
        message: 'User ID is required to link your account.',
        errorCode: 'MISSING_USER_ID',
      };
    }

    // Step 1: Validate user exists and is approved as store_owner
    const userQuery = new GetCommand({
      TableName: 'commercive_users',
      Key: { user_id: userId },
    });

    const userResult = await ddbDocClient.send(userQuery);
    const user = userResult.Item;

    if (!user) {
      return {
        success: false,
        message: 'User account not found. Please contact support.',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    // Check if user is approved and has store_owner permission
    if (user.status !== 'active') {
      return {
        success: false,
        message: 'Your account is pending admin approval. Please wait for approval before connecting a store.',
        errorCode: 'ACCOUNT_NOT_APPROVED',
      };
    }

    if (!user.is_store_owner) {
      return {
        success: false,
        message: 'Your account is not approved as a store owner. Please contact admin to update your permissions.',
        errorCode: 'NOT_STORE_OWNER',
      };
    }

    // Extract shop_handle for matching
    const shopHandle = extractShopHandle(shopDomain);
    console.log(`[linkUserToStore] Shop handle: ${shopHandle}`);

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
    let stores = storeResult.Items || [];
    let store;

    if (stores.length === 0) {
      // Store doesn't exist - create it (app was just installed via OAuth)
      console.log(`[linkUserToStore] Store not found, creating new store record`);

      const storeId = uuidv4();
      const now = new Date().toISOString();

      store = {
        store_id: storeId,
        shop_domain: shopDomain,
        shop_handle: shopHandle,
        shop_name: shopHandle,
        access_token: accessToken || '',
        is_active: true,
        is_linked_to_affiliate: false,
        linked_affiliate_id: null,
        webhooks_registered: false,
        inventory_synced_at: null,
        created_at: now,
        updated_at: now,
      };

      const putStoreCommand = new PutCommand({
        TableName: 'commercive_stores',
        Item: store,
      });

      await ddbDocClient.send(putStoreCommand);
      console.log(`[linkUserToStore] Created store: ${storeId}`);
    } else {
      store = stores[0];
      console.log(`[linkUserToStore] Found existing store: ${store.store_id}`);

      // Update access token if provided
      if (accessToken && accessToken !== store.access_token) {
        const updateStoreCommand = new UpdateCommand({
          TableName: 'commercive_stores',
          Key: { store_id: store.store_id },
          UpdateExpression: 'SET access_token = :token, updated_at = :now',
          ExpressionAttributeValues: {
            ':token': accessToken,
            ':now': new Date().toISOString(),
          },
        });
        await ddbDocClient.send(updateStoreCommand);
        console.log(`[linkUserToStore] Updated store access token`);
      }
    }

    // Step 3: Check if store is already linked to a DIFFERENT affiliate
    if (store.is_linked_to_affiliate && store.linked_affiliate_id) {
      // Get the affiliate linked to this store
      const affiliateQuery = new GetCommand({
        TableName: 'commercive_affiliates',
        Key: { affiliate_id: store.linked_affiliate_id },
      });

      const affiliateResult = await ddbDocClient.send(affiliateQuery);
      const linkedAffiliate = affiliateResult.Item;

      if (linkedAffiliate && linkedAffiliate.user_id !== userId) {
        return {
          success: false,
          message: `This store is already connected to another affiliate account. If you believe this is an error, please contact support.`,
          errorCode: 'STORE_ALREADY_LINKED',
        };
      }
    }

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
      (link) => (link as { store_id: string }).store_id === store.store_id
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

    // Step 4: Check if user already has a store linked (affiliates can only have ONE store)
    if (existingLinks.length > 0) {
      const existingStoreId = existingLinks[0].store_id;
      return {
        success: false,
        message: `You already have a store connected to your account. Affiliates can only connect one store. Please disconnect your current store first if you want to connect a different one.`,
        errorCode: 'ALREADY_HAS_STORE',
        storeId: existingStoreId,
      };
    }

    // Step 5: Create store-user link
    const linkId = `${userId}_${store.store_id}`;
    const now = new Date().toISOString();

    const linkData = {
      link_id: linkId,
      user_id: userId,
      store_id: store.store_id,
      is_owner: true,
      role: 'owner',
      created_at: now,
    };

    const putCommand = new PutCommand({
      TableName: 'commercive_store_users',
      Item: linkData,
    });

    await ddbDocClient.send(putCommand);
    console.log(`[linkUserToStore] Created store-user link: ${linkId}`);

    // Step 6: Check if user has an affiliate account and create affiliate-store link
    const affiliateQuery = new QueryCommand({
      TableName: 'commercive_affiliates',
      IndexName: 'user-affiliate-index',
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    const affiliateResult = await ddbDocClient.send(affiliateQuery);
    const affiliates = affiliateResult.Items || [];

    if (affiliates.length > 0) {
      const affiliate = affiliates[0];
      const affiliateLinkId = uuidv4();

      // Create affiliate-store link
      const affiliateLinkData = {
        link_id: affiliateLinkId,
        affiliate_id: affiliate.affiliate_id,
        user_id: userId,
        store_id: store.store_id,
        shop_handle: shopHandle,
        shop_domain: shopDomain,
        shop_name: store.shop_name || shopHandle,
        linked_at: now,
        linked_by: null, // Auto-linked by user
        is_active: true,
        unlinked_at: null,
        unlinked_reason: null,
        unlinked_by: null,
      };

      const putAffiliateLinkCommand = new PutCommand({
        TableName: 'commercive_affiliate_stores',
        Item: affiliateLinkData,
      });

      await ddbDocClient.send(putAffiliateLinkCommand);
      console.log(`[linkUserToStore] Created affiliate-store link: ${affiliateLinkId}`);

      // Update store to mark as linked to affiliate
      const updateStoreCommand = new UpdateCommand({
        TableName: 'commercive_stores',
        Key: { store_id: store.store_id },
        UpdateExpression: 'SET is_linked_to_affiliate = :linked, linked_affiliate_id = :affId, updated_at = :now',
        ExpressionAttributeValues: {
          ':linked': true,
          ':affId': affiliate.affiliate_id,
          ':now': now,
        },
      });

      await ddbDocClient.send(updateStoreCommand);
      console.log(`[linkUserToStore] Updated store linked_affiliate_id`);
    }

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
      errorCode: 'INTERNAL_ERROR',
    };
  }
}
