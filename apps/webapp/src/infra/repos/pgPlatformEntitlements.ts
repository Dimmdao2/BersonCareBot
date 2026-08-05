import { and, eq, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type {
  PlatformEntitlementsPort,
  PlatformMutationAudit,
  PlatformTrialStatus,
} from '@/modules/org-entitlements/ports';
import type {
  AccessLifecyclePolicy,
  DowngradePolicyMap,
  EffectiveOrgCommercialAccess,
  MailingTemplate,
  MechanicAccessPolicyMap,
  OrgEntitlementOverride,
  RegistrationTariffPolicy,
  Tariff,
  TariffQuota,
  TariffQuotaMap,
  TrialPolicy,
} from '@/modules/org-entitlements/types';
import { beBranches, beOrganizations } from '../../../db/schema/bookingEngine';
import { saasBillingSubscriptions } from '../../../db/schema/saasBilling';
import {
  saasOrganizationTrials,
  saasOrgEntitlementOverrides,
  saasRegistrationTariffPolicy,
  saasTariffs,
  saasTrialPolicy,
} from '../../../db/schema/saasEntitlements';
import { adminAuditLog } from '../../../db/schema/schema';
import { PLATFORM_OPERATIONS_DB_SOURCE } from '@/shared/security/platformOperationsPrincipal';

type Db = ReturnType<typeof getDrizzle>;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

type EnforcedQuotaUsageRow = {
  clinic_team_used: number | string;
  patient_count_used: number | string;
  files_used: number | string;
};

function numericUsage(value: number | string | undefined, field: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`invalid_platform_quota_usage_${field}`);
  }
  return parsed;
}

function withoutLegacyClinicalTestConfiguration<T>(value: Record<string, T>): Record<string, T> {
  const { clinical_tests: _legacyClinicalTests, ...current } = value;
  return current;
}

function toTariff(row: typeof saasTariffs.$inferSelect): Tariff {
  return {
    ...row,
    billingPeriod: row.billingPeriod as Tariff['billingPeriod'],
    // Owner 02.08: stored tariff JSON can retain the former key, but it is no longer a
    // configurable tariff surface or serialized mechanic.
    mechanics: withoutLegacyClinicalTestConfiguration(row.mechanics),
    quotas: row.quotas as TariffQuotaMap,
    systemAccessPolicy: row.systemAccessPolicy as AccessLifecyclePolicy | null,
    mechanicAccessPolicies: withoutLegacyClinicalTestConfiguration(
      row.mechanicAccessPolicies,
    ) as MechanicAccessPolicyMap,
    downgradePolicies: withoutLegacyClinicalTestConfiguration(
      row.downgradePolicies,
    ) as DowngradePolicyMap,
    mailingTemplates: row.mailingTemplates as MailingTemplate[],
  };
}

function toTrialPolicy(row: typeof saasTrialPolicy.$inferSelect): TrialPolicy {
  return {
    durationDays: row.durationDays,
    discountWindowDays: row.discountWindowDays,
    startEvent: row.startEvent as TrialPolicy['startEvent'],
    postTrialBehavior: row.postTrialBehavior as TrialPolicy['postTrialBehavior'],
    postTrialTariffId: row.postTrialTariffId,
    isActive: row.isActive,
  };
}

function toRegistrationTariffPolicy(
  row: typeof saasRegistrationTariffPolicy.$inferSelect | undefined,
): RegistrationTariffPolicy {
  return { tariffId: row?.tariffId ?? null };
}

async function appendAudit(
  tx: Transaction,
  input: {
    audit: PlatformMutationAudit;
    action: string;
    targetId: string;
    organizationId: string | null;
    before: unknown;
    after: unknown;
  },
): Promise<void> {
  await tx.insert(adminAuditLog).values({
    organizationId: input.organizationId,
    actorId: input.audit.actorId,
    action: input.action,
    targetId: input.targetId,
    details: { reason: input.audit.reason, before: input.before, after: input.after },
    status: 'ok',
  });
}

async function requireActiveTariff(tx: Transaction, tariffId: string): Promise<void> {
  const row = await tx
    .select({ id: saasTariffs.id })
    .from(saasTariffs)
    .where(and(eq(saasTariffs.id, tariffId), eq(saasTariffs.isActive, true)))
    .limit(1)
    .for('update');
  if (!row[0]) throw new Error('active_tariff_not_found');
}

