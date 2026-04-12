import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  ResourceList,
  BlockStack,
  Text,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProductRow } from "../components/ProductRow";
import type { ShopifyProduct } from "../components/ProductRow";

const PRODUCTS_QUERY = `#graphql
  query {
    products(first: 50) {
      nodes {
        id
        title
        featuredImage {
          url
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch Shopify products
  const gqlResponse = await admin.graphql(PRODUCTS_QUERY);
  const gqlJson = await gqlResponse.json();
  const shopifyProducts: { id: string; title: string; featuredImage?: { url: string } | null }[] =
    gqlJson.data?.products?.nodes ?? [];

  // Fetch enabled states from local DB
  const dbProducts = await prisma.productState.findMany({ where: { shop } });
  const enabledSet = new Set(
    dbProducts.filter((p) => p.enabled).map((p) => p.productId),
  );

  const products: ShopifyProduct[] = shopifyProducts.map((p) => ({
    id: p.id,
    title: p.title,
    featuredImage: p.featuredImage,
    enabled: enabledSet.has(p.id),
  }));

  return json({ products, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const productId = String(formData.get("productId") ?? "");
  const enabled = formData.get("enabled") === "true";

  await prisma.productState.upsert({
    where: { shop_productId: { shop, productId } },
    update: { enabled },
    create: { shop, productId, enabled },
  });

  return json({ success: true });
};

export default function Products() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Products" />
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd" tone="subdued">
          Enable virtual try-on for specific products in your store.
        </Text>
        <Card padding="0">
          {products.length === 0 ? (
            <EmptyState
              heading="No products found"
              image=""
            >
              <Text as="p" variant="bodyMd">
                Add products to your Shopify store to enable try-on.
              </Text>
            </EmptyState>
          ) : (
            <ResourceList
              items={products}
              renderItem={(product) => <ProductRow product={product} />}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
