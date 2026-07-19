import { eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import { beOrganizations } from "../../../db/schema/bookingEngine";
import { saasOrgEntitlementOverrides, saasTariffs } from "../../../db/schema/saasEntitlements";

/**
 * Store P0 — entitlement foundation (dormant). Reads run under the ambient staff/org principal —
 * no SECURITY DEFINER, no explicit cross-org filter needed (RLS enforces the org wall on
 * saas_org_entitlement_overrides; saas_tariffs is a global read for any staff session). See
 * deploy/postgres/store-p0-entitlements-rls.sql and STORE_P0_ENTITLEMENTS_PLAN.md.
 *
 * DI wiring into buildAppDeps is deferred to P1 (nothing consumes this port yet in P0; keeping it
 * unwired avoids expanding the blast radius of a dormant, mechanical change).
 */
export function createPgOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async getTariffForOrg(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select({ mechanics: saasTariffs.mechanics, includedSeats: saasTariffs.includedSeats })
        .from(beOrganizations)
        .innerJoin(saasTariffs, eq(saasTariffs.id, beOrganizations.tariffId))
        .where(eq(beOrganizations.id, organizationId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { mechanics: row.mechanics, includedSeats: row.includedSeats };
    },

    async listOverrides(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select({
          mechanic: saasOrgEntitlementOverrides.mechanic,
          enabled: saasOrgEntitlementOverrides.enabled,
          seatLimitOverride: saasOrgEntitlementOverrides.seatLimitOverride,
        })
        .from(saasOrgEntitlementOverrides)
        .where(eq(saasOrgEntitlementOverrides.organizationId, organizationId));
      return rows;
    },
  };
}
