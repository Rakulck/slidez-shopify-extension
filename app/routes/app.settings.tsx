import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Select,
  Checkbox,
  Button,
  InlineStack,
  Text,
  ColorPicker,
  hsbToHex,
  hexToRgb,
  type HSBAColor,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { firebaseGet, firebasePost } from "../utils/firebase-client";
import { WidgetPreview } from "../components/WidgetPreview";

function hexToHsb(hex: string): HSBAColor {
  const rgb = hexToRgb(hex) ?? { red: 0, green: 0, blue: 0 };
  const r = rgb.red / 255;
  const g = rgb.green / 255;
  const b = rgb.blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  return { hue: h, saturation: s, brightness: max, alpha: 1 };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let config: Record<string, unknown> = {};
  try {
    config = await firebaseGet("/api/merchant/config", shop);
  } catch {
    // Firebase not connected — use defaults
  }

  return json({ config, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const body = {
    shop,
    buttonText: String(formData.get("buttonText") ?? "Try It On"),
    buttonColor: String(formData.get("buttonColor") ?? "#000000"),
    buttonPosition: String(formData.get("buttonPosition") ?? "below-add-to-cart"),
    showWatermark: formData.get("showWatermark") === "true",
  };

  try {
    await firebasePost("/api/merchant/config", body);
  } catch {
    // Firebase not connected
  }

  return json({ success: true });
};

const POSITION_OPTIONS = [
  { label: "Below Add to Cart", value: "below-add-to-cart" },
  { label: "Above Add to Cart", value: "above-add-to-cart" },
  { label: "Floating Corner Button", value: "floating-corner" },
];

export default function Settings() {
  const { config } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [buttonText, setButtonText] = useState(
    String((config as any)?.buttonText ?? "Try It On"),
  );
  const [buttonColor, setButtonColor] = useState(
    String((config as any)?.buttonColor ?? "#000000"),
  );
  const [buttonPosition, setButtonPosition] = useState<
    "below-add-to-cart" | "above-add-to-cart" | "floating-corner"
  >((config as any)?.buttonPosition ?? "below-add-to-cart");
  const [showWatermark, setShowWatermark] = useState(
    Boolean((config as any)?.showWatermark ?? true),
  );
  const [colorHsb, setColorHsb] = useState<HSBAColor>(() =>
    hexToHsb(String((config as any)?.buttonColor ?? "#000000")),
  );
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isSaving = fetcher.state !== "idle";

  const handleColorChange = useCallback((hsb: HSBAColor) => {
    setColorHsb(hsb);
    setButtonColor(hsbToHex(hsb));
  }, []);

  const handleSave = () => {
    fetcher.submit(
      {
        buttonText,
        buttonColor,
        buttonPosition,
        showWatermark: String(showWatermark),
      },
      { method: "post" },
    );
    shopify.toast.show("Settings saved");
  };

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        {/* Left: Form */}
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Button Appearance
                </Text>

                <TextField
                  label="Button Text"
                  value={buttonText}
                  onChange={setButtonText}
                  autoComplete="off"
                />

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Button Color
                  </Text>
                  <InlineStack gap="300" blockAlign="center">
                    <div
                      onClick={() => setShowColorPicker((v) => !v)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        backgroundColor: buttonColor,
                        border: "1px solid #c9cccf",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <Text as="span" variant="bodyMd" tone="subdued">
                      {buttonColor.toUpperCase()}
                    </Text>
                  </InlineStack>
                  {showColorPicker && (
                    <div style={{ maxWidth: 220 }}>
                      <ColorPicker
                        color={colorHsb}
                        onChange={handleColorChange}
                      />
                    </div>
                  )}
                </BlockStack>

                <Select
                  label="Button Position"
                  options={POSITION_OPTIONS}
                  value={buttonPosition}
                  onChange={(v) => setButtonPosition(v as typeof buttonPosition)}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Privacy
                </Text>
                <Checkbox
                  label="Show watermark on results"
                  helpText="Watermark is always shown on the Free plan."
                  checked={showWatermark}
                  onChange={setShowWatermark}
                />
              </BlockStack>
            </Card>

            <Button onClick={handleSave} loading={isSaving} variant="primary">
              Save settings
            </Button>
          </BlockStack>
        </Layout.Section>

        {/* Right: Live Preview */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Preview
              </Text>
              <WidgetPreview
                buttonText={buttonText}
                buttonColor={buttonColor}
                buttonPosition={buttonPosition}
              />
              <Text as="p" variant="bodySm" tone="subdued">
                Preview updates as you change settings.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
