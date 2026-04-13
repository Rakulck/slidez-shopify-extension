import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Checkbox,
  Button,
  Text,
  ColorPicker,
  RangeSlider,
  hsbToHex,
  hexToRgb,
  Divider,
  Badge,
  type HSBAColor,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
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

  const config = await prisma.merchantConfig.findUnique({ where: { shop } });

  return json({ config, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  await prisma.merchantConfig.upsert({
    where: { shop },
    update: {
      buttonText: String(formData.get("buttonText") ?? "Try It On"),
      buttonColor: String(formData.get("buttonColor") ?? "#000000"),
      buttonPosition: String(formData.get("buttonPosition") ?? "below-add-to-cart"),
      borderRadius: Number(formData.get("borderRadius") ?? 8),
      fullWidth: formData.get("fullWidth") === "true",
      showWatermark: formData.get("showWatermark") === "true",
    },
    create: {
      shop,
      buttonText: String(formData.get("buttonText") ?? "Try It On"),
      buttonColor: String(formData.get("buttonColor") ?? "#000000"),
      buttonPosition: String(formData.get("buttonPosition") ?? "below-add-to-cart"),
      borderRadius: Number(formData.get("borderRadius") ?? 8),
      fullWidth: formData.get("fullWidth") === "true",
      showWatermark: formData.get("showWatermark") === "true",
    },
  });

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

  const [buttonText, setButtonText] = useState(config?.buttonText ?? "Try It On");
  const [buttonColor, setButtonColor] = useState(config?.buttonColor ?? "#000000");
  const [buttonPosition, setButtonPosition] = useState<
    "below-add-to-cart" | "above-add-to-cart" | "floating-corner"
  >((config?.buttonPosition as any) ?? "below-add-to-cart");
  const [borderRadius, setBorderRadius] = useState(config?.borderRadius ?? 8);
  const [fullWidth, setFullWidth] = useState(config?.fullWidth ?? true);
  const [showWatermark, setShowWatermark] = useState(config?.showWatermark ?? true);
  const [colorHsb, setColorHsb] = useState<HSBAColor>(() =>
    hexToHsb(config?.buttonColor ?? "#000000"),
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
        borderRadius: String(borderRadius),
        fullWidth: String(fullWidth),
        showWatermark: String(showWatermark),
      },
      { method: "post" },
    );
    shopify.toast.show("Settings saved");
  };

  const borderRadiusLabel =
    borderRadius === 0
      ? "Square"
      : borderRadius <= 4
        ? "Slightly rounded"
        : borderRadius <= 12
          ? "Rounded"
          : borderRadius <= 20
            ? "Very rounded"
            : "Pill";

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        {/* ── Left: Settings form ── */}
        <Layout.Section>
          <BlockStack gap="500">

            {/* Button Appearance */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Button Appearance
                  </Text>
                  <Badge tone="info">Live preview →</Badge>
                </InlineStack>

                <TextField
                  label="Button text"
                  value={buttonText}
                  onChange={setButtonText}
                  autoComplete="off"
                  helpText="Shown on the try-on button in your storefront."
                />

                {/* Color picker */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Button color
                  </Text>
                  <InlineStack gap="300" blockAlign="center">
                    <button
                      type="button"
                      onClick={() => setShowColorPicker((v) => !v)}
                      aria-label="Pick button color"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: buttonColor,
                        border: "2px solid #c9cccf",
                        cursor: "pointer",
                        flexShrink: 0,
                        outline: "none",
                      }}
                    />
                    <Text as="span" variant="bodyMd" tone="subdued">
                      {buttonColor.toUpperCase()}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {showColorPicker ? "Click swatch to close" : "Click swatch to edit"}
                    </Text>
                  </InlineStack>
                  {showColorPicker && (
                    <div style={{ maxWidth: 220, paddingTop: 4 }}>
                      <ColorPicker color={colorHsb} onChange={handleColorChange} />
                    </div>
                  )}
                </BlockStack>

                {/* Border radius */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Corner style
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {borderRadiusLabel} ({borderRadius}px)
                    </Text>
                  </InlineStack>
                  <RangeSlider
                    label="Border radius"
                    labelHidden
                    min={0}
                    max={24}
                    step={2}
                    value={borderRadius}
                    onChange={(v) => setBorderRadius(Number(v))}
                    output
                  />
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Square</Text>
                    <Text as="span" variant="bodySm" tone="subdued">Pill</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Layout & Placement */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Layout &amp; Placement
                </Text>

                <Select
                  label="Button position"
                  options={POSITION_OPTIONS}
                  value={buttonPosition}
                  onChange={(v) => setButtonPosition(v as typeof buttonPosition)}
                  helpText="Where the try-on button appears relative to Add to Cart."
                />

                <Divider />

                <Checkbox
                  label="Match Add to Cart width"
                  helpText="Button stretches to the same width as your Add to Cart button."
                  checked={fullWidth}
                  onChange={setFullWidth}
                />
              </BlockStack>
            </Card>

            {/* Privacy */}
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

            {/* Save */}
            <InlineStack align="end">
              <Button
                onClick={handleSave}
                loading={isSaving}
                variant="primary"
                size="large"
              >
                Save settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>

        {/* ── Right: Live preview ── */}
        <Layout.Section variant="oneThird">
          <div style={{ position: "sticky", top: 16 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Live Preview
                  </Text>
                  <Badge tone="success">Real-time</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Updates instantly as you change settings.
                </Text>
                <WidgetPreview
                  buttonText={buttonText}
                  buttonColor={buttonColor}
                  buttonPosition={buttonPosition}
                  borderRadius={borderRadius}
                  fullWidth={fullWidth}
                />
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  These settings apply to your storefront automatically after saving — no theme editor changes needed.
                </Text>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
