import React, { useState, useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, Form } from "@remix-run/react";
import {
  Page,
  Text,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import styles from "../styles/app.onboarding.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type StoreType = "fashion" | "beauty" | "accessories" | "multi";
type PlanId = "growth" | "pro" | "enterprise";
type DemoPhase = "idle" | "uploading" | "processing" | "result";

interface OnboardingState {
  step: 1 | 2 | 3 | 4 | 5;
  storeType: StoreType | null;
  planChosen: PlanId | null;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconBack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 5l-7 7 7 7" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconCamera = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

const STORE_TYPES: { id: StoreType; label: string; icon: string }[] = [
  { id: "fashion", label: "Fashion & Clothing", icon: "👗" },
  { id: "beauty", label: "Beauty & Skincare", icon: "💄" },
  { id: "accessories", label: "Accessories", icon: "👜" },
  { id: "multi", label: "Multi-category", icon: "🛍️" },
];

const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  tryOns: string;
  overage?: string;
  recommended?: boolean;
  features: string[];
}[] = [
  {
    id: "growth",
    name: "Growth",
    price: 49,
    tryOns: "250",
    features: ["250 try-ons/month", "Unlimited products", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    tryOns: "500",
    recommended: true,
    features: ["500 try-ons/month", "Unlimited products", "No watermark", "Analytics"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 249,
    tryOns: "2,500",
    overage: "$0.08/try-on",
    features: ["2,500 try-ons/month", "Unlimited products", "$0.08/try-on overage", "Priority support"],
  },
];

const DEMO_PHASES: DemoPhase[] = ["idle", "uploading", "processing", "result"];
const DEMO_DURATIONS: Record<DemoPhase, number> = {
  idle: 1200,
  uploading: 2000,
  processing: 2200,
  result: 3000,
};

const CONFETTI_COLORS = ["#6366F1", "#EC4899", "#F59E0B", "#10B981", "#3B82F6"];

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await prisma.merchantConfig.findUnique({
    where: { shop },
    select: {
      onboardingComplete: true,
      buttonText: true,
      buttonColor: true,
      buttonPosition: true,
    },
  });

  if (config?.onboardingComplete) {
    const url = new URL(request.url);
    throw redirect(`/app${url.search}`);
  }

  return json({
    defaultButtonText: config?.buttonText ?? "Try It On",
    defaultButtonColor: config?.buttonColor ?? "#6366F1",
    defaultButtonPosition:
      (config?.buttonPosition as "below-add-to-cart" | "above-add-to-cart") ??
      "below-add-to-cart",
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const storeType = String(formData.get("storeType") ?? "");

  console.log(`[Action] Saving config for ${shop}. StoreType: ${storeType}`);

  try {
    await prisma.merchantConfig.upsert({
      where: { shop },
      update: { onboardingComplete: true, storeType: storeType || null },
      create: { shop, onboardingComplete: true, storeType: storeType || null },
    });
    console.log(`[Action] Successfully updated database for ${shop}`);
  } catch (error) {
    console.error(`[Action] Database error for ${shop}:`, error);
    throw error;
  }

  const url = new URL(request.url);
  throw redirect(`/app${url.search}`);
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const fetcher = useFetcher<typeof action>();

  const [state, setState] = useState<OnboardingState>({
    step: 1,
    storeType: null,
    planChosen: null,
  });

  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.step !== 3) {
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      return;
    }

    setDemoPhase("idle");
    let idx = 0;

    const tick = () => {
      idx = (idx + 1) % DEMO_PHASES.length;
      const next = DEMO_PHASES[idx];
      setDemoPhase(next);
      demoTimerRef.current = setTimeout(tick, DEMO_DURATIONS[next]);
    };

    demoTimerRef.current = setTimeout(tick, DEMO_DURATIONS["idle"]);
    return () => { if (demoTimerRef.current) clearTimeout(demoTimerRef.current); };
  }, [state.step]);

  const goTo = (step: OnboardingState["step"]) => {
    console.log(`[Onboarding] Navigating to step ${step}`);
    setState((s) => ({ ...s, step }));
  };

  const goBack = () => {
    if (state.step > 1) {
      setState((s) => ({ ...s, step: (s.step - 1) as OnboardingState["step"] }));
    }
  };

  const selectStoreType = (t: StoreType) => setState((s) => ({ ...s, storeType: t }));
  const selectPlan = (p: PlanId) => setState((s) => ({ ...s, planChosen: p }));

  return (
    <Page>
      <TitleBar title="Get Started with Slidez" />

      {/* Progress bar */}
      <div className={styles.progressWrapper}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${(state.step / 5) * 100}%` }}
          />
        </div>
        <Text as="span" variant="bodySm" tone="subdued">
          Step {state.step} of 5
        </Text>
      </div>

      <div key={state.step} className={styles.stepContent}>
        {state.step === 1 && <StepWelcome onNext={() => goTo(2)} />}
        {state.step === 2 && (
          <StepStoreType
            selected={state.storeType}
            onSelect={selectStoreType}
            onNext={() => goTo(3)}
            onBack={goBack}
          />
        )}
        {state.step === 3 && (
          <StepDemo demoPhase={demoPhase} onNext={() => goTo(4)} onBack={goBack} />
        )}
        {state.step === 4 && (
          <StepPricing
            selected={state.planChosen}
            onSelect={selectPlan}
            onNext={() => setState((s) => ({ ...s, step: 5 }))}
            onBack={goBack}
          />
        )}
        {state.step === 5 && (
          <StepComplete
            storeType={state.storeType}
            planChosen={state.planChosen}
            onBack={goBack}
          />
        )}
      </div>
    </Page>
  );
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.stepWelcome}>
      <img src="/logo.png" alt="Slidez" className={styles.welcomeLogo} />
      <h1 className={styles.stepHeading}>Welcome to Slidez</h1>
      <p className={styles.stepSubtext}>
        Let shoppers try before they buy — AI-powered virtual try-on for your store.
      </p>
      <Button
        variant="primary"
        size="large"
        onClick={onNext}
      >
        Start Setup
      </Button>
    </div>
  );
}

// ─── Step 2: Store Type ───────────────────────────────────────────────────────

function StepStoreType({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: StoreType | null;
  onSelect: (t: StoreType) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className={styles.stepBody}>
      <button
        type="button"
        className={styles.btnBack}
        onClick={onBack}
        aria-label="Go back"
      >
        <IconBack />
      </button>

      <h2 className={styles.stepHeading}>What kind of store do you run?</h2>
      <p className={styles.stepSubtext}>We&apos;ll tailor the experience to your products.</p>

      <div className={styles.storeTypeGrid}>
        {STORE_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.storeTypeCard} ${
              selected === t.id ? styles.storeTypeCardSelected : ""
            }`}
            onClick={() => {
              console.log(`[Onboarding] Store type selected: ${t.id}`);
              onSelect(t.id);
            }}
            aria-pressed={selected === t.id}
            aria-label={`${t.label} store type`}
          >
            <span className={styles.storeTypeIcon}>{t.icon}</span>
            <span className={styles.storeTypeLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      <Button
        variant="primary"
        size="large"
        disabled={!selected}
        onClick={onNext}
      >
        Continue
      </Button>
    </div>
  );
}

// ─── Step 3: Demo ─────────────────────────────────────────────────────────────

function StepDemo({
  demoPhase,
  onNext,
  onBack,
}: {
  demoPhase: DemoPhase;
  onNext: () => void;
  onBack: () => void;
}) {
  const isActive = demoPhase !== "idle";

  return (
    <div className={styles.stepBody}>
      <button
        type="button"
        className={styles.btnBack}
        onClick={onBack}
        aria-label="Go back"
      >
        <IconBack />
      </button>

      <h2 className={styles.stepHeading}>See Slidez in Action</h2>
      <p className={styles.stepSubtext}>
        Experience how shoppers will use try-on in your store.
      </p>

      <div className={styles.demoWidget}>
        {/* Base product card */}
        <div className={styles.demoProductCard}>
          <div className={styles.demoProductImage} />
          <div className={styles.demoProductMeta}>
            <span className={styles.demoProductTitle}>Summer Dress</span>
            <span className={styles.demoProductPrice}>$89.00</span>
          </div>
          <div className={styles.demoTryOnBtn}>Try It On</div>
        </div>

        {/* Animated overlay */}
        <div
          className={`${styles.demoOverlay} ${isActive ? styles.demoOverlayActive : ""}`}
        >
          {demoPhase === "uploading" && (
            <div className={styles.demoUploadPane}>
              <span className={styles.demoUploadIcon}>
                <IconCamera />
              </span>
              <div className={styles.demoProgressBar}>
                <div className={styles.demoProgressFill} />
              </div>
              <span className={styles.demoUploadLabel}>Uploading photo…</span>
            </div>
          )}

          {demoPhase === "processing" && (
            <div className={styles.demoProcessPane}>
              <div className={styles.demoSpinner} />
              <span className={styles.demoProcessLabel}>AI processing…</span>
            </div>
          )}

          {demoPhase === "result" && (
            <div className={styles.demoResultPane}>
              <div className={styles.demoResultModel} />
              <span className={styles.demoResultLabel}>Looking great!</span>
            </div>
          )}
        </div>
      </div>

      {/* Phase dots */}
      <div className={styles.demoDots}>
        {DEMO_PHASES.map((p) => (
          <div
            key={p}
            className={`${styles.demoDot} ${demoPhase === p ? styles.demoDotActive : ""}`}
          />
        ))}
      </div>

      <Button variant="primary" size="large" onClick={onNext}>
        Continue Setup
      </Button>
    </div>
  );
}

// ─── Step 4: Pricing ──────────────────────────────────────────────────────────

function StepPricing({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: PlanId | null;
  onSelect: (p: PlanId) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className={styles.stepBody}>
      <button
        type="button"
        className={styles.btnBack}
        onClick={onBack}
        aria-label="Go back"
      >
        <IconBack />
      </button>

      <h2 className={styles.stepHeading}>Choose a plan when you&apos;re ready.</h2>
      <p className={styles.stepSubtext}>Free trial available. No credit card required.</p>

      <div className={styles.pricingGrid}>
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={[
              styles.pricingCard,
              selected === plan.id ? styles.pricingCardSelected : "",
              plan.recommended ? styles.pricingCardRecommended : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              console.log(`[Onboarding] Plan selected: ${plan.id}`);
              onSelect(plan.id);
            }}
            aria-pressed={selected === plan.id}
          >
            {plan.recommended && (
              <span className={styles.pricingBadge}>Recommended</span>
            )}
            <span className={styles.pricingPlanName}>{plan.name}</span>
            <span className={styles.pricingPlanPrice}>
              ${plan.price}
              <span className={styles.pricingPerMonth}>/mo</span>
            </span>
            <ul className={styles.pricingFeatures}>
              {plan.features.map((f) => (
                <li key={f} className={styles.pricingFeatureItem}>
                  <IconCheck />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <Button variant="primary" size="large" onClick={onNext}>
        {selected ? "Start Free Trial" : "Skip for now"}
      </Button>
    </div>
  );
}

// ─── Step 5: Complete ─────────────────────────────────────────────────────────

function StepComplete({
  storeType,
  planChosen,
  onBack,
}: {
  storeType: StoreType | null;
  planChosen: PlanId | null;
  onBack: () => void;
}) {
  const particles = Array.from({ length: 40 }, (_, i) => i);

  return (
    <div className={styles.stepComplete}>
      {/* Confetti */}
      <div className={styles.confettiContainer} aria-hidden="true">
        {particles.map((i) => (
          <div
            key={i}
            className={styles.confettiParticle}
            style={
              {
                "--delay": `${(i * 97) % 1400}ms`,
                "--x": `${(i * 37) % 100}%`,
                "--color": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className={styles.completeContent}>
        <h2 className={styles.stepHeading}>Your store is ready for AI Try-On</h2>
        <p className={styles.stepSubtext}>
          Shoppers can now try on products right from your store.
        </p>

        <Form method="post">
          <input type="hidden" name="storeType" value={storeType ?? ""} />
          <input type="hidden" name="planChosen" value={planChosen ?? "skip"} />
          <Button
            submit
            variant="primary"
            size="large"
            onClick={() => console.log("[Onboarding] View Dashboard submitted")}
          >
            View Dashboard
          </Button>
        </Form>

        <Button
          variant="tertiary"
          url="/app/products"
          className={styles.btnSecondary}
        >
          Test Live Store
        </Button>

        <button type="button" className={styles.btnLink} onClick={onBack}>
          <IconBack /> Go back
        </button>
      </div>
    </div>
  );
}
