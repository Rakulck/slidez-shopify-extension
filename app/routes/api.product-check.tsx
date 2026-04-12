import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") ?? "";
  // Shopify App Proxy injects the shop domain as a header
  const shop =
    request.headers.get("x-shopify-shop-domain") ??
    url.searchParams.get("shop") ??
    "";

  if (!shop || !productId) {
    return json(
      { enabled: false },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  // Liquid gives numeric ID; DB stores full GID
  const gid = `gid://shopify/Product/${productId}`;

  const record = await prisma.productState.findUnique({
    where: { shop_productId: { shop, productId: gid } },
  });

  return json(
    { enabled: record?.enabled ?? false },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
};
