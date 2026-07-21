import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";

export function createInMemoryOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async getSnapshot() {
      return {
        tariff: null,
        overrides: [],
        access: { lifecycle: "active", tariffId: null, source: "compatibility" },
      };
    },
    async getTariffForOrg() {
      return null;
    },
    async listOverrides() {
      return [];
    },
    async getEffectiveCommercialAccess() {
      return { lifecycle: "active", tariffId: null, source: "compatibility" };
    },
    async getEnforcedQuotaUsage() {
      return {};
    },
  };
}
