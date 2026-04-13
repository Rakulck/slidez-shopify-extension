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

  const CORS = { "Access-Control-Allow-Origin": "*" };

  if (!shop || !productId) {
    return json({ enabled: false }, { headers: CORS });
  }

  // Liquid gives numeric ID; DB stores full GID
  const gid = `gid://shopify/Product/${productId}`;

  const record = await prisma.productState.findUnique({
    where: { shop_productId: { shop, productId: gid } },
  });

  const enabled = record?.enabled ?? false;

  const config = await prisma.merchantConfig.findUnique({ where: { shop } });

  return json(
    {
      enabled,
      buttonText: config?.buttonText ?? "Try It On",
      buttonColor: config?.buttonColor ?? "#000000",
      buttonPosition: config?.buttonPosition ?? "below-add-to-cart",
      borderRadius: config?.borderRadius ?? 8,
      fullWidth: config?.fullWidth ?? true,
    },
    { headers: CORS },
  );
};
