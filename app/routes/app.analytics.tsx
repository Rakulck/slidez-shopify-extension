import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  EmptyState,
  DataTable,
  ResourceList,
  ResourceItem,
  InlineStack,
  Thumbnail,
  Badge,
  Select,
  ProgressBar,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { firebaseGet } from "../utils/firebase-client";
import { StatCard } from "../components/StatCard";

interface TopProduct {
  productId: string;
  count: number;
  title?: string;
  featuredImage?: { url: string } | null;
}

interface BestDay {
  day: string;
  count: number;
}

interface AnalyticsData {
  totalTryOnsThisMonth: number;
  totalTryOnsPrevMonth: number;
  cartAddRate: number | null;
  cartAddRatePrevPeriod: number | null;
  deviceSplit: {
    mobile: number;
    desktop: number;
  };
  activeProductsCount: number;
  topProducts: TopProduct[];
  monthlyUsage: Array<{ month: string; count: number }>;
  bestDays: BestDay[];
}

interface LoaderData {
  paywalled: boolean;
  empty?: boolean;
  range?: string;
  analytics?: AnalyticsData;
}

const PRODUCTS_BY_IDS_QUERY = `#graphql
  query getProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url
          altText
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get range from URL params
  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "30";





  // TEMP: Bypass paywall for testing
  // Check if user has access to analytics (Pro or Enterprise only)
  // if (planId === "free" || planId === "growth") {
  //   return json<LoaderData>({ paywalled: true, range });
  // }

  // Fetch analytics data from Firebase
  let analytics: Record<string, unknown> = {};
  try {
    analytics = await firebaseGet(`/analytics?range=${range}`, shop);
    console.log("DEBUG: Analytics data received for", shop, ":", analytics);
  } catch (err: any) {
    console.error("DEBUG: Failed to reach Analytics API:", err.message);
  }

  const totalTryOnsThisMonth = (analytics as any)?.totalTryOnsThisMonth ?? 0;
  const monthlyUsage = (analytics as any)?.monthlyUsage ?? [];

  // Show empty state when there is genuinely no data yet
  if (totalTryOnsThisMonth === 0 && monthlyUsage.length === 0) {
    return json<LoaderData>({ paywalled: false, empty: true, range });
  }

  // Enrich topProducts with Shopify data
  const topProductIds = ((analytics as any)?.topProducts ?? [])
    .map((p: any) => {
      const pid = String(p.productId);
      return pid.startsWith("gid://") ? pid : `gid://shopify/Product/${pid}`;
    });

  let enrichedProducts: TopProduct[] = ((analytics as any)?.topProducts ?? []);

  if (topProductIds.length > 0) {
    try {
      const gqlResponse = await admin.graphql(PRODUCTS_BY_IDS_QUERY, {
        variables: { ids: topProductIds },
      });
      const gqlJson = await gqlResponse.json();
      const shopifyProducts: Record<string, any> = {};
      (gqlJson.data?.nodes ?? []).forEach((product: any) => {
        if (product) {
          shopifyProducts[product.id] = {
            title: product.title,
            featuredImage: product.featuredImage,
          };
        }
      });

      enrichedProducts = enrichedProducts.map((p) => {
        const gid = String(p.productId).startsWith("gid://") 
          ? String(p.productId) 
          : `gid://shopify/Product/${p.productId}`;
          
        return {
          ...p,
          title: shopifyProducts[gid]?.title ?? "Deleted product",
          featuredImage: shopifyProducts[gid]?.featuredImage ?? null,
        };
      });
    } catch (err: unknown) {
      // GraphQL error — still return the products with limited info
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("DEBUG: GraphQL product enrichment failed:", errorMessage);
      enrichedProducts = enrichedProducts.map((p) => ({
        ...p,
        title: p.title ?? "Unknown product",
      }));
    }
  }

  const processedAnalytics: AnalyticsData = {
    totalTryOnsThisMonth: (analytics as any)?.totalTryOnsThisMonth ?? 0,
    totalTryOnsPrevMonth: (analytics as any)?.totalTryOnsPrevMonth ?? 0,
    cartAddRate: (analytics as any)?.cartAddRate ?? null,
    cartAddRatePrevPeriod: (analytics as any)?.cartAddRatePrevPeriod ?? null,
    deviceSplit: (analytics as any)?.deviceSplit ?? { mobile: 0, desktop: 0 },
    topProducts: enrichedProducts,
    monthlyUsage: (analytics as any)?.monthlyUsage ?? [],
    bestDays: (analytics as any)?.bestDays ?? [],
  };

  return json<LoaderData>({
    paywalled: false,
    empty: false,
    range,
    analytics: processedAnalytics,
  });
};

function calculateTrend(
  current: number,
  previous: number,
): { trend: string; tone: "success" | "critical" } | null {
  if (previous === 0) return null;
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent * 10) / 10;
  return {
    trend: `${rounded > 0 ? "+" : ""}${rounded}% vs last period`,
    tone: rounded > 0 ? "success" : "critical",
  };
}

