import { Card, BlockStack, Text, InlineStack } from "@shopify/polaris";

interface StatCardProps {
  title: string;
  value: string | number;
  trend?: string;
}

export function StatCard({ title, value, trend }: StatCardProps) {
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
          <Text as="p" variant="bodySm" tone="subdued">
            {trend}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
