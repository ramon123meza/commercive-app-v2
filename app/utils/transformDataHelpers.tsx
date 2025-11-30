import type { Payload, TrackingData, Edge, Order } from "../types/payload";
import { v4 as uuidv4 } from "uuid";

async function getConversionRate(
  fromCurrency: string,
  amount: string | undefined,
): Promise<string> {
  const apiKey = process.env.CURRENCY_API_KEY; // Replace with your actual API key from CurrencyFreaks
  const url = `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    // Ensure the API call was successful and contains the required data
    if (response.ok && data) {
      const ratio = data.rates[fromCurrency];
      const convertedPrice = amount
        ? parseFloat(amount) / parseFloat(ratio)
        : 1;
      console.log(convertedPrice);
      return convertedPrice.toString(); // Return the conversion rate for the target currency
    } else {
      console.error("Error fetching conversion rates:", data);
      return ""; // Default to 1 if there is an error or if the currency isn't found
    }
  } catch (error) {
    console.error("Error fetching conversion rates:", error);
    return ""; // Default to 1 in case of an error
  }
}

export async function transformOrderData(payload: Payload, storeUrl: string) {
  let convertedSubtotalPrice = payload.subtotal_price;
  // Only convert if the currency is not USD
  let convertedShippingcosts =
    payload.total_shipping_price_set?.shop_money?.amount;
  if (payload.currency !== "USD") {
    try {
      convertedSubtotalPrice = await getConversionRate(
        payload.currency ? payload.currency : "EUR",
        payload.subtotal_price,
      );
      convertedShippingcosts = await getConversionRate(
        payload.currency ? payload.currency : "EUR",
        convertedShippingcosts,
      );
    } catch (error) {
      console.error("Error converting currency:", error);
      // Default to the original price if conversion fails
      convertedSubtotalPrice = payload.subtotal_price;
      convertedShippingcosts =
        payload.total_shipping_price_set?.shop_money?.amount;
    }
  }

  return {
    id: uuidv4(),
    order_id: payload.id,
    order_number: payload.order_number,
    line_items: (payload.line_items ?? null) as any,
    processed_at: payload.processed_at ?? null,
    order_status_url: payload.order_status_url ?? null,
    customer_id: payload.user_id ?? null,
    customer_email: payload.contact_email ?? null,
    shipping_address: payload.shipping_address ?? null,
    currency: payload.currency ?? null,
    total_order_value: payload.total_line_items_price ?? null,
    sub_total_price: payload.subtotal_price ?? null,
    sub_total_price_usd: convertedSubtotalPrice,
    current_total_tax: payload.current_total_tax ?? null,
    current_total_tax_set: payload.current_total_tax_set ?? {},
    shipping_costs: Number(
      payload.total_shipping_price_set?.shop_money?.amount ?? 0,
    ),
    shipping_costs_usd: convertedShippingcosts,
    fulfillment_status: payload.fulfillment_status ?? null,
    total_discounts: payload.total_discounts ?? null,
    total_discounts_set: payload.total_discounts_set ?? {},
    order_tags: payload.tags ?? null,
    financial_status: payload.financial_status ?? null,
    fulfillments: payload.fulfillments ?? {},
    updated_at: new Date() as unknown as string,
    store_url: storeUrl,
  };
}

export async function transformOrderInitialData(
  payloads: Order[],
  storeUrl: string,
) {
  const orders = payloads.map((payload) => {
    return {
      id: uuidv4(),
      order_id: parseInt(payload.id.split("/").pop()!),
      order_number: parseInt(payload.name.replace("#", "")),
      line_items: (payload.lineItems.edges ?? []) as any,
      processed_at: payload.processedAt ?? null,
      order_status_url: null,
      customer_id: parseInt(payload.customer?.id.split("/").pop()!) ?? null,
      customer_email: payload.customer?.email ?? null,
      shipping_address: (payload.shippingAddress ?? null) as any,
      currency: payload.currencyCode ?? null,
      total_order_value: payload.totalPriceSet.shopMoney.amount ?? null,
      sub_total_price: payload.subtotalPriceSet.shopMoney.amount ?? null,
      sub_total_price_usd: payload.subtotalPriceSet.shopMoney.amount ?? null,
      current_total_tax: payload.currentTotalTaxSet.shopMoney.amount ?? null,
      current_total_tax_set: payload.currentTotalTaxSet ?? {},
      shipping_costs: Number(
        payload.totalShippingPriceSet.shopMoney?.amount ?? 0,
      ),
      shipping_costs_usd:
        payload.totalShippingPriceSet.shopMoney?.amount ?? "0",

      fulfillment_status: payload.displayFulfillmentStatus ?? null,
      total_discounts: payload.totalDiscountsSet.shopMoney.amount ?? null,
      total_discounts_set: payload.totalDiscountsSet ?? {},
      order_tags: null,
      financial_status: payload.displayFinancialStatus ?? "unknown",
      fulfillments: payload.fulfillments ?? {},
      updated_at: new Date() as unknown as string,
      store_url: storeUrl,
    };
  });
  return orders;
}

export function transformLineItemsData(payload: Payload, storeUrl: string) {
  return payload.line_items.map((lineItem) => ({
    id: uuidv4(),
    lineItem_id: lineItem.id ?? null,
    order_id: payload.id ?? null,
    grams: lineItem.grams ?? null,
    price: lineItem.price ?? null,
    currency: payload.currency ?? null,
    quantity: lineItem.quantity ?? null,
    sku: lineItem.sku ?? null,
    product_id: lineItem.product_id ?? null,
    total_discount: lineItem.total_discount ?? null,
    vendor_name: lineItem.vendor ?? null,
    discount_allocations: lineItem.discount_allocations ?? {},
    created_at: new Date() as unknown as string,
    store_url: storeUrl,
  }));
}

export function transformFulfillmentData(
  payload: TrackingData,
  storeUrl: string,
  storeAddress: any,
) {
  return {
    id: uuidv4(),
    order_id: parseInt(payload.order_id) ?? null,
    status: payload.status,
    tracking_company: payload.tracking_company ?? null,
    shipment_status: payload.shipment_status ?? null,
    destination: payload.destination ?? null,
    tracking_number: payload.tracking_number ?? null,
    tracking_numbers: payload.tracking_numbers ?? [],
    tracking_url: payload.tracking_url ?? null,
    tracking_urls: payload.tracking_urls ?? [],
    created_at: payload.created_at,
    updated_at: payload.updated_at ?? null,
    store_url: storeUrl,
    store_location: storeAddress,
  };
}

export function transformInventoryData(
  inventoryData: Edge["node"][],
  storeUrl: string,
) {
  if (!Array.isArray(inventoryData) || inventoryData.length === 0) {
    console.log("No valid inventory data found.");
    return [];
  }

  const transformedData = inventoryData.map((item) => {
    const productId = item?.variant?.product?.id
      ? item.variant.product.id.split("/").pop()
      : null;
    const variantId = item?.variant?.id.split("/").pop();

    return {
      inventory_id: item.id,
      sku: item.sku,
      inventory_level: item.inventoryLevels.edges,
      store_url: storeUrl,
      product_id: productId,
      product_image:
        item.variant.image ||
        item.variant.product.featuredMedia?.preview.image.url,
      variant_name: item.variant.title,
      product_name: item.variant.product.title,
      variant_id: variantId,
    };
  });

  // console.log("Transformed Inventory Data:", transformedData);
  return transformedData;
}

// Transform inventory data from webhook response (after fetching full details via GraphQL)
// This is used when processing INVENTORY_LEVELS_UPDATE webhooks
export function transformInventoryLevelWebhookData(
  inventoryItem: any,
  storeUrl: string,
) {
  if (!inventoryItem) {
    console.log("No inventory item data to transform");
    return null;
  }

  try {
    const productId = inventoryItem?.variant?.product?.id
      ? inventoryItem.variant.product.id.split("/").pop()
      : null;
    const variantId = inventoryItem?.variant?.id
      ? inventoryItem.variant.id.split("/").pop()
      : null;

    // Get product image from variant or product featured media
    const productImage =
      inventoryItem.variant?.image?.url ||
      inventoryItem.variant?.product?.featuredMedia?.preview?.image?.url ||
      null;

    return {
      inventory_id: inventoryItem.id,
      sku: inventoryItem.sku || null,
      inventory_level: inventoryItem.inventoryLevels?.edges || [],
      store_url: storeUrl,
      product_id: productId,
      product_image: productImage,
      variant_name: inventoryItem.variant?.title || null,
      product_name: inventoryItem.variant?.product?.title || null,
      variant_id: variantId ? parseInt(variantId) : null,
      // Note: back_orders is handled separately by saveBackorderDataToSupabase
    };
  } catch (error) {
    console.error("Error transforming inventory level webhook data:", error);
    return null;
  }
}

export function transformFulfillmentDataFromShopify(
  fulfillmentData: any[],
  storeUrl: string,
) {
  if (!Array.isArray(fulfillmentData) || fulfillmentData.length === 0) {
    console.log("No valid fulfillment data found.");
    return [];
  }

  const transformedData: any[] = [];

  fulfillmentData.forEach((order) => {
    // Extract order ID from the order object
    const orderId = order.id ? parseInt(order.id.split("/").pop()!) : 0; // Default to 0 if no order ID

    // Process each fulfillment within the order
    if (order.fulfillments && order.fulfillments.length > 0) {
      order.fulfillments.forEach((fulfillment: any) => {
        console.log("fulfillment :>> ", fulfillment);
        transformedData.push({
          id: uuidv4(),
          order_id: orderId,
          status: fulfillment.status || "unknown",
          tracking_company: fulfillment.trackingInfo[0]?.company || null,
          shipment_status: fulfillment.status || null,
          destination: null, // This would need to be fetched from order data
          tracking_number: fulfillment.trackingInfo[0]?.number || null,
          tracking_numbers: fulfillment.trackingInfo[0]?.number
            ? [fulfillment.trackingInfo[0].number]
            : [],
          tracking_url: fulfillment.trackingInfo[0]?.url || null,
          tracking_urls: fulfillment.trackingInfo[0]?.url
            ? [fulfillment.trackingInfo[0].url]
            : [],
          created_at: fulfillment.createdAt || new Date().toISOString(),
          updated_at: fulfillment.updatedAt || new Date().toISOString(),
          store_url: storeUrl,
          store_location: null, // This would need to be fetched from store data
        });
      });
    }
  });

  return transformedData;
}