export default function Analytics() {  const { paywalled, empty, range = "30", analytics } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const currentRange = fetcher.formData?.get("range") ?? range;

  if (paywalled || !analytics) {
    if (paywalled) {
      return (
        <Page>
          <TitleBar title="Analytics" />
          <EmptyState
            heading="Upgrade to Pro to unlock Analytics"
            action={{
              content: "View Plans",
              url: "/app/billing",
            }}
          >
            <Text as="p" variant="bodyMd">
              See which products drive the most try-ons, track usage trends, and
              find your best days to run promotions.
            </Text>
          </EmptyState>
        </Page>
      );
    }
    return null;
  }

  if (empty) {
    return (
      <Page>
        <TitleBar title="Analytics" />
        <EmptyState
          heading="No data yet"
          action={{
            content: "Enable Products",
            url: "/app/products",
          }}
        >
          <Text as="p" variant="bodyMd">
            Once shoppers start using the try-on widget your stats appear here.
            Make sure the widget is enabled on at least one product.
          </Text>
        </EmptyState>
      </Page>
    );
  }

  // Destructure with fallbacks to avoid "not defined" errors
  const {
    totalTryOnsThisMonth = 0,
    totalTryOnsPrevMonth = 0,
    activeProductsCount = 0,
    deviceSplit = { mobile: 0, desktop: 0 },
    bestDays = [],
    topProducts = []
  } = analytics;

  const tryOnTrend = calculateTrend(totalTryOnsThisMonth, totalTryOnsPrevMonth) ?? undefined;
  const maxDayCount = bestDays.length > 0 ? Math.max(...bestDays.map((d) => d.count)) : 0;


  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        {/* Date Range Selector */}
        <InlineStack align="end">
          <fetcher.Form method="get" style={{ width: 200 }}>
            <Select
              label="Date range"
              labelInline
              options={[
                { label: "Last 7 days", value: "7" },
                { label: "Last 30 days", value: "30" },
                { label: "Last 90 days", value: "90" },
              ]}
              value={String(currentRange)}
              onChange={(val) =>
                fetcher.submit({ range: val }, { method: "get" })
              }
            />
          </fetcher.Form>
        </InlineStack>

        {/* Stat Cards Row 1 */}
        <InlineGrid columns={3} gap="400">
          <StatCard
            title="Try-ons This Month"
            value={totalTryOnsThisMonth}
            trend={tryOnTrend?.trend}
            trendTone={tryOnTrend?.tone}
          />

          {/* Active Products */}
          <StatCard
            title="Active Products"
            value={activeProductsCount}
            footnote="Unique products tried on this period"
          />

          {/* Mobile vs Desktop */}
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                Mobile vs Desktop
              </Text>
              <Text as="p" variant="heading2xl" fontWeight="bold">
                {Math.round(deviceSplit.mobile * 100)}% Mobile
              </Text>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <div style={{ flex: 1 }}>
                    <ProgressBar progress={deviceSplit.mobile} />
                  </div>
                  <Text as="span" variant="bodySm">
                    {Math.round(deviceSplit.mobile * 100)}%
                  </Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <div style={{ flex: 1 }}>
                    <ProgressBar progress={deviceSplit.desktop} />
                  </div>
                  <Text as="span" variant="bodySm">
                    {Math.round(deviceSplit.desktop * 100)}%
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Top Products */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Top Products by Try-On
                </Text>
                {topProducts && topProducts.length > 0 ? (
                  <ResourceList
                    items={topProducts}
                    renderItem={(product) => (
                      <ResourceItem id={product.productId}>
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                          gap="400"
                        >
                          <InlineStack gap="400" blockAlign="center">
                            <Thumbnail
                              source={
                                product.featuredImage?.url ?? ImageIcon
                              }
                              alt={product.title ?? "Product"}
                              size="small"
                            />
                            <Text
                              as="span"
                              variant="bodyMd"
                              tone={
                                product.title === "Deleted product"
                                  ? "subdued"
                                  : undefined
                              }
                            >
                              {product.title ?? "Unknown product"}
                            </Text>
                          </InlineStack>
                          <Badge>{product.count} try-ons</Badge>
                        </InlineStack>
                      </ResourceItem>
                    )}
                  />
                ) : (
                  <EmptyState heading="No product data yet" image="" />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Try-ons Over Time */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Try-ons Over Time
                </Text>
                {analytics.monthlyUsage && analytics.monthlyUsage.length > 0 ? (
                  <BlockStack gap="300">
                    <DataTable
                      columnContentTypes={["text", "numeric"]}
                      headings={["Month", "Try-ons"]}
                      rows={analytics.monthlyUsage.map((usage) => [
                        usage.month,
                        String(usage.count),
                      ])}
                    />
                    {analytics.monthlyUsage.length === 1 && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        More trends will appear as data builds up
                      </Text>
                    )}
                  </BlockStack>
                ) : (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No monthly data available.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Best Days */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Best Days to Run Promotions
                </Text>
                {analytics.bestDays && analytics.bestDays.length > 0 ? (
                  <BlockStack gap="300">
                    {analytics.bestDays.map(({ day, count }) => {
                      const pct =
                        maxDayCount > 0
                          ? Math.round((count / maxDayCount) * 100)
                          : 0;
                      return (
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                          key={day}
                          gap="300"
                        >
                          <div style={{ width: 90 }}>
                            <Text variant="bodySm">{day}</Text>
                          </div>
                          <div
                            style={{
                              flex: 1,
                              height: 20,
                              background: "#E4E5E7",
                              borderRadius: 4,
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: "var(--p-color-bg-fill-brand)",
                                borderRadius: 4,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                          <Text variant="bodySm" fontWeight="medium">
                            {count}
                          </Text>
                        </InlineStack>
                      );
                    })}
                  </BlockStack>
                ) : (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No daily data available yet.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