async function assertTariffNotUsedByActiveTrialPolicy(
  tx: Transaction,
  tariffId: string,
): Promise<void> {
  const policy = await tx
    .select({ key: saasTrialPolicy.key })
    .from(saasTrialPolicy)
    .where(and(eq(saasTrialPolicy.isActive, true), eq(saasTrialPolicy.postTrialTariffId, tariffId)))
    .limit(1);
  if (policy[0]) throw new Error('tariff_used_by_trial_policy');
}

async function assertTariffNotUsedByRegistrationTariffPolicy(
  tx: Transaction,
  tariffId: string,
): Promise<void> {
  const policy = await tx
    .select({ key: saasRegistrationTariffPolicy.key })
    .from(saasRegistrationTariffPolicy)
    .where(
      and(
        eq(saasRegistrationTariffPolicy.key, 'global'),
        eq(saasRegistrationTariffPolicy.tariffId, tariffId),
      ),
    )
    .limit(1);
  if (policy[0]) throw new Error('tariff_used_by_registration_tariff_policy');
}

function tariffValues(input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    name: input.name,
    description: input.description,
    priceMinor: input.priceMinor,
    currency: input.currency,
    billingPeriod: input.billingPeriod,
    mechanics: input.mechanics,
    quotas: input.quotas,
    systemAccessPolicy: input.systemAccessPolicy,
    mechanicAccessPolicies: {},
    downgradePolicies: input.downgradePolicies,
    mailingTemplates: input.mailingTemplates,
    includedSeats: input.includedSeats,
    additionalSeatPriceMinor: input.additionalSeatPriceMinor,
    discountedPriceMinor: input.discountedPriceMinor,
    isActive: input.isActive,
    updatedAt: new Date().toISOString(),
  };
}

function assertPlatformOperationsPrincipal(): void {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind !== 'platform' || principal.source !== PLATFORM_OPERATIONS_DB_SOURCE) {
    throw new Error('platform_operations_principal_required');
  }
}

export function effectiveAccessForPlatform(input: {
  tariffId: string | null;
  trial: typeof saasOrganizationTrials.$inferSelect | null;
  now: number;
}): EffectiveOrgCommercialAccess {
  const trial = input.trial?.status === 'active' ? input.trial : null;
  if (!trial) {
    return {
      lifecycle: 'active',
      tariffId: input.tariffId,
      source: 'assignment',
    };
  }
  if (input.now <= new Date(trial.endsAt).getTime()) {
    return {
      lifecycle: 'active',
      tariffId: trial.tariffId,
      source: 'trial',
      degradationStartedAt: trial.endsAt,
    };
  }
  // #1069 Т5-Т8 (owner 03.08): the post-trial rule applies the instant `endsAt` passes — there is
  // no further access-extending `grace` stage. The discount-payment window (`discountEndsAt`) runs
  // in parallel and never appears here; it does not change access.
  if (trial.postTrialBehavior === 'tariff') {
    return { lifecycle: 'active', tariffId: trial.postTrialTariffId, source: 'post_trial_tariff' };
  }
  return {
    lifecycle: trial.postTrialBehavior === 'blocked' ? 'blocked' : 'read_only',
    tariffId: trial.tariffId,
    source: 'trial',
    degradationStartedAt: trial.endsAt,
  };
}

function effectiveTrialStatus(
  trial: typeof saasOrganizationTrials.$inferSelect,
  now: number,
): PlatformTrialStatus {
  if (trial.status !== 'active') return 'ended';
  if (now <= new Date(trial.endsAt).getTime()) return 'active';
  return 'expired';
}

function toOverride(row: typeof saasOrgEntitlementOverrides.$inferSelect): OrgEntitlementOverride {
  return { ...row, quota: row.quota as TariffQuota | null };
}

