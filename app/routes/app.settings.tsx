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
  hsbToHex,
  hexToRgb,
  Divider,
  Badge,
  type HSBAColor,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
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

  const config = await prisma.merchantConfig.findUnique({ where: { shop } });
  
  // Fetch Slidez Account info from Firestore
  let merchantInfo = { slidez_uid: "" };
  try {
    const data = await firebaseGet("/details", shop);
    console.log("DEBUG: Fetched merchant data for", shop, ":", data);
    if (data && (data.slidez_uid || data.slidezUserId)) {
      merchantInfo.slidez_uid = data.slidez_uid || data.slidezUserId;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("DEBUG: Failed to reach Firebase /details API:", msg);
  }

  return json({
    config,
    slidezUserId: merchantInfo.slidez_uid,
    shop 
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const slidezUserId = String(formData.get("slidezUserId") ?? "");
  const intent = formData.get("intent");

  let firebaseResult = null;
  // Link merchant in Firestore
  if (slidezUserId) {
    try {
      firebaseResult = await firebasePost("/linkMerchant", { shop, slidezUserId });
      console.log("DEBUG: linkMerchant result:", firebaseResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("DEBUG: Failed to reach Firebase /linkMerchant:", msg);
      firebaseResult = { error: msg };
    }
  }

  // If this was just an account link, return the firebase result to the UI
  if (intent === "link_account") {
    return json({ success: true, firebaseResult });
  }

  // Handle Unlinking
  if (intent === "unlink_account") {
    try {
      await firebasePost("/linkMerchant", { shop, slidezUserId: "" }); // Clear the ID
      return json({ success: true, unlinked: true });
    } catch (err) {
      return json({ success: false, error: "Failed to unlink" });
    }
  }

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
];

export default function Settings() {
  const { config, slidezUserId: initialSlidezUserId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [buttonText, setButtonText] = useState(config?.buttonText ?? "Try It On");
  const [buttonColor, setButtonColor] = useState(config?.buttonColor ?? "#000000");
  const [buttonPosition, setButtonPosition] = useState<
    "below-add-to-cart" | "above-add-to-cart"
  >((config?.buttonPosition as any) ?? "below-add-to-cart");
  const [cornerStyle, setCornerStyle] = useState<"square" | "rounded">((config?.borderRadius === 0 ? "square" : "rounded") as "square" | "rounded");
  const [showWatermark, setShowWatermark] = useState(config?.showWatermark ?? true);
  const [slidezUserId, setSlidezUserId] = useState(initialSlidezUserId ?? "");
  const [colorHsb, setColorHsb] = useState<HSBAColor>(() =>
    hexToHsb(config?.buttonColor ?? "#000000"),
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [slidezEmail, setSlidezEmail] = useState("");
  const [slidezPassword, setSlidezPassword] = useState("");
  const [loginError, setLoginError] = useState(false);

  // ── Firebase Auth Login ──────────────────────────────────────────────────
  const handleConnect = async () => {
    setLoginError(false);
    if (!slidezEmail || !slidezPassword) {
      shopify.toast.show("Please enter both email and password", { isError: true });
      return;
    }

    // We load Firebase from CDN to avoid needing local npm installs
    const module = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");

    const firebaseConfig = {
      apiKey: "AIzaSyBmbOoNdL0ikJ_o3gqO_yu_U78CwD7UwUI",
      authDomain: "slidez-be88c.firebaseapp.com",
      projectId: "slidez-be88c",
    };

    const app = module.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);

    try {
      const result = await authModule.signInWithEmailAndPassword(auth, slidezEmail, slidezPassword);
      const user = result.user;
      setSlidezUserId(user.uid);
      setSlidezEmail("");
      setSlidezPassword("");
      
      // Auto-save ONLY the connection immediately after login
      fetcher.submit(
        {
          intent: "link_account",
          slidezUserId: user.uid,
        },
        { method: "post" }
      );

      shopify.toast.show("Account linked and saved!");
    } catch (error: any) {
      console.error("Login failed:", error);
      setLoginError(true);
      shopify.toast.show("Login failed: " + error.message, { isError: true });
    }
  };

  const handleDisconnect = () => {
    setSlidezUserId("");
    fetcher.submit(
      { intent: "unlink_account" },
      { method: "post" }
    );
    shopify.toast.show("Account signed out");
  };

  const isSaving = fetcher.state !== "idle";

  const handleColorChange = useCallback((hsb: HSBAColor) => {
    setColorHsb(hsb);
    setButtonColor(hsbToHex(hsb));
  }, []);

  const handleSave = () => {
    const borderRadiusValue = cornerStyle === "square" ? 0 : 6;
    fetcher.submit(
      {
        buttonText,
        buttonColor,
        buttonPosition,
        borderRadius: String(borderRadiusValue),
        fullWidth: "true",
        showWatermark: String(showWatermark),
        slidezUserId: slidezUserId,
      },
      { method: "post" },
    );
    shopify.toast.show("Settings saved");
  };


  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        {/* ── Left: Settings form ── */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Account Connection */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Slidez Account Connection
                </Text>
                
                {slidezUserId ? (
                  // CONNECTED VIEW
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      Your Shopify store is securely linked to your Slidez account.
                    </Text>
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone="success">
                        Connected (ID: {slidezUserId.substring(0, 6)}...{slidezUserId.substring(slidezUserId.length - 4)})
                      </Badge>
                      <Button variant="secondary" tone="critical" onClick={handleDisconnect}>
                        Sign Out
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  // LOGIN VIEW
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      Log in to your Slidez account to unlock analytics and sync your store settings.
                    </Text>
                    <TextField
                      label="Email"
                      type="email"
                      value={slidezEmail}
                      onChange={(v) => { setSlidezEmail(v); setLoginError(false); }}
                      autoComplete="email"
                      placeholder="your@email.com"
                      error={loginError}
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={slidezPassword}
                      onChange={(v) => { setSlidezPassword(v); setLoginError(false); }}
                      autoComplete="current-password"
                      error={loginError ? "Check your credentials" : false}
                    />
                    
                    <InlineStack gap="300" blockAlign="center">
                      <Button
                        variant="primary"
                        onClick={handleConnect}
                        loading={fetcher.state !== "idle"}
                      >
                        Connect Account
                      </Button>
                      <Badge tone="attention">Not Connected</Badge>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

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

                {/* Corner style */}
                <Select
                  label="Corner style"
                  options={[
                    { label: "Square", value: "square" },
                    { label: "Rounded", value: "rounded" },
                  ]}
                  value={cornerStyle}
                  onChange={(v) => setCornerStyle(v as "square" | "rounded")}
                />
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
          <div style={{ position: "sticky", top: 16, marginTop: -160 }}>
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
                  borderRadius={cornerStyle === "square" ? 0 : 6}
                  fullWidth={true}
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
