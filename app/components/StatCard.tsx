import { Card, BlockStack, Text } from "@shopify/polaris";
import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number | ReactNode;
  trend?: string;
  trendTone?: "success" | "critical";
  footnote?: string;
}

export function StatCard({ title, value, trend, trendTone, footnote }: StatCardProps) {
  const isReactNode = typeof value !== "string" && typeof value !== "number";

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">
          {title}
        </Text>
        {isReactNode ? (
          <div>{value}</div>
        ) : (
          <Text as="p" variant="heading2xl" fontWeight="bold">
            {String(value)}
          </Text>
        )}
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
