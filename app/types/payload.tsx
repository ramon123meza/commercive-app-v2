const mockStoreInfo = {
  shop: {
    name: "For_Commercive",
    email: "laktionovvladlen1@gmail.com",
    myshopifyDomain: "for-commercive.myshopify.com",
    primaryDomain: {
      url: "https://for-commercive.myshopify.com",
      host: "for-commercive.myshopify.com",
    },
    billingAddress: {},
  },
};

const mockPayload = {
  id: 5982854316230,
  admin_graphql_api_id: "gid://shopify/Order/5982854316230",
  app_id: 1354745,
  browser_ip: "89.187.161.220",
  buyer_accepts_marketing: false,
  cancel_reason: null,
  cancelled_at: null,
  cart_token: null,
  checkout_id: 34962395431110,
  checkout_token: "1340d9ac67d9c45abeceddd15f4fed4c",
  client_details: {
    accept_language: null,
    browser_height: null,
    browser_ip: "89.187.161.220",
    browser_width: null,
    session_hash: null,
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  },
  closed_at: "2024-12-16T09:47:48-05:00",
  company: null,
  confirmation_number: "0AZ0MH0IV",
  confirmed: true,
  contact_email: null,
  created_at: "2024-12-10T01:00:02-05:00",
  currency: "UAH",
  current_shipping_price_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  current_subtotal_price: "100.00",
  current_subtotal_price_set: {
    shop_money: { amount: "100.00", currency_code: "UAH" },
    presentment_money: { amount: "100.00", currency_code: "UAH" },
  },
  current_total_additional_fees_set: null,
  current_total_discounts: "0.00",
  current_total_discounts_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  current_total_duties_set: null,
  current_total_price: "100.00",
  current_total_price_set: {
    shop_money: { amount: "100.00", currency_code: "UAH" },
    presentment_money: { amount: "100.00", currency_code: "UAH" },
  },
  current_total_tax: "0.00",
  current_total_tax_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  customer_locale: "en",
  device_id: null,
  discount_codes: [],
  duties_included: false,
  email: "",
  estimated_taxes: false,
  financial_status: "paid",
  fulfillment_status: null,
  landing_site: null,
  landing_site_ref: null,
  location_id: 72665759942,
  merchant_business_entity_id: "MTY1Nzk5OTQ2NDM4",
  merchant_of_record_app_id: null,
  name: "#1002",
  note: null,
  note_attributes: [],
  number: 2,
  order_number: 1002,
  order_status_url:
    "https://for-commercive.myshopify.com/65799946438/orders/e5d012479ce6ea387532a51cb8889e8b/authenticate?key=b3806a1daaacc01acf517b30ca653697",
  original_total_additional_fees_set: null,
  original_total_duties_set: null,
  payment_gateway_names: ["manual"],
  phone: null,
  po_number: null,
  presentment_currency: "UAH",
  processed_at: "2024-12-10T01:00:01-05:00",
  reference: "2d18725fc7ebe709951c4b43b538acee",
  referring_site: null,
  source_identifier: "2d18725fc7ebe709951c4b43b538acee",
  source_name: "shopify_draft_order",
  source_url: null,
  subtotal_price: "100.00",
  subtotal_price_set: {
    shop_money: { amount: "100.00", currency_code: "UAH" },
    presentment_money: { amount: "100.00", currency_code: "UAH" },
  },
  tags: "",
  tax_exempt: false,
  tax_lines: [],
  taxes_included: true,
  test: false,
  token: "e5d012479ce6ea387532a51cb8889e8b",
  total_cash_rounding_payment_adjustment_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  total_cash_rounding_refund_adjustment_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  total_discounts: "0.00",
  total_discounts_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  total_line_items_price: "100.00",
  total_line_items_price_set: {
    shop_money: { amount: "100.00", currency_code: "UAH" },
    presentment_money: { amount: "100.00", currency_code: "UAH" },
  },
  total_outstanding: "0.00",
  total_price: "100.00",
  total_price_set: {
    shop_money: { amount: "100.00", currency_code: "UAH" },
    presentment_money: { amount: "100.00", currency_code: "UAH" },
  },
  total_shipping_price_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  total_tax: "0.00",
  total_tax_set: {
    shop_money: { amount: "0.00", currency_code: "UAH" },
    presentment_money: { amount: "0.00", currency_code: "UAH" },
  },
  total_tip_received: "0.00",
  total_weight: 0,
  updated_at: "2025-07-30T19:58:45-04:00",
  user_id: 86987276486,
  billing_address: null,
  customer: null,
  discount_applications: [],
  fulfillments: [],
  line_items: [
    {
      id: 14155936006342,
      admin_graphql_api_id: "gid://shopify/LineItem/14155936006342",
      attributed_staffs: [],
      current_quantity: 1,
      fulfillable_quantity: 1,
      fulfillment_service: "gift_card",
      fulfillment_status: null,
      gift_card: true,
      grams: 0,
      name: "Gift Card - $100",
      price: "100.00",
      price_set: [Object],
      product_exists: true,
      product_id: 8395241652422,
      properties: [],
      quantity: 1,
      requires_shipping: false,
      sku: null,
      taxable: false,
      title: "Gift Card",
      total_discount: "0.00",
      total_discount_set: [Object],
      variant_id: 44292742480070,
      variant_inventory_management: null,
      variant_title: "$100",
      vendor: "Snowboard Vendor",
      tax_lines: [Array],
      duties: [],
      discount_allocations: [],
    },
  ],
  payment_terms: null,
  refunds: [],
  shipping_address: null,
  shipping_lines: [],
  returns: [],
};

