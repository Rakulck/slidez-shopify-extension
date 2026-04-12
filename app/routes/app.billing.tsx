import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  InlineGrid,
  Card,
  BlockStack,
  Text,
  Button,
  List,
  Divider,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { firebaseGet, firebasePost } from "../utils/firebase-client";
import { PlanBadge } from "../components/PlanBadge";

interface Plan {
  id: string;
  name: string;
  price: number;
  trialDays?: number;
  features: string[];
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    features: ["50 try-ons/month", "5 products", "Watermark on results"],
  },
  {
    id: "growth",
    name: "Growth",
    price: 19.99,
    trialDays: 14,
    features: [
      "500 try-ons/month",
      "Unlimited products",
      "No watermark",
      "14-day free trial",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 49.99,
    trialDays: 14,
    features: [
      "2,000 try-ons/month",
      "Analytics dashboard",
      "Priority support",
      "14-day free trial",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 149.99,
    features: [
      "Unlimited try-ons",
      "API access",
      "White-label option",
      "SLA guarantee",
    ],
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let currentPlan = "free";
  let plans: Plan[] = FALLBACK_PLANS;

  try {
    const fb = await firebaseGet("/api/billing/plans", shop);
    if (fb?.currentPlan) currentPlan = fb.currentPlan;
    if (Array.isArray(fb?.plans) && fb.plans.length > 0) plans = fb.plans;
  } catch {
    // Firebase not connected — use fallback plans
  }

  return json({ currentPlan, plans, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const planId = String(formData.get("planId") ?? "");

  try {
    const result = await firebasePost("/api/billing/subscribe", { shop, planId });
    if (result?.confirmationUrl) {
      return redirect(result.confirmationUrl);
    }
  } catch {
    // Firebase not connected
  }

  return json({ success: true });
};

export default function Billing() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const upgradingPlanId =
    fetcher.state !== "idle" ? fetcher.formData?.get("planId") : null;

  return (
    <Page>
      <TitleBar title="Plans & Billing" />
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Current plan:{" "}
            <PlanBadge planId={currentPlan} />
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Upgrade anytime — changes take effect immediately.
          </Text>
        </BlockStack>

        <InlineGrid columns={4} gap="400">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isUpgrading = upgradingPlanId === plan.id;

            return (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingMd">
                      {plan.name}
                    </Text>
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      ${plan.price}
                      <Text as="span" variant="bodyMd" tone="subdued">
                        /mo
                      </Text>
                    </Text>
                    {plan.trialDays && (
                      <Badge tone="info">{plan.trialDays}-day free trial</Badge>
                    )}
                  </BlockStack>

                  <Divider />

                  <List type="bullet">
                    {plan.features.map((f) => (
                      <List.Item key={f}>{f}</List.Item>
                    ))}
                  </List>

                  <fetcher.Form method="post">
                    <input type="hidden" name="planId" value={plan.id} />
                    <Button
                      submit
                      variant={isCurrent ? "secondary" : "primary"}
                      disabled={isCurrent}
                      loading={isUpgrading}
                      fullWidth
                    >
                      {isCurrent ? "Current Plan" : "Upgrade"}
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
