import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { unauthenticated, MONTHLY_PLAN_GROWTH, MONTHLY_PLAN_PRO, MONTHLY_PLAN_ENTERPRISE } from "../shopify.server";
import { firebaseGet } from "../utils/firebase-client";
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

  // Check Limits
  let limitReached = false;
  try {
    const { billing } = await unauthenticated.admin(shop);
    const check = await billing.check({
      plans: [MONTHLY_PLAN_GROWTH, MONTHLY_PLAN_PRO, MONTHLY_PLAN_ENTERPRISE],
      isTest: true,
    });

    const analytics = await firebaseGet("/analytics?range=30", shop);
    const count = (analytics as any)?.totalTryOnsThisMonth ?? 0;

    let planName = "free";
    if (check.hasActivePayment) {
      planName = check.appSubscriptions[0].name;
    }

    if (planName === "free" && count >= 5) limitReached = true; // Small free trial
    if (planName === MONTHLY_PLAN_GROWTH && count >= 250) limitReached = true;
    if (planName === MONTHLY_PLAN_PRO && count >= 500) limitReached = true;
  } catch (e) {
    console.error("[Limit Check Error]", e);
  }

  return json(
    {
      enabled,
      limitReached,
      buttonText: config?.buttonText ?? "Try It On",
      buttonColor: config?.buttonColor ?? "#000000",
      buttonPosition: config?.buttonPosition ?? "below-add-to-cart",
      borderRadius: config?.borderRadius ?? 8,
      fullWidth: config?.fullWidth ?? true,
    },
    { headers: CORS },
  );
};
