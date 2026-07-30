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
export type MechanicClass = 'возможность' | 'места' | 'запас' | 'объём' | 'никогда';
type QuotaEnforcement =
  | 'declared_no_enforcement'
  | 'atomic_snapshot'
  | 'application_transaction_snapshot';

type AbilityMechanic = Readonly<{
  class: 'возможность';
  label: string;
  quotaEnforcement: QuotaEnforcement;
}>;
type SeatsMechanic = Readonly<{
  class: 'места';
  label: string;
  quotaEnforcement: 'application_transaction_snapshot';
}>;
type StorageMechanic = Readonly<{
  class: 'объём';
  label: string;
  quotaEnforcement: QuotaEnforcement;
  quotaUnit: 'bytes';
}>;
type NeverMechanic = Readonly<{
  class: 'никогда';
  label: string;
  quotaEnforcement: 'declared_no_enforcement';
}>;
type MechanicDefinition = AbilityMechanic | SeatsMechanic | StorageMechanic | NeverMechanic;

/**
 * The mechanic class is the primary contract. A possibility or an always-available surface has
 * no quota fields at all, so attaching a numeric limit is a TypeScript error rather than a value
 * silently ignored at runtime.
 */
export const MECHANIC_REGISTRY = {
  booking: { class: 'возможность', label: 'Онлайн-запись', quotaEnforcement: 'declared_no_enforcement' },
  exercise_catalog: { class: 'возможность', label: 'Каталог упражнений', quotaEnforcement: 'declared_no_enforcement' },
  exercise_packages: { class: 'возможность', label: 'Пакеты упражнений', quotaEnforcement: 'declared_no_enforcement' },
  courses: { class: 'возможность', label: 'Курсы', quotaEnforcement: 'declared_no_enforcement' },
  cms_pages: { class: 'возможность', label: 'Страницы CMS', quotaEnforcement: 'declared_no_enforcement' },
  files: { class: 'объём', label: 'Файлы пациентов', quotaEnforcement: 'declared_no_enforcement', quotaUnit: 'bytes' },
  patient_card: { class: 'никогда', label: 'Карточка пациента', quotaEnforcement: 'declared_no_enforcement' },
  subscriptions: { class: 'возможность', label: 'Абонементы пациентов', quotaEnforcement: 'declared_no_enforcement' },
  payments: { class: 'возможность', label: 'Оплата записи', quotaEnforcement: 'declared_no_enforcement' },
  mailings: { class: 'возможность', label: 'Рассылки', quotaEnforcement: 'declared_no_enforcement' },
  patient_app: { class: 'никогда', label: 'Приложение пациента', quotaEnforcement: 'declared_no_enforcement' },
  patient_app_paid_subscription: { class: 'возможность', label: 'Платная подписка пациента', quotaEnforcement: 'declared_no_enforcement' },
  branding: { class: 'возможность', label: 'Брендирование', quotaEnforcement: 'declared_no_enforcement' },
  custom_domain: { class: 'возможность', label: 'Собственный домен', quotaEnforcement: 'declared_no_enforcement' },
  // Checked in pgOrganizationInvites under an org advisory lock, not by a database trigger.
  clinic_team: { class: 'места', label: 'Режим клиники', quotaEnforcement: 'application_transaction_snapshot' },
} as const satisfies Record<string, MechanicDefinition>;

export type OrgMechanic = keyof typeof MECHANIC_REGISTRY;

/** Compatibility iterator for resolver and data contracts; keys come only from the registry above. */
export const MECHANICS = Object.keys(MECHANIC_REGISTRY) as OrgMechanic[];

export type TariffQuotaUnit = 'bytes';

/**
 * Owner 2026-07-26 (#1003): the tariff constructor's quota-unit picker showed the raw
 * storage-unit key as both the option text and the selected value. The remaining generic storage
 * unit has one canonical Russian label rather than a raw-key fallback at render time.
 */
export const QUOTA_UNIT_LABELS: Record<TariffQuotaUnit, string> = {
  bytes: 'Байты',
};

export type TariffQuota = {
  kind: 'numeric' | 'unlimited';
  limit: number | null;
  /** The only stage-1/2 generic numeric quota: patient-file storage volume. */
  unit: 'bytes';
};

/** `возможность` and `никогда` are intentionally absent: assigning them a number cannot compile. */
export type TariffQuotaMap = Partial<Record<'files', TariffQuota>>;

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
    mechanic !== 'clinic_team' && mechanic !== 'courses' && mechanic !== 'exercise_catalog',
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
  billingPeriod: 'day' | 'month' | 'year';
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

/** A product-consumable view of an actually enforced quota. */
export type OrgQuotaProjection = {
  mechanic: OrgMechanic;
  quota: { limit: number; unit: 'seats' | 'bytes' };
  usage: number;
  threshold: 'below_warning' | 'warning' | 'reached';
  enforcement: (typeof MECHANIC_REGISTRY)[OrgMechanic]['quotaEnforcement'];
};

export type TrialPostBehavior = 'read_only' | 'blocked' | 'tariff';
export type TrialStartEvent = 'organization_provisioned';

export type TrialPolicy = {
  tariffId: string;
  durationDays: number;
  graceDays: number;
  startEvent: TrialStartEvent;
  postTrialBehavior: TrialPostBehavior;
  postTrialTariffId: string | null;
  isActive: boolean;
};

export type OrgCommercialLifecycleState = 'active' | 'grace' | 'read_only' | 'blocked';

export type OrgCommercialAccessState = 'compatibility' | 'no_trial' | 'trial_pending' | 'active';

export type EffectiveOrgCommercialAccess = {
  lifecycle: OrgCommercialLifecycleState;
  tariffId: string | null;
  source: 'compatibility' | 'assignment' | 'trial' | 'post_trial_tariff' | 'no_trial';
  /**
   * Present only when this access derives from an active organization trial (`source === "trial"`,
   * or a lifecycle of `grace`/`blocked`/`read_only` reached via a trial). Owner-facing displays
   * (settings billing tab) need the real date, not just the enum — see Defect #2 2026-07-25.
   */
  trialEndsAt?: string;
  trialGraceEndsAt?: string;
};

export type OrgEntitlementSnapshot = {
  tariff: {
    mechanics: Record<string, boolean>;
    quotas: TariffQuotaMap;
    includedSeats: number | null;
    /** Optional display fields — populated by the staff (non-patient) resolution path only. */
    id?: string;
    name?: string;
  } | null;
  overrides: Array<{
    mechanic: string;
    enabled: boolean;
    quota: TariffQuota | null;
    expiresAt: string | null;
    seatLimitOverride: number | null;
  }>;
  access: EffectiveOrgCommercialAccess;
};
