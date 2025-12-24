import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // If there are Shopify query params, redirect to /app with them
  if (url.searchParams.toString()) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return redirect("/app");
};
