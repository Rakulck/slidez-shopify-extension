import { Badge } from "@shopify/polaris";

type PlanId = "free" | "growth" | "pro" | "enterprise";

interface PlanBadgeProps {
  planId: PlanId | string;
  trialEndsAt?: string;
}

const PLAN_TONE: Record<string, "new" | "info" | "success" | "warning" | undefined> = {
  free: undefined,
  growth: "info",
  pro: "success",
  enterprise: "warning",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  growth: "Growth",
  pro: "Pro",
  enterprise: "Enterprise",
};

export function PlanBadge({ planId, trialEndsAt }: PlanBadgeProps) {
  const tone = PLAN_TONE[planId];
  const label = PLAN_LABEL[planId] ?? planId;
  const suffix = trialEndsAt ? ` (trial ends ${trialEndsAt})` : "";

  return (
    <Badge tone={tone}>
      {label + suffix}
    </Badge>
  );
}
