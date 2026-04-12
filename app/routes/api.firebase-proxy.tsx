// app/routes/api.firebase-proxy.tsx
// Public Shopify App Proxy route — no admin auth required.
// Shopify verifies the HMAC and forwards /apps/try-on/* requests here.
// This route adds the Firebase auth header and proxies the request.

import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
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
      const data = await firebasePost("/api/tryon/process", { shop, ...rest });
      return json(data);
    } catch {
      return json({ error: "Failed to reach Firebase" }, { status: 502 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
}