async function startTrialForOrganization(
  organizationId: string,
  audit: PlatformMutationAudit,
): Promise<{ created: boolean; endsAt: string } | null> {
  return getDrizzle().transaction(async (tx) => {
    const [policyRow] = await tx
      .select()
      .from(saasTrialPolicy)
      .where(and(eq(saasTrialPolicy.key, 'global'), eq(saasTrialPolicy.isActive, true)))
      .limit(1);
    if (!policyRow) return null;
    // #1069 Т3/Т5 (owner 03.08): the trial is a one-time period on the organization's ALREADY
    // assigned tariff, whatever it is — it no longer carries its own separate tariff.
    const [organization] = await tx
      .select({ tariffId: beOrganizations.tariffId })
      .from(beOrganizations)
      .where(eq(beOrganizations.id, organizationId))
      .limit(1)
      .for('update');
    if (!organization) throw new Error('organization_not_found');
    if (!organization.tariffId) throw new Error('organization_tariff_required_for_trial');
    await requireActiveTariff(tx, organization.tariffId);
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + policyRow.durationDays * 86_400_000);
    const discountEndsAt = new Date(
      endsAt.getTime() + policyRow.discountWindowDays * 86_400_000,
    );
    const [created] = await tx
      .insert(saasOrganizationTrials)
      .values({
        organizationId,
        tariffId: organization.tariffId,
        startedAt: startedAt.toISOString(),
        endsAt: endsAt.toISOString(),
        discountEndsAt: discountEndsAt.toISOString(),
        postTrialBehavior: policyRow.postTrialBehavior,
        postTrialTariffId: policyRow.postTrialTariffId,
        createdBy: audit.actorId,
      })
      .onConflictDoNothing({ target: saasOrganizationTrials.organizationId })
      .returning();
    if (!created) {
      const [existing] = await tx
        .select({ endsAt: saasOrganizationTrials.endsAt })
        .from(saasOrganizationTrials)
        .where(eq(saasOrganizationTrials.organizationId, organizationId))
        .limit(1);
      if (!existing) throw new Error('trial_start_conflict');
      return { created: false, endsAt: existing.endsAt };
    }
    await appendAudit(tx, {
      audit,
      action: 'saas_trial_start',
      targetId: created.id,
      organizationId,
      before: null,
      after: created,
    });
    return { created: true, endsAt: created.endsAt };
  });
}

