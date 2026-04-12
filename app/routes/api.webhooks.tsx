// app/routes/api.webhooks.tsx
// Handles all required GDPR and app lifecycle webhooks.
// Data deletion is handled by Firebase — we simply acknowledge receipt with 200.

import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // We store only hashed IPs / anonymous session IDs — no PII to return.
      console.log(`[GDPR] customers/data_request for shop=${shop}`);
      return new Response("ok", { status: 200 });

    case "CUSTOMERS_REDACT":
      // Firebase handles actual data deletion.
      console.log(`[GDPR] customers/redact for shop=${shop}`);
      return new Response("ok", { status: 200 });

    case "SHOP_REDACT":
      // Shop uninstalled 48h+ ago — Firebase handles deletion.
      console.log(`[GDPR] shop/redact for shop=${shop}`);
      return new Response("ok", { status: 200 });

    default:
      return new Response("ok", { status: 200 });
  }
}
