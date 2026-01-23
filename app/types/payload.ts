/**
 * Shopify Webhook Payload Types
 *
 * These types define the structure of data received from Shopify webhooks
 * and GraphQL responses.
 */

export interface LineItem {
  id: number;
  grams?: number;
  price?: string;
  quantity?: number;
  sku?: string;
  product_id?: number;
  total_discount?: string;
  vendor?: string;
  discount_allocations?: object;
}

export interface ShippingAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  province?: string;
  country?: string;
}

export interface MoneySet {
  shop_money?: {
    amount?: string;
    currency_code?: string;
  };
  presentment_money?: {
    amount?: string;
    currency_code?: string;
  };
}

export interface Fulfillment {
  id?: number;
  status?: string;
  tracking_number?: string;
  tracking_url?: string;
  tracking_company?: string;
}

export interface Payload {
  id: number;
  order_number?: number;
  line_items: LineItem[];
  processed_at?: string;
  order_status_url?: string;
  user_id?: string;
  contact_email?: string;
  shipping_address?: ShippingAddress;
  currency?: string;
  total_line_items_price?: string;
  subtotal_price?: string;
  current_total_tax?: string;
  current_total_tax_set?: MoneySet;
  total_shipping_price_set?: MoneySet;
  fulfillment_status?: string;
  total_discounts?: string;
  total_discounts_set?: MoneySet;
  tags?: string;
  financial_status?: string;
  fulfillments?: Fulfillment[];
}

export interface TrackingData {
  order_id: string;
  status: string;
  tracking_company?: string;
  shipment_status?: string;
  destination?: object;
  tracking_number?: string;
  tracking_numbers?: string[];
  tracking_url?: string;
  tracking_urls?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface InventoryLevel {
  node: {
    id: string;
    location: {
      id: string;
      name: string;
    };
    quantities: Array<{
      name: string;
      quantity: number;
    }>;
  };
}

export interface Edge {
  node: {
    id: string;
    sku?: string;
    variant: {
      id: string;
      title: string;
      image?: {
        url?: string;
      };
      product: {
        id: string;
        title: string;
        featuredMedia?: {
          preview: {
            image: {
              url: string;
            };
          };
        };
      };
    };
    inventoryLevels: {
      edges: InventoryLevel[];
    };
  };
  cursor?: string;
}

export interface ShopMoneySet {
  shopMoney: {
    amount: string;
    currencyCode: string;
  };
}

export interface GraphQLCustomer {
  id: string;
  displayName?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface GraphQLLineItem {
  node: {
    id: string;
    name?: string;
    title?: string;
    quantity: number;
    sku?: string;
    taxable?: boolean;
    requiresShipping?: boolean;
    vendor?: string;
    totalDiscountSet?: ShopMoneySet;
    variant?: {
      id: string;
      title: string;
    };
  };
}

export interface GraphQLFulfillment {
  id?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  trackingInfo?: Array<{
    number?: string;
    url?: string;
    company?: string;
  }>;
}

export interface Order {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  processedAt?: string;
  cancelReason?: string;
  cancelledAt?: string;
  closedAt?: string;
  confirmed?: boolean;
  currencyCode: string;
  email?: string;
  test?: boolean;
  taxesIncluded?: boolean;
  totalWeight?: number;
  customerLocale?: string;
  phone?: string;
  note?: string;
  sourceName?: string;
  confirmationNumber?: string;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  tags?: string[];
  customer?: GraphQLCustomer;
  currentSubtotalPriceSet: ShopMoneySet;
  currentTotalPriceSet: ShopMoneySet;
  currentTotalTaxSet: ShopMoneySet;
  currentTotalDiscountsSet: ShopMoneySet;
  currentShippingPriceSet?: ShopMoneySet;
  totalPriceSet: ShopMoneySet;
  subtotalPriceSet: ShopMoneySet;
  totalTaxSet: ShopMoneySet;
  totalDiscountsSet: ShopMoneySet;
  totalShippingPriceSet: ShopMoneySet;
  lineItems: {
    edges: GraphQLLineItem[];
  };
  shippingAddress?: ShippingAddress;
  billingAddress?: ShippingAddress;
  fulfillments?: GraphQLFulfillment[];
  paymentGatewayNames?: string[];
}
