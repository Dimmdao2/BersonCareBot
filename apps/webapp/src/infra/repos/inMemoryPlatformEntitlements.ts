import type { PlatformEntitlementsPort } from '@/modules/org-entitlements/ports';
import type {
  BillingPeriodOption,
  PaidPeriodPolicy,
  RegistrationTariffPolicy,
  Tariff,
  TrialPolicy,
} from '@/modules/org-entitlements/types';

const DEFAULT_BILLING_PERIODS: BillingPeriodOption[] = [
  { code: 'month', label: 'Месяц', months: 1, isSelectable: true, sortOrder: 10 },
  { code: 'half_year', label: 'Полгода', months: 6, isSelectable: true, sortOrder: 20 },
  { code: 'year', label: 'Год', months: 12, isSelectable: true, sortOrder: 30 },
];

export function createInMemoryPlatformEntitlementsPort(): PlatformEntitlementsPort {
  const tariffs = new Map<string, Tariff>();
  const organizationTariffs = new Map<string, string | null>();
  const organizationIsActive = new Map<string, boolean>();
  const trials = new Map<
    string,
    { tariffId: string; endsAt: string; status: 'active' | 'ended' }
  >();
  let policy: TrialPolicy | null = null;
  let paidPeriodPolicy: PaidPeriodPolicy | null = null;
  let registrationTariffPolicy: RegistrationTariffPolicy = { tariffId: null };
  const billingPeriods = new Map(DEFAULT_BILLING_PERIODS.map((entry) => [entry.code, entry]));

  return {
    async listTariffs() {
      return [...tariffs.values()];
    },
    async listOrganizations() {
      return [...organizationTariffs].map(([id, tariffId]) => {
        const trial = trials.get(id) ?? null;
        return {
          id,
          title: id,
          tariffId,
          manualTariffId: trial?.status === 'active' ? null : tariffId,
          scheduledTariff: null,
          isActive: organizationIsActive.get(id) ?? true,
          effectiveAccess: {
            lifecycle: 'active' as const,
            tariffId,
            source: 'assignment' as const,
          },
          overrides: [],
          trial: trial
            ? {
                id,
                tariffId: trial.tariffId,
                status:
                  trial.status === 'ended'
                    ? ('ended' as const)
                    : Date.now() <= Date.parse(trial.endsAt)
                      ? ('active' as const)
                      : ('expired' as const),
                startedAt: trial.endsAt,
                endsAt: trial.endsAt,
                discountEndsAt: trial.endsAt,
              }
            : null,
        };
      });
    },
    async listBillingPeriods() {
      return [...billingPeriods.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async upsertBillingPeriod(input) {
      const code = input.code.trim();
      const before = billingPeriods.get(code);
      const option: BillingPeriodOption = {
        code,
        label: input.label.trim(),
        months: input.months,
        // #1069 owner decision 2026-09-05 (period grid) — a brand-new code is always born
        // non-selectable; editing an existing one never flips its selectable state here.
        isSelectable: before?.isSelectable ?? false,
        sortOrder: before?.sortOrder ?? input.months * 10,
      };
      billingPeriods.set(code, option);
      return option;
    },
    async setBillingPeriodSelectable(code, isSelectable) {
      const before = billingPeriods.get(code);
      if (!before) throw new Error('billing_period_not_found');
      if (isSelectable) {
        const missing = [...tariffs.values()]
          .filter((tariff) => tariff.isActive)
          .filter((tariff) => !tariff.periodPrices.some((row) => row.billingPeriodCode === code));
        if (missing.length > 0) {
          throw new Error(
            `saas_billing_period_activation_incomplete:${missing.map((tariff) => tariff.id).join(',')}`,
          );
        }
      }
      const after = { ...before, isSelectable };
      billingPeriods.set(code, after);
      return after;
    },
    async getTrialPolicy() {
      return policy;
    },
    async getPaidPeriodPolicy() {
      return paidPeriodPolicy;
    },
    async getRegistrationTariffPolicy() {
      return registrationTariffPolicy;
    },
    async getOrganizationMechanicUsage() {
      return {};
    },
    async createTariff(input) {
      const now = new Date().toISOString();
      const tariff: Tariff = {
        ...input,
        id: crypto.randomUUID(),
        // #1069 owner decision 2026-09-05 (period grid) — frozen legacy fields; the port input no
        // longer carries them, so a freshly created in-memory tariff starts at the same neutral
        // defaults a real `INSERT` would leave it at.
        priceMinor: null,
        billingPeriod: 'month',
        createdAt: now,
        updatedAt: now,
      };
      tariffs.set(tariff.id, tariff);
      return tariff;
    },
    async updateTariff(id, input) {
      const current = tariffs.get(id);
      if (!current) throw new Error('tariff_not_found');
      if (current.isActive && !input.isActive && registrationTariffPolicy.tariffId === id) {
        throw new Error('tariff_used_by_registration_tariff_policy');
      }
      const tariff = { ...current, ...input, updatedAt: new Date().toISOString() };
      tariffs.set(id, tariff);
      return tariff;
    },
    async archiveTariff(id) {
      const current = tariffs.get(id);
      if (!current) throw new Error('tariff_not_found');
      if (registrationTariffPolicy.tariffId === id) {
        throw new Error('tariff_used_by_registration_tariff_policy');
      }
      tariffs.set(id, { ...current, isActive: false, updatedAt: new Date().toISOString() });
    },
    async assignTariff(organizationId, tariffId) {
      const trial = trials.get(organizationId);
      const currentManualTariffId =
        trial?.status === 'active' ? null : (organizationTariffs.get(organizationId) ?? null);
      if (tariffId === currentManualTariffId) return;
      organizationTariffs.set(organizationId, tariffId);
      if (trial?.status === 'active') trials.set(organizationId, { ...trial, status: 'ended' });
    },
    async upsertOverride() {},
    async deleteOverride() {},
    async setTrialPolicy(next) {
      policy = next;
    },
    async setPaidPeriodPolicy(next) {
      paidPeriodPolicy = next;
    },
    async setRegistrationTariffPolicy(next) {
      registrationTariffPolicy = next;
    },
    async startTrial(organizationId) {
      if (!policy?.isActive) return null;
      const existing = trials.get(organizationId);
      if (existing) return { created: false, endsAt: existing.endsAt };
      // #1069 Т3/Т5 (owner 03.08): the trial applies to whatever tariff the organization already
      // has — it no longer carries its own separate tariff.
      const currentTariffId = organizationTariffs.get(organizationId) ?? null;
      if (!currentTariffId) throw new Error('organization_tariff_required_for_trial');
      const endsAt = new Date(Date.now() + policy.durationDays * 86_400_000).toISOString();
      trials.set(organizationId, { tariffId: currentTariffId, endsAt, status: 'active' });
      return { created: true, endsAt };
    },
    async setOrganizationActive(organizationId, isActive) {
      if (!organizationTariffs.has(organizationId)) throw new Error('organization_not_found');
      const before = organizationIsActive.get(organizationId) ?? true;
      if (before === isActive) return { isActive, changed: false };
      organizationIsActive.set(organizationId, isActive);
      return { isActive, changed: true };
    },
  };
}
