import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import {
  resolveCommercialAccess,
  type CommercialAccessPaidPeriodInput,
  type CommercialAccessTrialInput,
} from '@/infra/repos/commercialAccessComputation';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type {
  AccessLifecyclePolicy,
  CabinetAccessResolution,
  EffectiveOrgCommercialAccess,
  MailingTemplate,
  MechanicAccessResolution,
  MechanicAccessPolicyMap,
  OrgEntitlementSnapshot,
  OrgMechanic,
  Tariff,
  TariffQuota,
  TariffQuotaMap,
} from '@/modules/org-entitlements/types';
import { beBranches, beOrganizations } from '../../../db/schema/bookingEngine';
import { saasBillingSubscriptions } from '../../../db/schema/saasBilling';
import {
  saasOrganizationTrials,
  saasOrgEntitlementOverrides,
  saasPaidPeriodPolicy,
  saasTariffs,
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

type OwnTariffTransitionUsageRow = EnforcedQuotaUsageRow & {
  organization_id: string;
  branches_used: number | string;
};

function toTariff(row: typeof saasTariffs.$inferSelect): Tariff {
  return {
    ...row,
    billingPeriod: row.billingPeriod as Tariff['billingPeriod'],
    quotas: row.quotas as TariffQuotaMap,
    systemAccessPolicy: row.systemAccessPolicy as AccessLifecyclePolicy | null,
    mechanicAccessPolicies: row.mechanicAccessPolicies as MechanicAccessPolicyMap,
    downgradePolicies: row.downgradePolicies as Tariff['downgradePolicies'],
    mailingTemplates: row.mailingTemplates as MailingTemplate[],
  };
}

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

export function resolveAccess(input: {
  organizationTariffId: string | null;
  trial: CommercialAccessTrialInput;
  paidPeriod?: CommercialAccessPaidPeriodInput;
  now: number;
}): EffectiveOrgCommercialAccess {
  return resolveCommercialAccess({
    organizationTariffId: input.organizationTariffId,
    trial: input.trial,
    paidPeriod: input.paidPeriod ?? null,
    now: input.now,
  });
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

    const [trial, paidPolicyRow, subscriptionPeriodRow] = await Promise.all([
      tx
        .select({
          tariffId: saasOrganizationTrials.tariffId,
          endsAt: saasOrganizationTrials.endsAt,
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
        .limit(1),
      tx
        .select({
          postPaidPeriodBehavior: saasPaidPeriodPolicy.postPaidPeriodBehavior,
          postPaidPeriodTariffId: saasPaidPeriodPolicy.postPaidPeriodTariffId,
        })
        .from(saasPaidPeriodPolicy)
        .where(
          and(eq(saasPaidPeriodPolicy.key, 'global'), eq(saasPaidPeriodPolicy.isActive, true)),
        )
        .limit(1),
      tx
        .select({
          periodEndsAt: sql<string | null>`max(${saasBillingSubscriptions.currentPeriodEndsAt})`,
        })
        .from(saasBillingSubscriptions)
        .where(
          and(
            eq(saasBillingSubscriptions.organizationId, organizationId),
            inArray(saasBillingSubscriptions.status, ['active', 'expired']),
            isNotNull(saasBillingSubscriptions.currentPeriodEndsAt),
          ),
        ),
    ]);
    const paidPeriod: CommercialAccessPaidPeriodInput =
      paidPolicyRow[0] && subscriptionPeriodRow[0]?.periodEndsAt
        ? {
            periodEndsAt: subscriptionPeriodRow[0].periodEndsAt,
            postPaidPeriodBehavior: paidPolicyRow[0].postPaidPeriodBehavior as
              | 'read_only'
              | 'blocked'
              | 'tariff',
            postPaidPeriodTariffId: paidPolicyRow[0].postPaidPeriodTariffId,
          }
        : null;
    const access = resolveAccess({
      organizationTariffId: organization.tariffId,
      trial: trial[0] ?? null,
      paidPeriod,
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
    async getActiveTariffById(tariffId) {
      const [tariff] = await getDrizzle()
        .select()
        .from(saasTariffs)
        .where(and(eq(saasTariffs.id, tariffId), eq(saasTariffs.isActive, true)))
        .limit(1);
      return tariff ? toTariff(tariff) : null;
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
      // Billing runs under app_clinic_billing, not app_staff. Keep the sensitive source rows behind
      // the existing aggregate seam and let the database derive the signed organization itself.
      const result = await runWebappPgText<OwnTariffTransitionUsageRow>(
        `SELECT organization_id, clinic_team_used, patient_count_used, files_used, branches_used
         FROM app.read_current_org_tariff_transition_usage()`,
      );
      const usage = result.rows[0];
      if (!usage || usage.organization_id !== organizationId) {
        throw new Error('own_tariff_transition_usage_context_denied');
      }
      return {
        branches: numericQuotaUsage(usage.branches_used, 'branches'),
        patient_count: numericQuotaUsage(usage.patient_count_used, 'patient_count'),
        files: numericQuotaUsage(usage.files_used, 'files'),
        clinic_team: numericQuotaUsage(usage.clinic_team_used, 'clinic_team'),
      };
    },
    async prepareLifecycleNotificationContext(organizationId) {
      const result = await runWebappPgText<{ payload: Record<string, string | null> }>(
        `SELECT app.prepare_organization_lifecycle_notification_context($1::uuid) AS payload`,
        [organizationId],
      );
      const payload = result.rows[0]?.payload;
      if (!payload) throw new Error('lifecycle_notification_context_unavailable');
      return {
        registeredAt: payload.registeredAt ?? null,
        trialStartedAt: payload.trialStartedAt ?? null,
        trialEndsAt: payload.trialEndsAt ?? null,
        discountEndsAt: payload.discountEndsAt ?? null,
      };
    },
  };
}
