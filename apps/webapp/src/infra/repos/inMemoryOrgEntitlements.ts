import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';

export function createInMemoryOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async resolveMechanicAccess(_organizationId, mechanic) {
      return { mechanic, state: 'full_access', policySource: 'system', warning: null };
    },
    async getSnapshot() {
      return {
        tariff: null,
        overrides: [],
        access: { lifecycle: 'active', tariffId: null, source: 'compatibility' },
      };
    },
    async getTariffForOrg() {
      return null;
    },
    async listOverrides() {
      return [];
    },
    async getEffectiveCommercialAccess() {
      return { lifecycle: 'active', tariffId: null, source: 'compatibility' };
    },
    async getEnforcedQuotaUsage() {
      return {};
    },
    async getOwnQuotaUsage() {
      return {};
    },
  };
}
