/**
 * Store P0 — entitlement foundation (dormant). Canonical mechanic list; single source of truth.
 * A new mechanic defaults to ENABLED until a tariff/override excludes it (backward-compat).
 * See docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md.
 */
/**
 * The only canonical mechanic registry. New tariff mechanics are declared
 * here before their domain write paths are guarded in their own stage.
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
type StockMechanic = Readonly<{
  class: 'запас';
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
export type MechanicDefinition =
  | AbilityMechanic
  | SeatsMechanic
  | StockMechanic
  | StorageMechanic
  | NeverMechanic;

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
  // Checked via assertStockQuotaAvailable in pgPatientFiles.createFile under an org advisory
  // lock, not by a database trigger — see check-storage-quota-race.mjs for the race proof.
  files: { class: 'объём', label: 'Файлы пациентов', quotaEnforcement: 'application_transaction_snapshot', quotaUnit: 'bytes' },
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
  patient_count: { class: 'запас', label: 'Пациенты', quotaEnforcement: 'application_transaction_snapshot' },
  branches: { class: 'запас', label: 'Филиалы', quotaEnforcement: 'application_transaction_snapshot' },
  external_calendar: { class: 'возможность', label: 'Внешний календарь', quotaEnforcement: 'declared_no_enforcement' },
  // Owner 31.07 (#1069): "дневники у пациентов не отбираем" — the mechanic has no toggle at all,
  // same class as patient_card/patient_app. See QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md §31.07.
  patient_diaries: { class: 'никогда', label: 'Дневники пациента', quotaEnforcement: 'declared_no_enforcement' },
  clinical_tests: { class: 'возможность', label: 'Клинические тесты и наборы', quotaEnforcement: 'declared_no_enforcement' },
  online_intake: { class: 'возможность', label: 'Онлайн-анкета', quotaEnforcement: 'declared_no_enforcement' },
  doctor_statistics: { class: 'возможность', label: 'Статистика кабинета', quotaEnforcement: 'declared_no_enforcement' },
  specialist_tasks: { class: 'возможность', label: 'Задачи специалиста', quotaEnforcement: 'declared_no_enforcement' },
  booking_prepayment: { class: 'возможность', label: 'Предоплата при записи', quotaEnforcement: 'declared_no_enforcement' },
  patient_home_today: { class: 'возможность', label: 'Сегодня', quotaEnforcement: 'declared_no_enforcement' },
  warmups: { class: 'возможность', label: 'Разминки', quotaEnforcement: 'declared_no_enforcement' },
  promo: { class: 'возможность', label: 'Промо', quotaEnforcement: 'declared_no_enforcement' },
} as const satisfies Record<string, MechanicDefinition>;

export type OrgMechanic = keyof typeof MECHANIC_REGISTRY;

/** Compatibility iterator for resolver and data contracts; keys come only from the registry above. */
export const MECHANICS = Object.keys(MECHANIC_REGISTRY) as OrgMechanic[];

export type TariffQuotaUnit = 'bytes' | 'items';

/**
 * Owner 2026-07-26 (#1003): the tariff constructor's quota-unit picker showed the raw
 * storage-unit key as both the option text and the selected value. The remaining generic storage
 * unit has one canonical Russian label rather than a raw-key fallback at render time.
 */
export const QUOTA_UNIT_LABELS: Record<TariffQuotaUnit, string> = {
  bytes: 'Байты',
  items: 'Штуки',
};

type NumericQuotaBase = {
  kind: 'numeric' | 'unlimited';
  limit: number | null;
  /** `null` means the owner has not configured an early warning for this number. */
  warningAtPercent: number | null;
};

export type StorageQuota = NumericQuotaBase & { unit: 'bytes' };
export type StockQuota = NumericQuotaBase & { unit: 'items' };
export type TariffQuota = StorageQuota | StockQuota;

/**
 * The key controls the unit at compile time. Possibility, seats and never-limited mechanics are
 * intentionally absent, so the constructor cannot attach a generic number to them.
 */
