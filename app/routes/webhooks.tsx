import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  saveOrdersToSupabase,
  saveLineItemsToSupabase,
  saveTrackingData,
  appUpdateInventoryDataToSupabase,
  saveBackorderDataToSupabase,
} from "../utils/supabaseHelpers";
import {
  transformOrderData,
  transformLineItemsData,
  transformFulfillmentData,
} from "../utils/transformDataHelpers";
import type { Payload, StoreInfo, TrackingData } from "../types/payload";
import { storeInfoQuery } from "app/utils/queries";
import { supabase } from "app/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const response = await admin.graphql(storeInfoQuery);
  const storeData = (await response.json()).data as StoreInfo;
  supabase.from("webhooks").insert({
    store_url: storeData.shop.myshopifyDomain,
    topic: topic,
    payload: payload,
  });

  switch (topic) {
    case "FULFILLMENTS_CREATE":
    case "FULFILLMENTS_UPDATE": {
      console.log("✅ FULFILLMENTS_UPDATE");
      console.log(`${topic.replace("_", " ")} triggered`);
      const trackingData = transformFulfillmentData(
        payload as TrackingData,
        storeData.shop.myshopifyDomain,
        storeData.shop.billingAddress,
      );

      // const variables = {
      //   id: payload.admin_graphql_api_id, // Replace with the actual fulfillment ID
      // };
      // const fulfillmentEventResponse = await admin.graphql(fulfillmentEventQuery, {variables})
      // console.log("Fulfillment event data", (await fulfillmentEventResponse.json()).data)
      await saveTrackingData(trackingData);
      break;
    }
    case "ORDERS_UPDATED": {
      console.log("✅ ORDERS_UPDATED");
      console.log(`${topic.replace("_", " ")} triggered`);
      const _payload = payload as Payload;
      const orderData = await transformOrderData(
        _payload as Payload,
        storeData.shop.myshopifyDomain,
      );
      // console.log("payload::: ", payload);
      await saveOrdersToSupabase([orderData]);
      const lineItemData = transformLineItemsData(
        _payload as Payload,
        storeData.shop.myshopifyDomain,
      );
      await saveLineItemsToSupabase(lineItemData);
      const lineItems = _payload.line_items;
      const order_id = _payload.id;

      if (lineItems.length > 0) {
        saveBackorderDataToSupabase(lineItems, order_id);
      }
      break;
    }
    case "INVENTORY_ITEMS_CREATE": {
      console.log("✅ INVENTORY_ITEMS_CREATE");
      const productData = payload;
      console.log("Inventory ITEMS CREATE Data:");
      await appUpdateInventoryDataToSupabase(
        productData,
        storeData.shop.myshopifyDomain,
      );
      break;
    }
    case "INVENTORY_ITEMS_UPDATE": {
      console.log("✅ INVENTORY_ITEMS_UPDATE");
      const productData = payload;
      console.log("Inventory ITEMS Data:", productData);
      await appUpdateInventoryDataToSupabase(
        productData,
        storeData.shop.myshopifyDomain,
      );
      break;
    }
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response("Webhook handled successfully");
};
