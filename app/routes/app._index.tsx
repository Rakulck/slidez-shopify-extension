import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
import { authenticate } from "../shopify.server";
import { firebaseGet } from "../utils/firebase-client";
import { StatCard } from "../components/StatCard";
import { PlanBadge } from "../components/PlanBadge";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

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

  return json({ config, analytics, shop });
};

export default function Dashboard() {
  const { config, analytics } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const monthlyUsage =
    (analytics as any)?.monthlyUsage?.[0]?.count ?? 0;
  const activeProducts =
    (analytics as any)?.topProducts?.length ?? 0;
  const planId = (config as any)?.planId ?? "free";
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
                <BlockStack gap="300">
                  {checklistItems.map((item) => (
                    <InlineStack key={item.label} gap="300" blockAlign="center">
                      <Icon
                        source={item.done ? CheckCircleIcon : MinusCircleIcon}
                        tone={item.done ? "success" : "subdued"}
                      />
                      <Text
                        as="span"
                        variant="bodyMd"
                        tone={item.done ? undefined : "subdued"}
                      >
                        {item.label}
                      </Text>
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
                  <Button onClick={() => navigate("/app/products")} fullWidth>
                    Configure Products
                  </Button>
                  <Button onClick={() => navigate("/app/analytics")} fullWidth>
                    View Analytics
                  </Button>
                  <Button onClick={() => navigate("/app/settings")} fullWidth>
                    Customize Widget
                  </Button>
                  <Button
                    onClick={() => navigate("/app/billing")}
                    variant="primary"
                    fullWidth
                  >
                    View Plans
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
