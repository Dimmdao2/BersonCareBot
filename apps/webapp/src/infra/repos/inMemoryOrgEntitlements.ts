import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";

export function createInMemoryOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async getTariffForOrg() {
      return null;
    },
    async listOverrides() {
      return [];
    },
  };
}
