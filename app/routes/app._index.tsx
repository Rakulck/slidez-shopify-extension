import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Button,
  InlineStack,
  Icon,
} from "@shopify/polaris";
import { CheckCircleIcon, MinusCircleIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate, MONTHLY_PLAN_GROWTH, MONTHLY_PLAN_PRO, MONTHLY_PLAN_ENTERPRISE } from "../shopify.server";
import { firebaseGet } from "../utils/firebase-client";
import prisma from "../db.server";
import { StatCard } from "../components/StatCard";
import { PlanBadge } from "../components/PlanBadge";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  const billingCheck = await billing.check({
    plans: [MONTHLY_PLAN_GROWTH, MONTHLY_PLAN_PRO, MONTHLY_PLAN_ENTERPRISE],
    isTest: true, // Set to false in production
  });

  const merchantOnboarding = await prisma.merchantConfig.findUnique({
    where: { shop },
    select: { onboardingComplete: true },
  });
  
  if (!merchantOnboarding || !merchantOnboarding.onboardingComplete) {
    const url = new URL(request.url);
    throw redirect(`/app/onboarding${url.search}`);
  }

  let currentPlan = "free";
  if (billingCheck.hasActivePayment) {
    currentPlan = billingCheck.appSubscriptions[0].name.toLowerCase();
  }

  let config: Record<string, unknown> = {};
  let analytics: Record<string, unknown> = {};

  try {
    [config, analytics] = await Promise.all([
      firebaseGet("/api/merchant/config", shop),
      firebaseGet("/api/analytics?months=1", shop),
    ]);
  } catch {
    // Firebase not connected yet — show empty states
  }

  const enabledCount = await prisma.productState.count({
    where: { shop, enabled: true },
  });

  return json({ config, analytics, shop, enabledCount, currentPlan });
};

export default function Dashboard() {
  const { config, analytics, shop, enabledCount, currentPlan } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const nav = (path: string) => {
    navigate(path);
  };

  const monthlyUsage =
    (analytics as any)?.monthlyUsage?.[0]?.count ?? 0;
  const activeProducts = enabledCount;
  const planId = currentPlan;
  const buttonText = (config as any)?.buttonText ?? "";
  const hasActiveProducts = activeProducts > 0;
  const hasCustomizedWidget = buttonText !== "" && buttonText !== "Try It On";
  const isUpgraded = planId !== "free";

  const checklistItems = [
    { label: "App installed", done: true },
    { label: "Products enabled", done: hasActiveProducts },
    { label: "Widget customized", done: hasCustomizedWidget },
    { label: "Plan upgraded", done: isUpgraded },
  ];

  return (
    <Page>
      <TitleBar title="Dashboard" />
      <BlockStack gap="500">
        {/* Brand header */}
        <div style={{
          background: "#010302",
          borderRadius: 16,
          padding: "28px 0",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}>
          <img src="/logo.png" alt="Slidez" style={{ height: 200, width: "auto" }} />
        </div>

        {/* Stat Cards */}
        <InlineGrid columns={3} gap="400">
          <StatCard
            title="Try-ons This Month"
            value={monthlyUsage}
          />
          <StatCard
            title="Active Products"
            value={activeProducts}
          />
          <StatCard
            title="Current Plan"
            value={<PlanBadge planId={planId} /> as any}
          />
        </InlineGrid>

        <Layout>
          <Layout.Section>
            {/* Setup Checklist */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Setup checklist
                </Text>
                <BlockStack gap="400">
                  {checklistItems.map((item) => (
                    <InlineStack key={item.label} gap="400" blockAlign="center" align="space-between">
                      <Text
                        as="span"
                        variant="bodyMd"
                        tone={item.done ? undefined : "subdued"}
                      >
                        {item.label}
                      </Text>
                      <div style={{ width: 24 }}>
                        <Icon
                          source={item.done ? CheckCircleIcon : MinusCircleIcon}
                          tone={item.done ? "success" : "subdued"}
                        />
                      </div>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            {/* Quick Links */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Quick links
                </Text>
                <BlockStack gap="300">
                  <Button
                    url={`https://${shop}/admin/themes/current/editor?context=apps&activateAppId=72f82a63b0e306e2138f3fcc90cdd779/virtual-tryon-widget`}
                    target="_top"
                    variant="primary"
                    fullWidth
                    onClick={() => console.log("[Dashboard] Theme Editor clicked")}
                  >
                    Enable in Theme Editor
                  </Button>
                  <Button onClick={() => {
                    console.log("[Dashboard] Configure Products clicked");
                    nav("/app/products");
                  }} fullWidth>
                    Configure Products
                  </Button>
                  <Button onClick={() => {
                    console.log("[Dashboard] View Analytics clicked");
                    nav("/app/analytics");
                  }} fullWidth>
                    View Analytics
                  </Button>
                  <Button onClick={() => {
                    console.log("[Dashboard] Customize Widget clicked");
                    nav("/app/settings");
                  }} fullWidth>
                    Customize Widget
                  </Button>
                  <Button onClick={() => {
                    console.log("[Dashboard] Billing clicked");
                    nav("/app/billing");
                  }} fullWidth>
                    Manage Subscription
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Help / Vintage Themes */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Vintage / Non-OS2 Themes
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Using a theme without App Blocks (e.g. Debut, Brooklyn, Narrative)? Paste the snippet below into your <Text as="span" fontWeight="bold">product.liquid</Text> or <Text as="span" fontWeight="bold">main-product.liquid</Text> file, just after your Add to Cart button.
                </Text>
                <div style={{
                  background: "#F3F4F6",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "#374151",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  userSelect: "all",
                }}>
                  {`<div id="slidez-tryon-root"
  data-product-id="{{ product.id }}"
  data-shop="{{ shop.permanent_domain }}"
  data-country="{{ localization.country.iso_code }}">
</div>
<script src="{{ 'tryon-widget.js' | asset_url }}" defer></script>`}
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Select all the text above, copy it, then paste it in the Shopify code editor. Need help? Contact us.
                </Text>
                <Button
                  variant="tertiary"
                  url="mailto:info@slidez.social?subject=Vintage Theme Setup Help"
                  fullWidth
                >
                  Contact Support
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
