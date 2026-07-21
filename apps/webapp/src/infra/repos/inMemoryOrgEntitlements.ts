import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import type { QuotaGrowthByUnit } from "@/modules/org-entitlements/types";

function growthTotal(growthByUnit: QuotaGrowthByUnit): number {
  return Object.values(growthByUnit).reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function createInMemoryOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async getTariffForOrg() {
      return null;
    },
    async listOverrides() {
      return [];
    },
    async getEffectiveCommercialAccess() {
      return { lifecycle: "active", tariffId: null, source: "compatibility" };
    },
    async reserveQuotaGrowth(_organizationId, mechanic, growthByUnit) {
      const reserved = growthTotal(growthByUnit);
      return {
        allowed: true,
        warning: false,
        used: 0,
        projected: reserved,
        limit: null,
        utilizationPercent: null,
        reason: "allowed",
        mechanic,
        periodKey: null,
        reserved,
      };
    },
  };
}
