import { Card, BlockStack, Text, InlineStack } from "@shopify/polaris";

interface StatCardProps {
  title: string;
  value: string | number | React.ReactNode;
  trend?: string;
  trendTone?: "success" | "critical";
  footnote?: string;
}

export function StatCard({ title, value, trend, trendTone, footnote }: StatCardProps) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">
          {title}
        </Text>
        <Text as="p" variant="heading2xl" fontWeight="bold">
          {String(value)}
        </Text>
        {trend && (
          <Text as="p" variant="bodySm" tone={trendTone ?? "subdued"}>
            {trend}
          </Text>
        )}
        {footnote && (
          <Text as="p" variant="bodySm" tone="subdued">
            {footnote}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
