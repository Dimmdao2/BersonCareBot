import { eq } from "drizzle-orm";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runWithWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import { beOrganizations } from "../../../db/schema/bookingEngine";
import { saasOrgEntitlementOverrides, saasTariffs } from "../../../db/schema/saasEntitlements";

type CurrentPatientEntitlementRow = {
  tariff_mechanics: Record<string, boolean> | null;
  included_seats: number | null;
  override_mechanic: string | null;
  override_enabled: boolean | null;
  seat_limit_override: number | null;
};

async function readCurrentPatientEntitlements(
  organizationId: string,
): Promise<CurrentPatientEntitlementRow[] | null> {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind !== "patient") return null;
  if (principal.organizationId !== organizationId) {
    throw new Error("patient_entitlement_organization_mismatch");
  }

  const result = await runWithWebappDbOperationFamily("patient_ui_config", () =>
    runWebappPgText<CurrentPatientEntitlementRow>(
      "SELECT * FROM app.read_current_patient_organization_entitlements()",
    ),
  );
  if (result.rows.length === 0) {
    throw new Error("patient_entitlement_context_denied");
  }
  return result.rows;
}

/**
 * Staff reads keep the ambient staff/org Drizzle path (RLS enforces the override org wall and
 * exposes the global tariff catalog). A patient read uses only the signed current-patient
 * SECURITY DEFINER projection above; app_patient never receives direct entitlement-table grants.
 * See deploy/postgres/store-p0-entitlements-rls.sql and the E1 runtime overlay.
 *
 * DI wiring into buildAppDeps is deferred to P1 (nothing consumes this port yet in P0; keeping it
 * unwired avoids expanding the blast radius of a dormant, mechanical change).
 */
export function createPgOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async getTariffForOrg(organizationId) {
      const patientRows = await readCurrentPatientEntitlements(organizationId);
      if (patientRows) {
        const row = patientRows[0];
        if (!row?.tariff_mechanics) return null;
        return { mechanics: row.tariff_mechanics, includedSeats: row.included_seats };
      }

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
      const patientRows = await readCurrentPatientEntitlements(organizationId);
      if (patientRows) {
        return patientRows.flatMap((row) =>
          row.override_mechanic === null || row.override_enabled === null
            ? []
            : [{
                mechanic: row.override_mechanic,
                enabled: row.override_enabled,
                seatLimitOverride: row.seat_limit_override,
              }],
        );
      }

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
