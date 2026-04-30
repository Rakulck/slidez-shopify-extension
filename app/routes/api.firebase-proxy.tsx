// app/routes/api.firebase-proxy.tsx
// Public Shopify App Proxy route — no admin auth required.
// Shopify verifies the HMAC and forwards /apps/try-on/* requests here.
// This route adds the Firebase auth header and proxies the request.

import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from "@remix-run/node";
import shopify, { authenticate, unauthenticated, MONTHLY_PLAN_GROWTH, MONTHLY_PLAN_PRO, MONTHLY_PLAN_ENTERPRISE } from "../shopify.server";
import { firebaseGet, firebasePost } from "../utils/firebase-client";

// GET /apps/try-on?action=presign&shop=...&productId=...
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const productId = url.searchParams.get("productId") ?? "";

  if (action === "presign") {
    try {
      const data = await firebaseGet(
        `/api/tryon/presign?productId=${encodeURIComponent(productId)}`,
        shop
      );
      return json(data);
    } catch {
      return json({ error: "Failed to reach Firebase" }, { status: 502 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

// POST /apps/try-on  (body: { action, uploadId, productId, consentTimestamp, jurisdiction })
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.public.appProxy(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action: actionType, ...rest } = body as { action?: string } & Record<string, unknown>;

  if (actionType === "process" || !actionType) {
    try {
      const { session } = await unauthenticated.admin(shop);
      
      // Check if merchant has reached their hard limit
      const check = await shopify.billing.check(session, {
        plans: [MONTHLY_PLAN_GROWTH, MONTHLY_PLAN_PRO, MONTHLY_PLAN_ENTERPRISE],
        isTest: true,
      });

      const analytics = await firebaseGet("/analytics?range=30", shop);
      const count = (analytics as any)?.totalTryOnsThisMonth ?? 0;

      let planName = "free";
      if (check.hasActivePayment) {
        planName = check.appSubscriptions[0].name;
      }

      // Enforcement
      if (planName === "free" && count >= 5) {
        return json({ error: "Trial limit reached (5). Please upgrade to continue." }, { status: 403 });
      }
      if (planName === MONTHLY_PLAN_GROWTH && count >= 250) {
        return json({ error: "Monthly limit reached (250). Please upgrade to Pro." }, { status: 403 });
      }
      if (planName === MONTHLY_PLAN_PRO && count >= 500) {
        return json({ error: "Monthly limit reached (500). Please upgrade to Enterprise." }, { status: 403 });
      }

      const data = await firebasePost("/api/tryon/process", { shop, ...rest });

      // ─── Overage Billing Logic (Enterprise Only) ───────────────────────────
      (async () => {
        try {
          if (planName === MONTHLY_PLAN_ENTERPRISE && count > 2500) {
            const activeSub = check.appSubscriptions[0];
            const usageItem = activeSub.lineItems.find(
              (li: any) => li.plan.interval === "USAGE"
            );

            if (usageItem) {
              await billing.requestUsageCharge({
                lineItemId: usageItem.id,
                description: `Overage try-on fee (Try-on #${count})`,
                price: 0.08,
                currencyCode: "USD",
              });
            }
          }
        } catch (err) {
          console.error("[Billing Overage Error]:", err);
        }
      })();
      // ───────────────────────────────────────────────────────────────────────

      return json(data);
    } catch (err: any) {
      console.error("[Proxy Action Error]:", err.message);
      return json({ error: "Failed to process try-on" }, { status: 502 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
}
