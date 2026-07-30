import { and, eq } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type {
  AccessLifecyclePolicy,
  EffectiveOrgCommercialAccess,
  MechanicAccessResolution,
  MechanicAccessPolicyMap,
  OrgEntitlementSnapshot,
  OrgMechanic,
  TariffQuota,
  TariffQuotaMap,
} from '@/modules/org-entitlements/types';
import { beOrganizations } from '../../../db/schema/bookingEngine';
import {
  saasOrganizationTrials,
  saasOrgEntitlementOverrides,
  saasTariffs,
} from '../../../db/schema/saasEntitlements';

type CurrentPatientEntitlementRow = {
  tariff_mechanics: Record<string, boolean> | null;
  tariff_quotas: TariffQuotaMap | null;
  tariff_system_access_policy: AccessLifecyclePolicy | null;
  tariff_mechanic_access_policies: MechanicAccessPolicyMap | null;
  included_seats: number | null;
  included_seats_warning_at_percent: number | null;
  override_mechanic: string | null;
  override_enabled: boolean | null;
  override_quota: TariffQuota | null;
  override_expires_at: string | null;
  seat_limit_override: number | null;
  lifecycle: EffectiveOrgCommercialAccess['lifecycle'];
  effective_tariff_id: string | null;
  access_source: EffectiveOrgCommercialAccess['source'];
  degradation_started_at: string | null;
};

type MechanicAccessRow = {
  state: MechanicAccessResolution['state'];
  policy_source: MechanicAccessResolution['policySource'];
  warning: MechanicAccessResolution['warning'];
};

function snapshotFromPatientRows(rows: CurrentPatientEntitlementRow[]): OrgEntitlementSnapshot {
  const first = rows[0];
  if (!first) throw new Error('patient_entitlement_context_denied');
  return {
    tariff: first.tariff_mechanics
      ? {
          mechanics: first.tariff_mechanics,
          quotas: first.tariff_quotas ?? {},
          systemAccessPolicy: first.tariff_system_access_policy,
          mechanicAccessPolicies: first.tariff_mechanic_access_policies ?? {},
          includedSeats: first.included_seats,
          includedSeatsWarningAtPercent: first.included_seats_warning_at_percent,
        }
      : null,
    overrides: rows.flatMap((row) =>
      row.override_mechanic === null || row.override_enabled === null
        ? []
        : [
            {
              mechanic: row.override_mechanic,
              enabled: row.override_enabled,
              quota: row.override_quota,
              expiresAt: row.override_expires_at,
              seatLimitOverride: row.seat_limit_override,
            },
          ],
    ),
    access: {
      lifecycle: first.lifecycle,
      tariffId: first.effective_tariff_id,
      source: first.access_source,
      ...(first.degradation_started_at
        ? { degradationStartedAt: first.degradation_started_at }
        : {}),
    },
  };
}

async function readCurrentPatientSnapshot(
  organizationId: string,
): Promise<OrgEntitlementSnapshot | null> {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind !== 'patient') return null;
  if (principal.organizationId !== organizationId) {
    throw new Error('patient_entitlement_organization_mismatch');
  }
  const result = await runWithWebappDbOperationFamily('patient_ui_config', () =>
    runWebappPgText<CurrentPatientEntitlementRow>(
      'SELECT * FROM app.read_current_patient_organization_entitlements()',
    ),
  );
  return snapshotFromPatientRows(result.rows);
}

function resolveAccess(input: {
  organizationTariffId: string | null;
  commercialAccessState: 'compatibility' | 'no_trial' | 'trial_pending' | 'active';
  trial: {
    tariffId: string;
    endsAt: string;
    graceEndsAt: string;
    postTrialBehavior: string;
    postTrialTariffId: string | null;
  } | null;
  now: number;
}): EffectiveOrgCommercialAccess {
  const { trial } = input;
  if (!trial) {
    return {
      lifecycle: 'active',
      tariffId: input.organizationTariffId,
      source:
        input.commercialAccessState === 'compatibility'
          ? 'compatibility'
          : input.commercialAccessState === 'no_trial'
            ? 'no_trial'
            : 'assignment',
    };
  }
  const trialDates = {
    trialEndsAt: trial.endsAt,
    trialGraceEndsAt: trial.graceEndsAt,
    degradationStartedAt: trial.endsAt,
  };
  if (input.now <= new Date(trial.endsAt).getTime()) {
    return { lifecycle: 'active', tariffId: trial.tariffId, source: 'trial', ...trialDates };
  }
  if (input.now <= new Date(trial.graceEndsAt).getTime()) {
    return { lifecycle: 'grace', tariffId: trial.tariffId, source: 'trial', ...trialDates };
  }
  if (trial.postTrialBehavior === 'tariff') {
    return {
      lifecycle: 'active',
      tariffId: trial.postTrialTariffId,
      source: 'post_trial_tariff',
      ...trialDates,
    };
  }
  return {
    lifecycle: trial.postTrialBehavior === 'blocked' ? 'blocked' : 'read_only',
    tariffId: trial.tariffId,
    source: 'trial',
    ...trialDates,
  };
}

