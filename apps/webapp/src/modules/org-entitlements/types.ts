/**
 * Store P0 — entitlement foundation (dormant). Canonical mechanic list; single source of truth.
 * A new mechanic defaults to ENABLED until a tariff/override excludes it (backward-compat).
 * See docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md.
 */
export const MECHANICS = [
  "booking",
  "exercise_catalog",
  "exercise_packages",
  "courses",
  "cms_pages",
  "files",
  "patient_card",
  "subscriptions",
  "payments",
  "mailings",
  "patient_app",
  "patient_app_paid_subscription",
  "branding",
  "custom_domain",
] as const;

export type OrgMechanic = (typeof MECHANICS)[number];

export type Tariff = {
  id: string;
  name: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  mechanics: Record<string, boolean>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrgEntitlementOverride = {
  id: string;
  organizationId: string;
  mechanic: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrgEntitlements = Record<OrgMechanic, boolean>;
