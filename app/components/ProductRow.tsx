import { useFetcher } from "@remix-run/react";
import { ResourceItem, InlineStack, Thumbnail, Text, Badge, Button } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

export interface ShopifyProduct {
  id: string;
  title: string;
  featuredImage?: { url: string } | null;
  enabled: boolean;
}

interface ProductRowProps {
  product: ShopifyProduct;
}

export function ProductRow({ product }: ProductRowProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  // Optimistic toggle
  const enabled =
    fetcher.formData
      ? fetcher.formData.get("enabled") === "true"
      : product.enabled;

  return (
    <ResourceItem id={product.id} onClick={() => {}}>
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <InlineStack gap="400" blockAlign="center">
          <Thumbnail
            source={product.featuredImage?.url ?? ImageIcon}
            alt={product.title}
            size="small"
          />
          <Text as="span" variant="bodyMd" fontWeight="medium">
            {product.title}
          </Text>
        </InlineStack>
        <InlineStack gap="300" blockAlign="center">
          <Badge tone={enabled ? "success" : undefined}>
            {enabled ? "Try-on on" : "Try-on off"}
          </Badge>
          <fetcher.Form method="post">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <Button
              loading={isSubmitting}
              submit
              variant={enabled ? "secondary" : "primary"}
              size="slim"
            >
              {enabled ? "Disable" : "Enable"}
            </Button>
          </fetcher.Form>
        </InlineStack>
      </InlineStack>
    </ResourceItem>
  );
}