export function createPgPlatformEntitlementsPort(dependencies?: {
  assignManualTariff(input: {
    organizationId: string;
    tariffId: string | null;
    applyAtNextPeriod?: boolean;
    audit: PlatformMutationAudit;
  }): Promise<void>;
}): PlatformEntitlementsPort {
  return {
    async listTariffs() {
      assertPlatformOperationsPrincipal();
      const rows = await getDrizzle().select().from(saasTariffs).orderBy(saasTariffs.name);
      return rows.map(toTariff);
    },

    async listOrganizations() {
      assertPlatformOperationsPrincipal();
      return getDrizzle().transaction(async (tx) => {
        const [organizations, trials, overrides, manualSaasBillingRows] = await Promise.all([
          tx
            .select({
              id: beOrganizations.id,
              title: beOrganizations.title,
              tariffId: beOrganizations.tariffId,
              isActive: beOrganizations.isActive,
            })
            .from(beOrganizations)
            .orderBy(beOrganizations.title),
          tx.select().from(saasOrganizationTrials),
          tx.select().from(saasOrgEntitlementOverrides),
          tx
            .select({
              organizationId: saasBillingSubscriptions.organizationId,
              tariffId: saasBillingSubscriptions.tariffId,
              pendingTariffId: saasBillingSubscriptions.pendingTariffId,
              currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
            })
            .from(saasBillingSubscriptions)
            .where(
              and(
                eq(saasBillingSubscriptions.source, 'manual'),
                eq(saasBillingSubscriptions.status, 'active'),
              ),
            ),
        ]);
        const trialByOrg = new Map(trials.map((trial) => [trial.organizationId, trial]));
        const overridesByOrg = new Map<string, OrgEntitlementOverride[]>();
        for (const override of overrides) {
          // Leave legacy override rows intact in storage, but never expose them as a tariff control.
          if (override.mechanic === 'clinical_tests') continue;
          const current = overridesByOrg.get(override.organizationId) ?? [];
          current.push(toOverride(override));
          overridesByOrg.set(override.organizationId, current);
        }
        const now = Date.now();
        const manualTariffByOrg = new Map(
          manualSaasBillingRows.map((row) => [row.organizationId, row.tariffId]),
        );
        const scheduledTariffByOrg = new Map(
          manualSaasBillingRows
            .filter((row) => row.pendingTariffId !== null && row.currentPeriodEndsAt !== null)
            .map((row) => [
              row.organizationId,
              { tariffId: row.pendingTariffId as string, effectiveAt: row.currentPeriodEndsAt as string },
            ]),
        );
        return organizations.map((organization) => {
          const trial = trialByOrg.get(organization.id) ?? null;
          const effectiveAccess = effectiveAccessForPlatform({
            tariffId: organization.tariffId,
            trial,
            now,
          });
          return {
            ...organization,
            manualTariffId: manualTariffByOrg.get(organization.id) ?? null,
            scheduledTariff: scheduledTariffByOrg.get(organization.id) ?? null,
            effectiveAccess,
            overrides: overridesByOrg.get(organization.id) ?? [],
            trial: trial
              ? {
                  id: trial.id,
                  tariffId: trial.tariffId,
                  status: effectiveTrialStatus(trial, now),
                  startedAt: trial.startedAt,
                  endsAt: trial.endsAt,
                  discountEndsAt: trial.discountEndsAt,
                }
              : null,
          };
        });
      });
    },

    async getOrganizationMechanicUsage(organizationId) {
      assertPlatformOperationsPrincipal();
      const [enforcedUsage, [branchesRow]] = await Promise.all([
        runWebappPgText<EnforcedQuotaUsageRow>(
          `SELECT clinic_team_used, patient_count_used, files_used
           FROM app.read_org_enforced_quota_usage($1::uuid)`,
          [organizationId],
        ),
        getDrizzle()
          .select({ used: sql<number>`count(*)::int` })
          .from(beBranches)
          .where(and(eq(beBranches.organizationId, organizationId), eq(beBranches.isActive, true))),
      ]);
      const usage = enforcedUsage.rows[0];
      return {
        clinic_team: numericUsage(usage?.clinic_team_used, 'clinic_team'),
        patient_count: numericUsage(usage?.patient_count_used, 'patient_count'),
        branches: numericUsage(branchesRow?.used, 'branches'),
        files: numericUsage(usage?.files_used, 'files'),
      };
    },

    async getTrialPolicy() {
      assertPlatformOperationsPrincipal();
      const rows = await getDrizzle()
        .select()
        .from(saasTrialPolicy)
        .where(eq(saasTrialPolicy.key, 'global'))
        .limit(1);
      return rows[0] ? toTrialPolicy(rows[0]) : null;
    },

    async getRegistrationTariffPolicy() {
      assertPlatformOperationsPrincipal();
      const rows = await getDrizzle()
        .select()
        .from(saasRegistrationTariffPolicy)
        .where(eq(saasRegistrationTariffPolicy.key, 'global'))
        .limit(1);
      return toRegistrationTariffPolicy(rows[0]);
    },

    async createTariff(input, audit) {
      assertPlatformOperationsPrincipal();
      return getDrizzle().transaction(async (tx) => {
        const [row] = await tx.insert(saasTariffs).values(tariffValues(input)).returning();
        if (!row) throw new Error('tariff_create_failed');
        await appendAudit(tx, {
          audit,
          action: 'saas_tariff_create',
          targetId: row.id,
          organizationId: null,
          before: null,
          after: row,
        });
        return toTariff(row);
      });
    },

    async updateTariff(id, input, audit) {
      assertPlatformOperationsPrincipal();
      return getDrizzle().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(saasTariffs)
          .where(eq(saasTariffs.id, id))
          .limit(1)
          .for('update');
        if (!before) throw new Error('tariff_not_found');
        if (before.isActive && !input.isActive) {
          await assertTariffNotUsedByActiveTrialPolicy(tx, id);
          await assertTariffNotUsedByRegistrationTariffPolicy(tx, id);
        }
        const [row] = await tx
          .update(saasTariffs)
          .set(tariffValues(input))
          .where(eq(saasTariffs.id, id))
          .returning();
        if (!row) throw new Error('tariff_update_failed');
        await appendAudit(tx, {
          audit,
          action: 'saas_tariff_update',
          targetId: id,
          organizationId: null,
          before,
          after: row,
        });
        return toTariff(row);
      });
    },

    async archiveTariff(id, audit) {
      assertPlatformOperationsPrincipal();
      await getDrizzle().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(saasTariffs)
          .where(eq(saasTariffs.id, id))
          .limit(1)
          .for('update');
        if (!before) throw new Error('tariff_not_found');
        await assertTariffNotUsedByActiveTrialPolicy(tx, id);
        await assertTariffNotUsedByRegistrationTariffPolicy(tx, id);
        const [after] = await tx
          .update(saasTariffs)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(saasTariffs.id, id))
          .returning();
        await appendAudit(tx, {
          audit,
          action: 'saas_tariff_deactivate',
          targetId: id,
          organizationId: null,
          before,
          after,
        });
      });
    },

    async assignTariff(organizationId, tariffId, audit, options) {
      assertPlatformOperationsPrincipal();
      if (!dependencies) throw new Error('saas_billing_service_required');
      await dependencies.assignManualTariff({
        organizationId,
        tariffId,
        applyAtNextPeriod: options?.applyAtNextPeriod,
        audit,
      });
    },

    async upsertOverride(input, audit) {
      assertPlatformOperationsPrincipal();
      await getDrizzle().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(saasOrgEntitlementOverrides)
          .where(
            and(
              eq(saasOrgEntitlementOverrides.organizationId, input.organizationId),
              eq(saasOrgEntitlementOverrides.mechanic, input.mechanic),
            ),
          )
          .limit(1);
        const values = {
          organizationId: input.organizationId,
          mechanic: input.mechanic,
          enabled: input.enabled,
          quota: input.quota as TariffQuota | null,
          expiresAt: input.expiresAt,
          updatedAt: new Date().toISOString(),
        };
        const [after] = await tx
          .insert(saasOrgEntitlementOverrides)
          .values(values)
          .onConflictDoUpdate({
            target: [
              saasOrgEntitlementOverrides.organizationId,
              saasOrgEntitlementOverrides.mechanic,
            ],
            set: values,
          })
          .returning();
        await appendAudit(tx, {
          audit,
          action: 'saas_entitlement_override_upsert',
          targetId: `${input.organizationId}:${input.mechanic}`,
          organizationId: input.organizationId,
          before: before ?? null,
          after,
        });
      });
    },

    async deleteOverride(organizationId, mechanic, audit) {
      assertPlatformOperationsPrincipal();
      await getDrizzle().transaction(async (tx) => {
        const [before] = await tx
          .delete(saasOrgEntitlementOverrides)
          .where(
            and(
              eq(saasOrgEntitlementOverrides.organizationId, organizationId),
              eq(saasOrgEntitlementOverrides.mechanic, mechanic),
            ),
          )
          .returning();
        await appendAudit(tx, {
          audit,
          action: 'saas_entitlement_override_delete',
          targetId: `${organizationId}:${mechanic}`,
          organizationId,
          before: before ?? null,
          after: null,
        });
      });
    },

    async setTrialPolicy(policy, audit) {
      assertPlatformOperationsPrincipal();
      await getDrizzle().transaction(async (tx) => {
        if (policy.postTrialTariffId) await requireActiveTariff(tx, policy.postTrialTariffId);
        const [before] = await tx
          .select()
          .from(saasTrialPolicy)
          .where(eq(saasTrialPolicy.key, 'global'))
          .limit(1);
        const values = {
          ...policy,
          key: 'global',
          updatedBy: audit.actorId,
          updatedAt: new Date().toISOString(),
        };
        const [after] = await tx
          .insert(saasTrialPolicy)
          .values(values)
          .onConflictDoUpdate({ target: saasTrialPolicy.key, set: values })
          .returning();
        await appendAudit(tx, {
          audit,
          action: 'saas_trial_policy_update',
          targetId: 'global',
          organizationId: null,
          before: before ?? null,
          after,
        });
      });
    },

    async setRegistrationTariffPolicy(policy, audit) {
      assertPlatformOperationsPrincipal();
      await getDrizzle().transaction(async (tx) => {
        if (policy.tariffId) await requireActiveTariff(tx, policy.tariffId);
        const [before] = await tx
          .select()
          .from(saasRegistrationTariffPolicy)
          .where(eq(saasRegistrationTariffPolicy.key, 'global'))
          .limit(1);
        const values = {
          key: 'global' as const,
          tariffId: policy.tariffId,
          updatedBy: audit.actorId,
          updatedAt: new Date().toISOString(),
        };
        const [after] = await tx
          .insert(saasRegistrationTariffPolicy)
          .values(values)
          .onConflictDoUpdate({ target: saasRegistrationTariffPolicy.key, set: values })
          .returning();
        await appendAudit(tx, {
          audit,
          action: 'saas_registration_tariff_policy_update',
          targetId: 'global',
          organizationId: null,
          before: before ?? null,
          after,
        });
      });
    },

    async startTrial(organizationId, audit) {
      assertPlatformOperationsPrincipal();
      return startTrialForOrganization(organizationId, audit);
    },
  };
}