export type TariffQuotaMap = Partial<{
  files: StorageQuota;
  patient_count: StockQuota;
  branches: StockQuota;
}>;

/**
 * §5a stage 4b.2 (owner 30.07): the ladder's final state is one of exactly two values. A third
 * `full_access` option was a leftover from before the ladder existed and let the constructor
 * configure a "degradation" that never actually degrades — removed, not renamed, per the owner's
 * "не надо держать ради истории устаревшее" rule.
 */
export type AccessTerminalState = 'read_only' | 'disabled';

export type AccessLifecyclePolicy = {
  graceDays: number;
  readOnlyDays: number;
  warningCount: number;
  terminalState: AccessTerminalState;
};

export type MechanicAccessPolicyMap = Partial<Record<OrgMechanic, AccessLifecyclePolicy>>;

/**
 * §5a stage 4b.3 (owner 30.07) — "ручка 2": what happens when a clinic moves to a smaller tariff
 * and it already exceeds (numeric) or loses (capability) a mechanic. Values are fixed by the
 * mechanic's class, not chosen per entity — see `assertDowngradePolicy` in `service.ts`.
 */
export type NumericDowngradePolicy = 'block' | 'freeze_growth';
export type AbilityDowngradePolicy = 'block' | 'disable_immediately' | 'read_only';
export type MechanicDowngradePolicy = NumericDowngradePolicy | AbilityDowngradePolicy;
export type DowngradePolicyMap = Partial<Record<OrgMechanic, MechanicDowngradePolicy>>;

export type MechanicAccessState =
  | 'full_access'
  | 'grace'
  | 'read_only'
  | 'disabled'
  | 'unconfigured';

export type MechanicAccessWarning = {
  until: string;
  count: number;
  nextState: AccessTerminalState;
};

export type MechanicAccessResolution = {
  mechanic: OrgMechanic;
  state: MechanicAccessState;
  policySource: 'critical' | 'mechanic' | 'system' | 'unconfigured';
  warning: MechanicAccessWarning | null;
};

export type Tariff = {
  id: string;
  name: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  billingPeriod: 'day' | 'month' | 'year';
  mechanics: Record<string, boolean>;
  quotas: TariffQuotaMap;
  systemAccessPolicy: AccessLifecyclePolicy | null;
  mechanicAccessPolicies: MechanicAccessPolicyMap;
  /** §5a stage 4b.3 — per-mechanic downgrade policy; absent mechanics fall back to `block` (fail-closed). */
  downgradePolicies: DowngradePolicyMap;
  /**
   * Included specialist seats for `clinic_team`, as configured on this tariff. `null` is explicit
   * "not configured" and refuses growth; it is never converted into an agent-chosen baseline.
   */
  includedSeats: number | null;
  includedSeatsWarningAtPercent: number | null;
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
   * Per-org override of the `clinic_team` included-seats count; unused for other mechanics.
   * `null` means no explicit override and falls back only to the tariff.
   */
  seatLimitOverride: number | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgEntitlements = Record<OrgMechanic, boolean>;

/** A product-consumable view of an actually enforced quota. */
export type OrgQuotaProjection = {
  mechanic: OrgMechanic;
  quota: { limit: number; unit: 'seats' | TariffQuotaUnit };
  usage: number;
  threshold: 'below_warning' | 'warning' | 'reached';
  enforcement: (typeof MECHANIC_REGISTRY)[OrgMechanic]['quotaEnforcement'];
};

export type TrialPostBehavior = 'read_only' | 'blocked' | 'tariff';
/** Operator-authored event key. Empty means invalid; the runtime never substitutes an event. */
export type TrialStartEvent = string;

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
  /** Server-derived instant when commercial access stopped being active. */
  degradationStartedAt?: string;
};

export type OrgEntitlementSnapshot = {
  tariff: {
    mechanics: Record<string, boolean>;
    quotas: TariffQuotaMap;
    systemAccessPolicy: AccessLifecyclePolicy | null;
    mechanicAccessPolicies: MechanicAccessPolicyMap;
    includedSeats: number | null;
    includedSeatsWarningAtPercent: number | null;
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
