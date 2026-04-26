import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Banner } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { firebaseGet, firebasePost } from "../utils/firebase-client";

interface Plan {
  id: string;
  name: string;
  price: number;
  trialDays?: number;
  features: string[];
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: "growth",
    name: "Growth",
    price: 49,
    features: [
      "500 try-ons/month",
      "Unlimited products",
      "No watermark",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    trialDays: 7,
    features: [
      "2,000 try-ons/month",
      "Analytics dashboard",
      "Priority support",
      "7-day free trial",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 249,
    trialDays: 7,
    features: [
      "Unlimited try-ons",
      "API access",
      "White-label option",
      "SLA guarantee",
      "7-day free trial",
    ],
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const justUpgraded = url.searchParams.get("upgraded") === "true";

  let currentPlan = "growth";
  let plans: Plan[] = FALLBACK_PLANS;
  let trialEndsAt: string | null = null;

  try {
    const fb = await firebaseGet("/api/billing/plans", shop);
    if (fb?.currentPlan) currentPlan = fb.currentPlan;
    if (Array.isArray(fb?.plans) && fb.plans.length > 0) plans = fb.plans;
    if (fb?.trialEndsAt) trialEndsAt = fb.trialEndsAt;
  } catch {
    // Firebase not connected — use fallback plans
  }

  return json({ currentPlan, plans, shop, justUpgraded, trialEndsAt });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const planId = String(formData.get("planId") ?? "");

  const appUrl = process.env.SHOPIFY_APP_URL ?? "";
  const returnUrl = `${appUrl}/app/billing?upgraded=true`;

  try {
    const result = await firebasePost("/api/billing/subscribe", { shop, planId, returnUrl });
    if (result?.confirmationUrl) {
      return redirect(result.confirmationUrl);
    }
  } catch {
    // Firebase not connected
  }

  return json({ success: true });
};

const CheckIcon = () => (
  <svg className="check-svg" viewBox="0 0 24 24">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export default function Billing() {
  const { currentPlan, plans, justUpgraded, trialEndsAt } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const upgradingPlanId =
    fetcher.state !== "idle" ? fetcher.formData?.get("planId") : null;

  return (
    <Page fullWidth>
      <TitleBar title="Plans & Billing" />
      <div className="billing-wrapper">
        <style dangerouslySetInnerHTML={{
          __html: `
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
          
          .billing-wrapper {
            font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            color: #1E1B4B;
            padding: 1rem;
            max-width: 950px;
            margin: 0 auto;
          }
          
          .pricing-header {
            text-align: center;
            margin-bottom: 2rem;
          }
          
          .pricing-header h1 {
            font-size: 2.25rem;
            font-weight: 700;
            color: #1E1B4B;
            margin-bottom: 0.25rem;
            letter-spacing: -0.02em;
          }
          
          .pricing-header p {
            font-size: 1rem;
            color: #6366F1;
            margin-top: 0;
            margin-bottom: 1.25rem;
          }
      
          .pricing-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.25rem;
            align-items: stretch;
            margin-top: 0.5rem;
          }
          
          .pricing-card {
            background: #ffffff;
            border: 1px solid #E5E7EB;
            border-radius: 16px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          }
          
          .pricing-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.1), 0 10px 10px -5px rgba(99, 102, 241, 0.04);
            border-color: #A5B4FC;
          }
          
          .pricing-card.popular {
            border: 2px solid #6366F1;
            box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.15), 0 10px 10px -5px rgba(99, 102, 241, 0.04);
            transform: scale(1.02);
            z-index: 10;
          }
      
          .pricing-card.popular:hover {
            transform: scale(1.02) translateY(-4px);
          }
          
          .popular-badge {
            position: absolute;
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
            color: #ffffff;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.3);
          }
          
          .plan-name {
            font-size: 1.125rem;
            font-weight: 700;
            color: #374151;
            margin-bottom: 0.25rem;
            text-transform: uppercase;
            letter-spacing: 0.025em;
          }
          
          .plan-price {
            font-size: 2.75rem;
            font-weight: 800;
            color: #1E1B4B;
            display: flex;
            align-items: baseline;
            margin-bottom: 0.25rem;
            line-height: 1;
            letter-spacing: -0.025em;
          }
          
          .plan-price span {
            font-size: 0.875rem;
            font-weight: 600;
            color: #6B7280;
            margin-left: 0.25rem;
            letter-spacing: 0;
          }
          
          .trial-spacer {
            height: 20px;
            margin-bottom: 1rem;
          }

          .trial-badge {
            display: inline-block;
            background: #D1FAE5;
            color: #065F46;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 700;
            margin-bottom: 1rem;
          }
          
          .divider {
            height: 1px;
            background: #E5E7EB;
            margin: 1.25rem 0;
            width: 100%;
          }

          .features-list {
            list-style: none;
            padding: 0;
            margin: 0 0 1.5rem 0;
            flex-grow: 1;
          }
          
          .feature-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 0.875rem;
            font-size: 0.875rem;
            color: #4B5563;
            font-weight: 500;
          }
          
          .feature-icon {
            flex-shrink: 0;
            margin-right: 0.625rem;
            margin-top: 2px;
          }
          
          .cta-button {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            padding: 0.75rem 1rem;
            text-align: center;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.95rem;
            transition: all 0.2s ease;
            cursor: pointer;
            border: none;
            font-family: inherit;
            letter-spacing: 0.025em;
          }
          
          .cta-base {
            background: #F3F4F6;
            color: #374151;
          }

          .cta-base:hover:not(:disabled) {
            background: #E5E7EB;
            color: #111827;
          }

          .cta-primary {
            background: #6366F1;
            color: white;
            box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
          }
          
          .cta-primary:hover:not(:disabled) {
            background: #4F46E5;
            box-shadow: 0 6px 8px -1px rgba(99, 102, 241, 0.3);
          }
          
          .cta-success {
            background: #10B981;
            color: white;
            box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
          }
      
          .cta-success:hover:not(:disabled) {
            background: #059669;
            box-shadow: 0 6px 8px -1px rgba(16, 185, 129, 0.3);
          }
          
          .cta-disabled {
            background: #F3F4F6;
            color: #9CA3AF;
            cursor: not-allowed;
            box-shadow: none;
          }
      
          .check-svg {
            width: 16px;
            height: 16px;
            color: #10B981;
            fill: none;
            stroke: currentColor;
            stroke-width: 2.5;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
      
          @media (max-width: 1024px) {
            .pricing-grid {
              grid-template-columns: repeat(2, 1fr);
            }
            .pricing-card.popular {
              transform: none;
            }
            .pricing-card.popular:hover {
              transform: translateY(-4px);
            }
          }
          @media (max-width: 768px) {
            .pricing-grid {
              grid-template-columns: 1fr;
              max-width: 400px;
              margin-inline: auto;
            }
          }
        `}} />

        {justUpgraded && (
          <Banner tone="success" title="Plan activated">
            You're now on the {currentPlan} plan. Enjoy your new features!
          </Banner>
        )}
        {trialEndsAt && new Date(trialEndsAt) > new Date() && (
          <Banner tone="info" title="Free trial active">
            Your trial ends on {new Date(trialEndsAt).toLocaleDateString()}. No charge until then.
          </Banner>
        )}

        <div className="pricing-header">
          <h1>Choose Your Plan</h1>
          <p>Boost your sales with our virtual try-on technology</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#F3F4F6', padding: '6px 16px', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600, color: '#4B5563' }}>
            <span style={{ marginRight: '8px', color: '#10B981' }}>●</span>
            Your current active plan is <strong style={{ color: '#111827', marginLeft: '4px', textTransform: 'capitalize' }}>{currentPlan}</strong>
          </div>
        </div>

        <div className="pricing-grid">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isUpgrading = upgradingPlanId === plan.id;
            const isPopular = plan.id === "pro"; // Highlighting Pro

            return (
              <div key={plan.id} className={`pricing-card ${isPopular ? "popular" : ""}`}>
                {isPopular && <div className="popular-badge">Most Popular</div>}
                
                <h3 className="plan-name" style={{ color: isPopular ? '#6366F1' : '#374151' }}>{plan.name}</h3>
                <div className="plan-price">
                  ${plan.price}<span>/mo</span>
                </div>
                
                {plan.trialDays ? (
                  <div><span className="trial-badge">{plan.trialDays}-Day Free Trial</span></div>
                ) : (
                  <div className="trial-spacer"></div>
                )}
                
                <div className="divider" />
                
                <ul className="features-list">
                  {plan.features.map((f, i) => (
                    <li key={i} className="feature-item">
                      <div className="feature-icon"><CheckIcon /></div>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <fetcher.Form method="post">
                  <input type="hidden" name="planId" value={plan.id} />
                  <button
                    type="submit"
                    disabled={isCurrent || isUpgrading}
                    className={`cta-button ${
                      isCurrent 
                        ? "cta-disabled" 
                        : isPopular 
                          ? "cta-primary" 
                          : "cta-base"
                    }`}
                  >
                    {isUpgrading ? (
                      <span style={{ opacity: 0.7 }}>Processing...</span>
                    ) : isCurrent ? (
                      "Current Plan"
                    ) : (
                      "Upgrade to " + plan.name
                    )}
                  </button>
                </fetcher.Form>
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
