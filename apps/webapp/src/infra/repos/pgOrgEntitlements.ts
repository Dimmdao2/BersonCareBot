import { and, eq, sql } from "drizzle-orm";
import { getCurrentDbPrincipal, runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runWithWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import { beOrganizations } from "../../../db/schema/bookingEngine";
import {
  saasOrganizationTrials,
  saasOrgEntitlementOverrides,
  saasTariffs,
} from "../../../db/schema/saasEntitlements";
import type {
  QuotaReservationDecision,
  TariffQuota,
  TariffQuotaMap,
} from "@/modules/org-entitlements/types";

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
        return { mechanics: row.tariff_mechanics, quotas: {}, includedSeats: row.included_seats };
      }

      const db = getDrizzle();
      const organizations = await db
        .select({ tariffId: beOrganizations.tariffId })
        .from(beOrganizations)
        .where(eq(beOrganizations.id, organizationId))
        .limit(1);
      let tariffId = organizations[0]?.tariffId ?? null;
      const trials = await db
        .select({
          graceEndsAt: saasOrganizationTrials.graceEndsAt,
          postTrialBehavior: saasOrganizationTrials.postTrialBehavior,
          postTrialTariffId: saasOrganizationTrials.postTrialTariffId,
        })
        .from(saasOrganizationTrials)
        .where(and(eq(saasOrganizationTrials.organizationId, organizationId), eq(saasOrganizationTrials.status, "active")))
        .limit(1);
      const trial = trials[0];
      if (trial && new Date(trial.graceEndsAt).getTime() < Date.now()) {
        if (trial.postTrialBehavior === "tariff") {
          tariffId = trial.postTrialTariffId;
        }
      }
      if (!tariffId) return null;
      const rows = await db
        .select({ mechanics: saasTariffs.mechanics, quotas: saasTariffs.quotas, includedSeats: saasTariffs.includedSeats })
        .from(saasTariffs)
        .where(eq(saasTariffs.id, tariffId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { mechanics: row.mechanics, quotas: row.quotas as TariffQuotaMap, includedSeats: row.includedSeats };
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
                quota: null,
                expiresAt: null,
                seatLimitOverride: row.seat_limit_override,
              }],
        );
      }

      const db = getDrizzle();
      const rows = await db
        .select({
          mechanic: saasOrgEntitlementOverrides.mechanic,
          enabled: saasOrgEntitlementOverrides.enabled,
          quota: saasOrgEntitlementOverrides.quota,
          expiresAt: saasOrgEntitlementOverrides.expiresAt,
          seatLimitOverride: saasOrgEntitlementOverrides.seatLimitOverride,
        })
        .from(saasOrgEntitlementOverrides)
        .where(eq(saasOrgEntitlementOverrides.organizationId, organizationId));
      return rows.map((row) => ({ ...row, quota: row.quota as TariffQuota | null }));
    },

    async getEffectiveCommercialAccess(organizationId) {
      const principal = getCurrentDbPrincipal();
      if (principal?.kind === "patient") {
        return { lifecycle: "active", tariffId: null, source: "compatibility" };
      }
      const db = getDrizzle();
      const organizations = await db
        .select({
          tariffId: beOrganizations.tariffId,
          commercialAccessState: beOrganizations.commercialAccessState,
        })
        .from(beOrganizations)
        .where(eq(beOrganizations.id, organizationId))
        .limit(1);
      const organization = organizations[0];
      if (!organization) throw new Error("organization_not_found");
      const rows = await db
        .select({
          tariffId: saasOrganizationTrials.tariffId,
          endsAt: saasOrganizationTrials.endsAt,
          graceEndsAt: saasOrganizationTrials.graceEndsAt,
          postTrialBehavior: saasOrganizationTrials.postTrialBehavior,
          postTrialTariffId: saasOrganizationTrials.postTrialTariffId,
        })
        .from(saasOrganizationTrials)
        .where(and(eq(saasOrganizationTrials.organizationId, organizationId), eq(saasOrganizationTrials.status, "active")))
        .limit(1);
      const trial = rows[0];
      if (!trial) {
        return {
          lifecycle: "active",
          tariffId: organization.tariffId,
          source:
            organization.commercialAccessState === "compatibility"
              ? "compatibility"
              : organization.commercialAccessState === "no_trial"
                ? "no_trial"
                : "assignment",
        };
      }
      const now = Date.now();
      if (now <= new Date(trial.endsAt).getTime()) {
        return { lifecycle: "active", tariffId: trial.tariffId, source: "trial" };
      }
      if (now <= new Date(trial.graceEndsAt).getTime()) {
        return { lifecycle: "grace", tariffId: trial.tariffId, source: "trial" };
      }
      if (trial.postTrialBehavior === "tariff") {
        return {
          lifecycle: "active",
          tariffId: trial.postTrialTariffId,
          source: "post_trial_tariff",
        };
      }
      return {
        lifecycle: trial.postTrialBehavior as "read_only" | "blocked",
        tariffId: trial.tariffId,
        source: "trial",
      };
    },

    async reserveQuotaGrowth(organizationId, mechanic, growthByUnit) {
      const result = await runWithDbOrganizationPrincipal(organizationId, () =>
        getDrizzle().execute(sql`
          SELECT *
          FROM app.reserve_saas_quota_growth(
            ${organizationId}::uuid,
            ${mechanic}::text,
            ${JSON.stringify(growthByUnit)}::jsonb
          )
        `),
      );
      const row = result.rows[0] as
        | {
            allowed: boolean;
            warning: boolean;
            used: string | number;
            projected: string | number;
            quota_limit: string | number | null;
            utilization_percent: number | null;
            reason: QuotaReservationDecision["reason"];
            period_key: string | null;
            reserved: string | number;
          }
        | undefined;
      if (!row) throw new Error("quota_reservation_result_missing");
      return {
        allowed: row.allowed,
        warning: row.warning,
        used: Number(row.used),
        projected: Number(row.projected),
        limit: row.quota_limit === null ? null : Number(row.quota_limit),
        utilizationPercent: row.utilization_percent,
        reason: row.reason,
        mechanic,
        periodKey: row.period_key,
        reserved: Number(row.reserved),
      };
    },
  };
}
