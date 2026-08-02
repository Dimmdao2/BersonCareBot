import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type {
  AccessLifecyclePolicy,
  CabinetAccessResolution,
  EffectiveOrgCommercialAccess,
  MechanicAccessResolution,
  MechanicAccessPolicyMap,
  OrgEntitlementSnapshot,
  OrgMechanic,
  TariffQuota,
  TariffQuotaMap,
} from '@/modules/org-entitlements/types';
import {
  beBranches,
  beOrganizationMembers,
  beOrganizations,
  orgEnrollments,
} from '../../../db/schema/bookingEngine';
import { organizationMemberInvites } from '../../../db/schema/organizationMemberInvites';
import { patientFiles } from '../../../db/schema/patientFiles';
import {
  saasOrganizationTrials,
  saasOrgEntitlementOverrides,
} from '../../../db/schema/saasEntitlements';

type Db = ReturnType<typeof getDrizzle>;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

type CurrentPatientEntitlementRow = {
  tariff_mechanics: Record<string, boolean> | null;
  tariff_quotas: TariffQuotaMap | null;
  tariff_system_access_policy: AccessLifecyclePolicy | null;
  tariff_mechanic_access_policies: MechanicAccessPolicyMap | null;
  included_seats: number | null;
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

type CabinetAccessRow = {
  state: CabinetAccessResolution['state'];
  policy_source: CabinetAccessResolution['policySource'];
  warning: CabinetAccessResolution['warning'];
};

type EnforcedQuotaUsageRow = {
  clinic_team_used: number | string;
  patient_count_used: number | string;
  files_used: number | string;
};

function numericQuotaUsage(value: number | string | undefined, field: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`invalid_enforced_quota_usage_${field}`);
  }
  return parsed;
}

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
      source: 'assignment',
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

type EffectiveTariffRow = {
  id: string;
  name: string;
  mechanics: Record<string, boolean>;
  quotas: Record<string, unknown>;
  system_access_policy: Record<string, unknown> | null;
  mechanic_access_policies: Record<string, unknown>;
  included_seats: number | null;
};

/**
 * §2.12 — the tenant-callable `app.saas_billing_effective_tariff_for_current_org` first binds this
 * read to the signed organization, then delegates to the ONE frozen/live switch from migration
 * 0295. This mirrors the SQL doors without reimplementing the frozen/live decision.
 */
async function readEffectiveTariff(
  tx: Transaction,
  organizationId: string,
  tariffId: string,
): Promise<EffectiveTariffRow | null> {
  const tariffFunction =
    getCurrentDbPrincipal()?.kind === 'platform'
      ? sql`app.saas_billing_effective_tariff`
      : sql`app.saas_billing_effective_tariff_for_current_org`;
  const result = await tx.execute(sql`
    SELECT id, name, mechanics, quotas, system_access_policy, mechanic_access_policies, included_seats
    FROM ${tariffFunction}(
      ${organizationId}::uuid,
      ${tariffId}::uuid
    )
  `);
  return (result.rows[0] as EffectiveTariffRow | undefined) ?? null;
}

