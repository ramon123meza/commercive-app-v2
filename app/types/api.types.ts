/**
 * API Type Definitions for Lambda Function Responses
 *
 * These types define the structure of data returned from Lambda functions.
 */

export interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'affiliate' | 'store_owner' | 'admin';
  is_admin: boolean;
  is_verified: boolean;
  status: 'pending' | 'active' | 'suspended';
  avatar_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface Store {
  store_id: string;
  store_url: string;
  shop_name: string;
  email: string;
  access_token: string;
  store_code?: string;
  is_inventory_fetched: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Order {
  order_id: string;
  store_url: string;
  shopify_order_id: string;
  order_number: string;
  financial_status: string;
  fulfillment_status: string;
  total_price: string;
  currency: string;
  customer_email?: string;
  customer_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface OrderItem {
  item_id: string;
  order_id: string;
  shopify_line_item_id: string;
  product_title: string;
  variant_title?: string;
  sku?: string;
  quantity: number;
  price: string;
  created_at: string;
}

export interface Inventory {
  inventory_id: string;
  store_url: string;
  shopify_inventory_item_id: string;
  shopify_product_id: string;
  product_title: string;
  variant_title?: string;
  sku?: string;
  quantity: number;
  location_id: string;
  location_name: string;
  created_at: string;
  updated_at?: string;
}

export interface Tracking {
  tracking_id: string;
  order_id: string;
  tracking_number: string;
  carrier: string;
  tracking_url?: string;
  status: string;
  created_at: string;
  updated_at?: string;
}

// API Response wrappers
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface SignupResponse {
  message: string;
  user_id?: string;
}

export interface WebhookLogResponse {
  message: string;
  webhook_id?: string;
}

// Request payloads
export interface CreateUserPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: 'affiliate' | 'store_owner' | 'admin';
  store_url?: string;
  phone?: string;
}

export interface CreateMerchantPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  store_url: string;
  phone?: string;
}

export interface UpsertStorePayload {
  store_url: string;
  shop_name: string;
  email: string;
  access_token: string;
  user_id?: string;
  store_code?: string;
}

export interface SyncOrderPayload {
  store_url: string;
  order: {
    shopify_order_id: string;
    order_number: string;
    financial_status: string;
    fulfillment_status: string;
    total_price: string;
    currency: string;
    customer_email?: string;
    customer_name?: string;
    created_at: string;
  };
  line_items: Array<{
    shopify_line_item_id: string;
    product_title: string;
    variant_title?: string;
    sku?: string;
    quantity: number;
    price: string;
  }>;
}

export interface SyncInventoryPayload {
  store_url: string;
  items: Array<{
    shopify_inventory_item_id: string;
    shopify_product_id: string;
    product_title: string;
    variant_title?: string;
    sku?: string;
    quantity: number;
    location_id: string;
    location_name: string;
  }>;
}

export interface SyncFulfillmentPayload {
  store_url: string;
  order_id: string;
  shopify_order_id: string;
  tracking_number: string;
  carrier: string;
  tracking_url?: string;
  status: string;
}
