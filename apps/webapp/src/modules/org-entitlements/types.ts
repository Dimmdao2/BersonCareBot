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
  booking: { label: "Онлайн-запись" },
  exercise_catalog: { label: "Каталог упражнений" },
  exercise_packages: { label: "Пакеты упражнений" },
  courses: { label: "Курсы" },
  cms_pages: { label: "Страницы CMS" },
  files: { label: "Файлы пациентов" },
  patient_card: { label: "Карточка пациента" },
  subscriptions: { label: "Абонементы пациентов" },
  payments: { label: "Оплата записи" },
  mailings: { label: "Рассылки" },
  patient_app: { label: "Приложение пациента" },
  patient_app_paid_subscription: { label: "Платная подписка пациента" },
  branding: { label: "Брендирование" },
  custom_domain: { label: "Собственный домен" },
} as const;

export type OrgMechanic = keyof typeof MECHANIC_REGISTRY;

/** Compatibility iterator for resolver and data contracts; keys come only from the registry above. */
export const MECHANICS = Object.keys(MECHANIC_REGISTRY) as OrgMechanic[];

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