async function readStaffSnapshot(organizationId: string): Promise<OrgEntitlementSnapshot> {
  return getDrizzle().transaction(async (tx) => {
    const [organization] = await tx
      .select({
        tariffId: beOrganizations.tariffId,
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
      trial: trial ?? null,
      now: Date.now(),
    });
    const tariff = access.tariffId
      ? await readEffectiveTariff(tx, organizationId, access.tariffId)
      : null;
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
            systemAccessPolicy: tariff.system_access_policy as AccessLifecyclePolicy | null,
            mechanicAccessPolicies: tariff.mechanic_access_policies as MechanicAccessPolicyMap,
            includedSeats: tariff.included_seats,
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
    async resolveCabinetAccess(organizationId: string) {
      const result = await runWebappPgText<CabinetAccessRow>(
        `SELECT state, policy_source, warning
         FROM app.resolve_organization_cabinet_access($1::uuid)`,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('organization_cabinet_access_denied');
      return {
        state: row.state,
        policySource: row.policy_source,
        warning: row.warning,
      };
    },
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
      // §5a stage 6.2 (platform report): `be_branches` already carries a direct
      // `app_platform_settings` SELECT policy (`be_branches_platform_operations_select` in
      // c5a-platform-operations-runtime.sql), so branches usage needs no SECURITY DEFINER hop.
      const [enforcedUsage, [branchesRow]] = await Promise.all([
        runWebappPgText<EnforcedQuotaUsageRow>(
          `SELECT clinic_team_used, patient_count_used, files_used
           FROM app.read_org_enforced_quota_usage($1::uuid)`,
          [organizationId],
        ),
        getDrizzle()
          .select({ value: sql<number>`count(*)::int` })
          .from(beBranches)
          .where(
            and(eq(beBranches.organizationId, organizationId), eq(beBranches.isActive, true)),
          ),
      ]);
      const usage = enforcedUsage.rows[0];
      return {
        clinic_team: numericQuotaUsage(usage?.clinic_team_used, 'clinic_team'),
        patient_count: numericQuotaUsage(usage?.patient_count_used, 'patient_count'),
        files: numericQuotaUsage(usage?.files_used, 'files'),
        branches: Number(branchesRow?.value ?? 0),
      };
    },
    async getOwnQuotaUsage(organizationId) {
      const db = getDrizzle();
      // Same formula as each mechanic's write-path check (stockQuotaCheck.ts callers below), read
      // outside their transaction. Every source table's RLS already scopes rows to the caller's
      // own organization for the staff principal, so no SECURITY DEFINER hop is needed here.
      const [[branchesRow], [patientsRow], [filesRow], acceptedSeatRows] = await Promise.all([
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(beBranches)
          .where(and(eq(beBranches.organizationId, organizationId), eq(beBranches.isActive, true))),
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(orgEnrollments)
          .where(
            and(
              eq(orgEnrollments.organizationId, organizationId),
              inArray(orgEnrollments.status, ['invited', 'active']),
            ),
          ),
        db
          .select({ value: sql<number>`COALESCE(SUM(${patientFiles.sizeBytes}), 0)::bigint` })
          .from(patientFiles)
          .where(eq(patientFiles.organizationId, organizationId)),
        // clinic_team, same three-part formula as `read_org_enforced_quota_usage` in
        // c5a-platform-operations-runtime.sql: active members with a specialist seat, plus
        // pending doctor invites, plus accepted doctor invites whose membership has no seat yet.
        Promise.all([
          db
            .select({ value: sql<number>`count(*)::int` })
            .from(beOrganizationMembers)
            .where(
              and(
                eq(beOrganizationMembers.organizationId, organizationId),
                eq(beOrganizationMembers.status, 'active'),
                sql`${beOrganizationMembers.specialistId} is not null`,
              ),
            ),
          db
            .select({ value: sql<number>`count(*)::int` })
            .from(organizationMemberInvites)
            .where(
              and(
                eq(organizationMemberInvites.organizationId, organizationId),
                eq(organizationMemberInvites.status, 'pending'),
                gt(organizationMemberInvites.expiresAt, sql`now()`),
                eq(organizationMemberInvites.invitedRole, 'doctor'),
              ),
            ),
          db
            .select({ value: sql<number>`count(*)::int` })
            .from(organizationMemberInvites)
            .innerJoin(
              beOrganizationMembers,
              eq(beOrganizationMembers.id, organizationMemberInvites.acceptedMembershipId),
            )
            .where(
              and(
                eq(organizationMemberInvites.organizationId, organizationId),
                eq(organizationMemberInvites.status, 'accepted'),
                eq(organizationMemberInvites.invitedRole, 'doctor'),
                eq(beOrganizationMembers.status, 'active'),
                isNull(beOrganizationMembers.specialistId),
              ),
            ),
        ]),
      ]);
      const [activeSeats, pendingSeatInvites, acceptedSeatInvites] = acceptedSeatRows;
      return {
        branches: Number(branchesRow?.value ?? 0),
        patient_count: Number(patientsRow?.value ?? 0),
        files: Number(filesRow?.value ?? 0),
        clinic_team:
          Number(activeSeats[0]?.value ?? 0) +
          Number(pendingSeatInvites[0]?.value ?? 0) +
          Number(acceptedSeatInvites[0]?.value ?? 0),
      };
    },
  };
}
