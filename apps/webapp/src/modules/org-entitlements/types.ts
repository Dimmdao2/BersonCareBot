/**
 * Store P0 — entitlement foundation (dormant). Canonical mechanic list; single source of truth.
 * A new mechanic defaults to ENABLED until a tariff/override excludes it (backward-compat).
 * See docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md.
 */
/**
 * The only canonical mechanic registry.  It deliberately contains no pending
 * product candidates: S4-0 protects the fourteen keys that already exist in
 * the compatibility resolver.
 */
export const MECHANIC_REGISTRY = {
  booking: { label: "Онлайн-запись", quotaUnits: ["appointments"] },
  exercise_catalog: { label: "Каталог упражнений", quotaUnits: ["items"] },
  exercise_packages: { label: "Пакеты упражнений", quotaUnits: ["items"] },
  courses: { label: "Курсы", quotaUnits: ["items"] },
  cms_pages: { label: "Страницы CMS", quotaUnits: ["items"] },
  files: { label: "Файлы пациентов", quotaUnits: ["bytes", "items"] },
  patient_card: { label: "Карточка пациента", quotaUnits: ["clients"] },
  subscriptions: { label: "Абонементы пациентов", quotaUnits: ["items"] },
  payments: { label: "Оплата записи", quotaUnits: ["transactions"] },
  mailings: { label: "Рассылки", quotaUnits: ["messages"] },
  patient_app: { label: "Приложение пациента", quotaUnits: ["clients"] },
  patient_app_paid_subscription: { label: "Платная подписка пациента", quotaUnits: ["clients"] },
  branding: { label: "Брендирование", quotaUnits: [] },
  custom_domain: { label: "Собственный домен", quotaUnits: [] },
  clinic_team: { label: "Режим клиники", quotaUnits: ["seats"] },
} as const;

export type OrgMechanic = keyof typeof MECHANIC_REGISTRY;

/** Compatibility iterator for resolver and data contracts; keys come only from the registry above. */
export const MECHANICS = Object.keys(MECHANIC_REGISTRY) as OrgMechanic[];

export const QUOTA_PERIODS = ["snapshot", "day", "month", "year"] as const;
export type QuotaPeriod = (typeof QUOTA_PERIODS)[number];
export const QUOTA_USAGE_POLICIES = ["snapshot", "consumption"] as const;
export type QuotaUsagePolicy = (typeof QUOTA_USAGE_POLICIES)[number];

export type TariffQuota = {
  kind: "numeric" | "unlimited";
  limit: number | null;
  unit: string;
  period: QuotaPeriod;
  usagePolicy: QuotaUsagePolicy;
};

export type TariffQuotaMap = Partial<Record<OrgMechanic, TariffQuota>>;

/**
 * C4A/C4C/C4D — scoped fail-closed exceptions to the compatibility default-true resolver (see
 * `resolveOrgEntitlements` in `service.ts`). `clinic_team`, `courses`, and the platform part of
 * `exercise_catalog` require an explicit tariff or organization override. OFF exercise catalog
 * still leaves the organization's own exercises and templates available; it only excludes the
 * platform base library.
 */
export const MECHANIC_DEFAULT_ENABLED: Record<OrgMechanic, boolean> = Object.fromEntries(
  MECHANICS.map((mechanic) => [
    mechanic,
    mechanic !== "clinic_team" && mechanic !== "courses" && mechanic !== "exercise_catalog",
  ]),
) as Record<OrgMechanic, boolean>;

/**
 * C4A — fail-closed effective seat count used only when `clinic_team` is enabled (by tariff or
 * override) but no explicit seat count was configured (no `includedSeats`, no
 * `seatLimitOverride`). Owner decision (C4C5-05): "solo includes one seat" — this is the same
 * finite baseline, not a real tariff row. Never treated as unlimited; see `resolveClinicSeatLimit`.
 */
export const CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE = 1;

export type Tariff = {
  id: string;
  name: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  billingPeriod: "day" | "month" | "year";
  mechanics: Record<string, boolean>;
  quotas: TariffQuotaMap;
  /**
   * Included specialist seats for `clinic_team`, as configured on this tariff. `null` means this
   * tariff does not explicitly configure a count (falls back to `CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE`
   * via `resolveClinicSeatLimit`) — it is never treated as unlimited.
   */
  includedSeats: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrgEntitlementOverride = {
  id: string;
  organizationId: string;
  mechanic: string;
  enabled: boolean;
  quota: TariffQuota | null;
  expiresAt: string | null;
  /**
   * Per-org override of the `clinic_team` included-seats count; unused for other mechanics. `null`
   * means no explicit override (falls back to the tariff, then the fail-closed baseline) — never
   * unlimited.
   */
  seatLimitOverride: number | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgEntitlements = Record<OrgMechanic, boolean>;

export type TrialPostBehavior = "read_only" | "blocked" | "tariff";
export type TrialStartEvent = "organization_provisioned" | "email_verified" | "manual";

export type TrialPolicy = {
  tariffId: string;
  durationDays: number;
  graceDays: number;
  startEvent: TrialStartEvent;
  postTrialBehavior: TrialPostBehavior;
  postTrialTariffId: string | null;
  isActive: boolean;
};

export type QuotaAccessDecision = {
  allowed: boolean;
  warning: boolean;
  used: number;
  projected: number;
  limit: number | null;
  utilizationPercent: number | null;
  reason: "allowed" | "warning_80" | "quota_reached";
};
