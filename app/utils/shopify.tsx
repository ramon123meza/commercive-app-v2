import type { Edge, Order, Payload } from "app/types/payload";
import axios from "axios";
import { inventoryQuery, fulfillmentsQuery } from "./queries";

const fetchProducts = async (
  shop: string,
  accessToken: string,
  after: string | null = null,
) => {
  const query = `
    query($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            descriptionHtml
            handle
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const variables = {
    first: 50,
    after,
  };

  const response = await axios.post(
    `https://${shop}/admin/api/2024-01/graphql.json`,
    { query, variables },
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    },
  );

  return response.data.data.products;
};

export const fetchAllProducts = async (shop: string, accessToken: string) => {
  let allProducts: any[] = [];
  let hasNextPage = true;
  let after: string | null = null;

  while (hasNextPage) {
    const products = await fetchProducts(shop, accessToken, after);
    allProducts = allProducts.concat(
      products.edges.map((edge: any) => edge.node),
    );
    hasNextPage = products.pageInfo.hasNextPage;
    after = products.pageInfo.endCursor;
  }

  return allProducts;
};

export const fetchAllInventoryLevels = async (admin: any) => {
  let allInventoryItems: Edge["node"][] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  while (hasNextPage) {
    console.log(`Fetching inventory data...`);

    const variables: any = endCursor ? { cursor: endCursor } : {};
    const response = await admin.graphql(inventoryQuery, variables);
    const inventoryData = await response.json();
    if (!inventoryData?.data?.inventoryItems) {
      console.error("Failed to fetch inventory data.");
      break;
    }
    const edges = inventoryData.data.inventoryItems.edges as Edge[];
    const items = edges.map((edge) => edge.node);
    allInventoryItems = [...allInventoryItems, ...items];
    hasNextPage = inventoryData.data.inventoryItems.pageInfo.hasNextPage;
    const newEndCursor = inventoryData.data.inventoryItems.pageInfo.endCursor;

    if (!hasNextPage || !newEndCursor || newEndCursor === endCursor) {
      console.log("No more inventory pages to fetch.");
      break;
    }

    endCursor = newEndCursor;
  }
  console.log("allInventoryItems :>> ", allInventoryItems.length);
  return allInventoryItems;
};

export const fetchAllOrders = async (admin: any) => {
  let allOrders: any[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  while (hasNextPage) {
    console.log(`Fetching order data...`);

    const ordersQuery = `#graphql
      query ($cursor: String) {
        orders(first: 50, after: $cursor) {
          edges {
            node {
              id
              name
              createdAt
              updatedAt
              processedAt
              cancelReason
              cancelledAt
              closedAt
              confirmed
              currencyCode
              email
              test
              taxesIncluded
              totalWeight
              customerLocale
              phone
              note
              sourceName
              confirmationNumber
              displayFulfillmentStatus
              displayFinancialStatus
              tags
              customer {
                id
                displayName
                email
              }

              currentSubtotalPriceSet {
                shopMoney { amount currencyCode }
              }
              currentTotalPriceSet {
                shopMoney { amount currencyCode }
              }
              currentTotalTaxSet {
                shopMoney { amount currencyCode }
              }
              currentTotalDiscountsSet {
                shopMoney { amount currencyCode }
              }
              currentShippingPriceSet {
                shopMoney { amount currencyCode }
              }

              totalPriceSet {
                shopMoney { amount currencyCode }
              }
              subtotalPriceSet {
                shopMoney { amount currencyCode }
              }
              totalTaxSet {
                shopMoney { amount currencyCode }
              }
              totalDiscountsSet {
                shopMoney { amount currencyCode }
              }
              totalShippingPriceSet {
                shopMoney { amount currencyCode }
              }

              lineItems(first: 100) {
                edges {
                  node {
                    id
                    name
                    title
                    quantity
                    sku
                    taxable
                    requiresShipping
                    vendor
                    totalDiscountSet {
                      shopMoney { amount currencyCode }
                    }
                    variant {
                      id
                      title
                    }
                  }
                }
              }

              shippingAddress {
                name
                address1
                address2
                city
                zip
                province
                country
              }

              billingAddress {
                name
                address1
                address2
                city
                zip
                province
                country
              }

              fulfillments {
                trackingInfo {
                  number
                  url
                }
              }

              paymentGatewayNames
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

    const variables: any = endCursor ? { cursor: endCursor } : {};
    const response = await admin.graphql(ordersQuery, variables);
    const orderData = await response.json();

    if (!orderData?.data?.orders) {
      console.error("Failed to fetch orders.");
      break;
    }

    const edges = orderData.data.orders.edges;
    const orders = edges.map((edge: any) => edge.node);
    allOrders = [...allOrders, ...orders];
    console.log("orderData.data.orders :>> ", orderData.data.orders);
    hasNextPage = orderData.data.orders.pageInfo.hasNextPage;
    const newEndCursor = orderData.data.orders.pageInfo.endCursor;

    if (!hasNextPage || !newEndCursor || newEndCursor === endCursor) {
      console.log("No more order pages to fetch.");
      break;
    }

    endCursor = newEndCursor;
  }

  return allOrders as Order[];
};

export const fetchAllFulfillments = async (admin: any) => {
  let allFulfillments: any[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  while (hasNextPage) {
    console.log(`Fetching fulfillment data...`);

    const variables: any = endCursor ? { cursor: endCursor } : {};
    const response = await admin.graphql(fulfillmentsQuery, variables);
    const fulfillmentData = await response.json();

    if (!fulfillmentData?.data?.orders) {
      console.error("Failed to fetch fulfillment data.");
      break;
    }

    const edges = fulfillmentData.data.orders.edges;
    const fulfillments = edges.map((edge: any) => edge.node);
    allFulfillments = [...allFulfillments, ...fulfillments];

    hasNextPage = fulfillmentData.data.orders.pageInfo.hasNextPage;
    const newEndCursor = fulfillmentData.data.orders.pageInfo.endCursor;

    if (!hasNextPage || !newEndCursor || newEndCursor === endCursor) {
      console.log("No more fulfillment pages to fetch.");
      break;
    }

    endCursor = newEndCursor;
  }

  return allFulfillments;
};
