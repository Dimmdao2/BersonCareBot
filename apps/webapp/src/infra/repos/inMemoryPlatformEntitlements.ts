import type { PlatformEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { Tariff, TrialPolicy } from '@/modules/org-entitlements/types';

export function createInMemoryPlatformEntitlementsPort(): PlatformEntitlementsPort {
  const tariffs = new Map<string, Tariff>();
  const organizationTariffs = new Map<string, string | null>();
  const trials = new Map<
    string,
    { tariffId: string; endsAt: string; status: 'active' | 'ended' }
  >();
  let policy: TrialPolicy | null = null;

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
          isActive: true,
          commercialAccessState: tariffId ? ('active' as const) : ('no_trial' as const),
          effectiveAccess: {
            lifecycle: 'active' as const,
            tariffId,
            source: tariffId ? ('assignment' as const) : ('no_trial' as const),
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
                graceEndsAt: trial.endsAt,
              }
            : null,
        };
      });
    },
    async getTrialPolicy() {
      return policy;
    },
    async getOrganizationMechanicUsage() {
      return {};
    },
    async createTariff(input) {
      const now = new Date().toISOString();
      const tariff: Tariff = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      tariffs.set(tariff.id, tariff);
      return tariff;
    },
    async updateTariff(id, input) {
      const current = tariffs.get(id);
      if (!current) throw new Error('tariff_not_found');
      const tariff = { ...current, ...input, updatedAt: new Date().toISOString() };
      tariffs.set(id, tariff);
      return tariff;
    },
    async archiveTariff(id) {
      const current = tariffs.get(id);
      if (!current) throw new Error('tariff_not_found');
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
    async startTrial(organizationId) {
      if (!policy?.isActive) return null;
      const existing = trials.get(organizationId);
      if (existing) return { created: false, endsAt: existing.endsAt };
      const endsAt = new Date(Date.now() + policy.durationDays * 86_400_000).toISOString();
      trials.set(organizationId, { tariffId: policy.tariffId, endsAt, status: 'active' });
      organizationTariffs.set(organizationId, policy.tariffId);
      return { created: true, endsAt };
    },
    async extendTrial(organizationId, days) {
      const current = trials.get(organizationId);
      if (!current) throw new Error('organization_trial_not_found');
      const endsAt = new Date(new Date(current.endsAt).getTime() + days * 86_400_000).toISOString();
      if (current.status !== 'active') throw new Error('organization_trial_not_found');
      trials.set(organizationId, { ...current, endsAt, status: 'active' });
      return { endsAt };
    },
  };
}