const mockEdge = {
  node: {
    id: "gid://shopify/InventoryItem/46396074524870",
    sku: null,
    tracked: true,
    variant: {
      id: "gid://shopify/ProductVariant/44292742545606",
      title: "Default Title",
      image: null,
      product: {
        id: "gid://shopify/Product/8395241717958",
        title: "The Compare at Price Snowboard",
        featuredMedia: {
          preview: {
            image: {
              url: "https://cdn.shopify.com/s/files/1/0657/9994/6438/files/snowboard_sky.png?v=1733737337",
            },
          },
        },
      },
    },
    inventoryLevels: {
      edges: [
        {
          node: {
            id: "gid://shopify/InventoryLevel/107033755846?inventory_item_id=46396074524870",
            location: {
              id: "gid://shopify/Location/72665759942",
              name: "Shop location",
            },
            quantities: [
              {
                name: "available",
                quantity: 2,
              },
              {
                name: "committed",
                quantity: 2,
              },
              {
                name: "incoming",
                quantity: 0,
              },
              {
                name: "on_hand",
                quantity: 4,
              },
              {
                name: "reserved",
                quantity: 0,
              },
            ],
          },
        },
      ],
    },
  },
};

const mockOrder = {
  id: "gid://shopify/Order/6332435824838",
  name: "#1106",
  createdAt: "2025-07-30T09:34:28Z",
  updatedAt: "2025-07-30T09:34:29Z",
  processedAt: "2025-07-30T09:34:27Z",
  cancelReason: null,
  cancelledAt: null,
  closedAt: null,
  confirmed: true,
  currencyCode: "UAH",
  email: "sven0227@gmail.com",
  test: false,
  taxesIncluded: true,
  totalWeight: "0",
  customerLocale: "en-FI",
  phone: null,
  note: null,
  sourceName: "shopify_draft_order",
  confirmationNumber: "ZQWMJ0YIP",
  displayFulfillmentStatus: "",
  tags: [],
  customer: {
    id: "gid://shopify/Customer/10611858669846",
    displayName: "Sven Sven",
    email: "",
  },
  currentSubtotalPriceSet: {
    shopMoney: { amount: "600.0", currencyCode: "UAH" },
  },
  currentTotalPriceSet: { shopMoney: { amount: "600.0", currencyCode: "UAH" } },
  currentTotalTaxSet: { shopMoney: { amount: "0.0", currencyCode: "UAH" } },
  currentTotalDiscountsSet: {
    shopMoney: { amount: "0.0", currencyCode: "UAH" },
  },
  currentShippingPriceSet: {
    shopMoney: { amount: "0.0", currencyCode: "UAH" },
  },
  totalPriceSet: { shopMoney: { amount: "600.0", currencyCode: "UAH" } },
  subtotalPriceSet: { shopMoney: { amount: "600.0", currencyCode: "UAH" } },
  totalTaxSet: { shopMoney: { amount: "0.0", currencyCode: "UAH" } },
  totalDiscountsSet: { shopMoney: { amount: "0.0", currencyCode: "UAH" } },
  totalShippingPriceSet: { shopMoney: { amount: "0.0", currencyCode: "UAH" } },
  lineItems: {
    edges: [
      {
        node: {
          id: "gid://shopify/LineItem/14852871258310",
          name: "The Collection Snowboard: Hydrogen",
          title: "The Collection Snowboard: Hydrogen",
          quantity: 1,
          sku: null,
          taxable: true,
          requiresShipping: true,
          vendor: "HydrogenVendor",
          totalDiscountSet: {
            shopMoney: { amount: "0.0", currencyCode: "UAH" },
          },
          variant: {
            id: "gid://shopify/ProductVariant/44292743102662",
            title: "Default Title",
          },
        },
      },
    ],
  },
  shippingAddress: {
    name: "Sven Sven",
    address1: "Helsinki",
    address2: "Test",
    city: "Helsinki",
    zip: "10001",
    province: null,
    country: "Finland",
  },
  billingAddress: {
    name: "Sven Sven",
    address1: "Helsinki",
    address2: "Test",
    city: "Helsinki",
    zip: "10001",
    province: null,
    country: "Finland",
  },
  fulfillments: [],
  paymentGatewayNames: ["manual"],
  displayFinancialStatus: "paid",
};

export type LineItem = {
  id: string;
  gram?: number;
  price?: number;
  currency?: number;
  quantity?: number;
  sku?: string;
  product_id?: string;
  total_discount?: number;
  vendor?: string;
  discount_allocations?: Record<string, unknown>;
};

export type Payload = typeof mockPayload;
export type StoreInfo = typeof mockStoreInfo;
export type Edge = typeof mockEdge;
export type Order = typeof mockOrder;

export type TrackingData = {
  id: string;
  order_id: string;
  status: string;
  tracking_company?: string;
  shipment_status?: string;
  destination?: string;
  tracking_number?: string;
  tracking_numbers?: string[];
  tracking_url?: string;
  tracking_urls?: string[];
  created_at?: string;
  updated_at: string;
};