async function readStaffSnapshot(organizationId: string): Promise<OrgEntitlementSnapshot> {
  return getDrizzle().transaction(async (tx) => {
    const [organization] = await tx
      .select({
        tariffId: beOrganizations.tariffId,
        commercialAccessState: beOrganizations.commercialAccessState,
      })
      .from(beOrganizations)
      .where(eq(beOrganizations.id, organizationId))
      .limit(1);
    if (!organization) throw new Error('organization_not_found');

    const [trial] = await tx
      .select({
        tariffId: saasOrganizationTrials.tariffId,
        endsAt: saasOrganizationTrials.endsAt,
        graceEndsAt: saasOrganizationTrials.graceEndsAt,
        postTrialBehavior: saasOrganizationTrials.postTrialBehavior,
        postTrialTariffId: saasOrganizationTrials.postTrialTariffId,
      })
      .from(saasOrganizationTrials)
      .where(
        and(
          eq(saasOrganizationTrials.organizationId, organizationId),
          eq(saasOrganizationTrials.status, 'active'),
        ),
      )
      .limit(1);
    const access = resolveAccess({
      organizationTariffId: organization.tariffId,
      commercialAccessState: organization.commercialAccessState as
        | 'compatibility'
        | 'no_trial'
        | 'trial_pending'
        | 'active',
      trial: trial ?? null,
      now: Date.now(),
    });
    const [tariff] = access.tariffId
      ? await tx
          .select({
            id: saasTariffs.id,
            name: saasTariffs.name,
            mechanics: saasTariffs.mechanics,
            quotas: saasTariffs.quotas,
            systemAccessPolicy: saasTariffs.systemAccessPolicy,
            mechanicAccessPolicies: saasTariffs.mechanicAccessPolicies,
            includedSeats: saasTariffs.includedSeats,
            includedSeatsWarningAtPercent: saasTariffs.includedSeatsWarningAtPercent,
          })
          .from(saasTariffs)
          .where(eq(saasTariffs.id, access.tariffId))
          .limit(1)
      : [];
    const overrides = await tx
      .select({
        mechanic: saasOrgEntitlementOverrides.mechanic,
        enabled: saasOrgEntitlementOverrides.enabled,
        quota: saasOrgEntitlementOverrides.quota,
        expiresAt: saasOrgEntitlementOverrides.expiresAt,
        seatLimitOverride: saasOrgEntitlementOverrides.seatLimitOverride,
      })
      .from(saasOrgEntitlementOverrides)
      .where(eq(saasOrgEntitlementOverrides.organizationId, organizationId));
    return {
      tariff: tariff
        ? {
            id: tariff.id,
            name: tariff.name,
            mechanics: tariff.mechanics,
            quotas: tariff.quotas as TariffQuotaMap,
            systemAccessPolicy: tariff.systemAccessPolicy as AccessLifecyclePolicy | null,
            mechanicAccessPolicies:
              tariff.mechanicAccessPolicies as MechanicAccessPolicyMap,
            includedSeats: tariff.includedSeats,
            includedSeatsWarningAtPercent: tariff.includedSeatsWarningAtPercent,
          }
        : null,
      overrides: overrides.map((override) => ({
        ...override,
        quota: override.quota as TariffQuota | null,
      })),
      access,
    };
  });
}

async function readSnapshot(organizationId: string): Promise<OrgEntitlementSnapshot> {
  return (await readCurrentPatientSnapshot(organizationId)) ?? readStaffSnapshot(organizationId);
}

/** Exact-org effective access. Patient reads use only the signed SECURITY DEFINER capability. */
export function createPgOrgEntitlementsPort(): OrgEntitlementsPort {
  return {
    async resolveMechanicAccess(organizationId: string, mechanic: OrgMechanic) {
      const result = await runWebappPgText<MechanicAccessRow>(
        `SELECT state, policy_source, warning
         FROM app.resolve_organization_mechanic_access($1::uuid, $2::text)`,
        [organizationId, mechanic],
      );
      const row = result.rows[0];
      if (!row) throw new Error('organization_mechanic_access_denied');
      return {
        mechanic,
        state: row.state,
        policySource: row.policy_source,
        warning: row.warning,
      };
    },
    getSnapshot: readSnapshot,
    async getTariffForOrg(organizationId) {
      return (await readSnapshot(organizationId)).tariff;
    },
    async listOverrides(organizationId) {
      return (await readSnapshot(organizationId)).overrides;
    },
    async getEffectiveCommercialAccess(organizationId) {
      return (await readSnapshot(organizationId)).access;
    },
    async getEnforcedQuotaUsage(organizationId) {
      const enforcedUsage = await runWebappPgText<{ clinic_team_used: number }>(
        `SELECT clinic_team_used
         FROM app.read_org_enforced_quota_usage($1::uuid)`,
        [organizationId],
      );
      const usage = enforcedUsage.rows[0];
      return {
        clinic_team: usage?.clinic_team_used ?? 0,
      };
    },
  };
}
