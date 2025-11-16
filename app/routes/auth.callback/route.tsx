import type { ActionFunction } from "@remix-run/node";
import { fetchAllProducts } from "../../utils/shopify";
import axios from "axios";

export const action: ActionFunction = async ({ request }) => {
  console.log("In callback....");
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");

  if (!shop || !code) {
    throw new Response("Missing 'shop' or 'code' query parameters", {
      status: 400,
    });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      },
    );

    const accessToken = tokenResponse.data.access_token;

    // Fetch all products using GraphQL
    const allProducts = await fetchAllProducts(shop, accessToken);
    console.log("Fetched all products:", allProducts);

    // Save products and accessToken in your database
    // ...

    return new Response("App installed and products fetched!", {
      status: 200,
    });
  } catch (error: any) {
    console.error(
      "Error during OAuth callback:",
      error.response?.data || error.message,
    );
    return new Response("An error occurred during app installation", {
      status: 500,
    });
  }
};
