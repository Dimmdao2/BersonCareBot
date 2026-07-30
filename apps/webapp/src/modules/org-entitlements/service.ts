import {
  CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE,
  MECHANIC_DEFAULT_ENABLED,
  MECHANIC_REGISTRY,
  MECHANICS,
  type OrgEntitlements,
  type OrgQuotaProjection,
  type EffectiveOrgCommercialAccess,
  type OrgEntitlementSnapshot,
  type OrgMechanic,
  type Tariff,
  type TariffQuota,
  type TariffQuotaMap,
  type TrialPolicy,
} from './types';
import type { OrgEntitlementsPort, PlatformEntitlementsPort, PlatformMutationAudit } from './ports';

function assertMechanic(value: string): asserts value is OrgMechanic {
  if (!MECHANICS.includes(value as OrgMechanic)) throw new Error('entitlement_mechanic_invalid');
}

function assertQuota(mechanic: OrgMechanic, quota: TariffQuota): void {
  if (MECHANIC_REGISTRY[mechanic].class !== 'объём' || quota.unit !== 'bytes') {
    throw new Error('tariff_quota_unit_invalid');
  }
  if (quota.kind === 'unlimited') {
    if (quota.limit !== null) throw new Error('tariff_quota_unlimited_limit_invalid');
    return;
  }
  if (!Number.isSafeInteger(quota.limit) || (quota.limit ?? -1) < 0) {
    throw new Error('tariff_quota_limit_invalid');
  }
}

function normalizeQuotaMap(quotas: TariffQuotaMap): TariffQuotaMap {
  const normalized: TariffQuotaMap = {};
  for (const [key, value] of Object.entries(quotas)) {
    if (key !== 'files' || !value) throw new Error('tariff_quota_mechanic_invalid');
    assertQuota('files', value);
    normalized.files = value;
  }
  return normalized;
}

function normalizeTariffInput(input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>) {
  const name = input.name.trim();
  if (!name) throw new Error('tariff_name_required');
  if (
    input.priceMinor !== null &&
    (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0)
  ) {
    throw new Error('tariff_price_invalid');
  }
  if (input.priceMinor !== null && !input.currency?.trim())
    throw new Error('tariff_currency_required');
  if (
    input.includedSeats !== null &&
    (!Number.isSafeInteger(input.includedSeats) || input.includedSeats < 0)
  ) {
    throw new Error('tariff_seat_limit_invalid');
  }
  const mechanics: Record<string, boolean> = {};
  for (const mechanic of Object.keys(input.mechanics)) assertMechanic(mechanic);
  for (const mechanic of MECHANICS) mechanics[mechanic] = input.mechanics[mechanic] === true;
  return {
    ...input,
    name,
    description: input.description.trim(),
    currency: input.currency?.trim().toUpperCase() ?? null,
    mechanics,
    quotas: normalizeQuotaMap(input.quotas),
  };
}

function assertTrialPolicy(policy: TrialPolicy): void {
  if (policy.startEvent !== 'organization_provisioned') {
    throw new Error('trial_start_event_unsupported');
  }
  if (!Number.isSafeInteger(policy.durationDays) || policy.durationDays <= 0) {
    throw new Error('trial_duration_invalid');
  }
  if (!Number.isSafeInteger(policy.graceDays) || policy.graceDays < 0) {
    throw new Error('trial_grace_invalid');
  }
  if (policy.postTrialBehavior === 'tariff' && !policy.postTrialTariffId) {
    throw new Error('trial_post_tariff_required');
  }
  if (policy.postTrialBehavior !== 'tariff' && policy.postTrialTariffId !== null) {
    throw new Error('trial_post_tariff_forbidden');
  }
}

function isOverrideActive(expiresAt: string | null | undefined): boolean {
  return !expiresAt || new Date(expiresAt).getTime() > Date.now();
}

/**
 * Exported so read-only surfaces (owner-facing billing tab) can derive the same effective
 * mechanic map from a single already-fetched `getSnapshot()` result, instead of re-querying via
 * `resolveOrgEntitlements` or reading tariff JSON directly. Same override > tariff > default
 * precedence as the rest of this module — this is not a second resolver.
 */
export function entitlementsFromSnapshot(
  snapshot: Pick<OrgEntitlementSnapshot, 'tariff' | 'overrides' | 'access'>,
): OrgEntitlements {
  const overrideByMechanic = new Map(
    snapshot.overrides
      .filter((override) => isOverrideActive(override.expiresAt))
      .map((override) => [override.mechanic, override.enabled]),
  );
  const result = {} as OrgEntitlements;
  for (const mechanic of MECHANICS) {
    result[mechanic] =
      overrideByMechanic.get(mechanic) ??
      snapshot.tariff?.mechanics[mechanic] ??
      (snapshot.access.source === 'no_trial' ? false : MECHANIC_DEFAULT_ENABLED[mechanic]);
  }
  return result;
}

/**
 * Returns a typed threshold projection only for quota keys that are really enforced today.
 * Declared future quota keys intentionally do not appear here.
 */
export async function resolveOrgQuotaProjections(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<OrgQuotaProjection[]> {
  const [snapshot, usage] = await Promise.all([
    port.getSnapshot(organizationId),
    port.getEnforcedQuotaUsage(organizationId),
  ]);
  const activeOverrides = new Map(
    snapshot.overrides
      .filter((override) => isOverrideActive(override.expiresAt))
      .map((override) => [override.mechanic, override]),
  );
  return MECHANICS.flatMap((mechanic) => {
    const mechanicClass = MECHANIC_REGISTRY[mechanic].class;
    if (mechanicClass !== 'места' && mechanicClass !== 'объём') return [];
    if (mechanic === 'clinic_team' && !entitlementsFromSnapshot(snapshot).clinic_team) return [];
    // Specialist seats are configured by includedSeats/seatLimitOverride rather than the generic
    // tariff quota map, but are enforced with the same snapshot semantics.
    const clinicTeamOverride = activeOverrides.get('clinic_team');
    const quota: TariffQuota | { kind: 'numeric'; limit: number; unit: 'seats' } | undefined =
      mechanic === 'clinic_team'
        ? {
            kind: 'numeric',
            limit: (
              clinicTeamOverride?.seatLimitOverride ??
              snapshot.tariff?.includedSeats ??
              CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE
            ),
            unit: 'seats',
          }
        : mechanic === 'files'
          ? ((activeOverrides.get(mechanic)?.quota ?? snapshot.tariff?.quotas.files) as
              | TariffQuota
              | undefined)
          : undefined;
    const currentUsage = usage[mechanic];
    if (!quota || quota.kind !== 'numeric' || quota.limit === null || currentUsage === undefined)
      return [];
    return [
      {
        mechanic,
        quota: { limit: quota.limit, unit: quota.unit },
        usage: currentUsage,
        threshold:
          currentUsage >= quota.limit
            ? 'reached'
            : currentUsage * 5 >= quota.limit * 4
              ? 'warning'
              : 'below_warning',
        enforcement: MECHANIC_REGISTRY[mechanic].quotaEnforcement,
      },
    ];
  });
}

export async function resolveOrgEntitlementSnapshot(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<{ entitlements: OrgEntitlements; access: EffectiveOrgCommercialAccess }> {
  const snapshot = await port.getSnapshot(organizationId);
  return { entitlements: entitlementsFromSnapshot(snapshot), access: snapshot.access };
}

/**
 * Store P0 — entitlement foundation. Resolves, for EACH canonical mechanic, the precedence
 * override > tariff > `MECHANIC_DEFAULT_ENABLED[mechanic]`. Default-true remains intentional for
 * compatibility mechanics. `clinic_team` (C4A), the current owner-only `courses` surface
 * (C4C), and access to the C4D platform exercise base are scoped exceptions: all default OFF
 * without a tariff or override. An OFF `exercise_catalog` never hides the clinic's own library.
 * See
 * STORE_P0_ENTITLEMENTS_PLAN.md and OWNER_REVIEW_2026-07-18.md §§13, 15.
 */
export async function resolveOrgEntitlements(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<OrgEntitlements> {
  const [tariff, overrides] = await Promise.all([
    port.getTariffForOrg(organizationId),
    port.listOverrides(organizationId),
  ]);

  return entitlementsFromSnapshot({
    tariff: tariff ? { ...tariff, quotas: tariff.quotas ?? {} } : null,
    overrides: overrides.map((override) => ({
      ...override,
      quota: override.quota ?? null,
      expiresAt: override.expiresAt ?? null,
    })),
    access: await port.getEffectiveCommercialAccess(organizationId),
  });
}

export async function isMechanicEnabled(
  port: OrgEntitlementsPort,
  organizationId: string,
  mechanic: OrgMechanic,
): Promise<boolean> {
  const entitlements = await resolveOrgEntitlements(port, organizationId);
  return entitlements[mechanic];
}

/**
 * Resolves the effective included specialist seat count for the `clinic_team` mechanic:
 * override > tariff > `CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE`, or `0` when `clinic_team` itself
 * is not enabled for the organization. Always a finite nonnegative integer — there is no
 * "unlimited" state for `clinic_team` in C4A (owner decision: "owner scope does not require an
 * unlimited plan"). `null` in stored data means "not explicitly configured", not unlimited.
 */
export async function resolveClinicSeatLimit(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<number> {
  const [tariff, overrides] = await Promise.all([
    port.getTariffForOrg(organizationId),
    port.listOverrides(organizationId),
  ]);
  const activeOverrides = overrides.filter((override) => isOverrideActive(override.expiresAt));
  const overrideByMechanic = new Map(
    activeOverrides.map((override) => [override.mechanic, override.enabled]),
  );
  const clinicTeamEnabled =
    overrideByMechanic.get('clinic_team') ??
    tariff?.mechanics.clinic_team ??
    MECHANIC_DEFAULT_ENABLED.clinic_team;
  if (!clinicTeamEnabled) return 0;

  const seatOverride = activeOverrides.find((entry) => entry.mechanic === 'clinic_team');
  if (seatOverride?.seatLimitOverride != null) return seatOverride.seatLimitOverride;
  return tariff?.includedSeats ?? CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE;
}

export async function resolveEffectiveCommercialAccess(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<EffectiveOrgCommercialAccess> {
  return port.getEffectiveCommercialAccess(organizationId);
}

/** Dedicated application boundary for platform commercial operations. Routes must capability-gate before use. */
export function createPlatformEntitlementsService(port: PlatformEntitlementsPort) {
  return {
    listTariffs: () => port.listTariffs(),
    listOrganizations: () => port.listOrganizations(),
    getTrialPolicy: () => port.getTrialPolicy(),
    createTariff: (
      input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>,
      audit: PlatformMutationAudit,
    ) => {
      return port.createTariff(normalizeTariffInput(input), audit);
    },
    updateTariff: (
      id: string,
      input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>,
      audit: PlatformMutationAudit,
    ) => {
      return port.updateTariff(id, normalizeTariffInput(input), audit);
    },
    archiveTariff: (id: string, audit: PlatformMutationAudit) => {
      return port.archiveTariff(id, audit);
    },
    assignTariff: (
      organizationId: string,
      tariffId: string | null,
      audit: PlatformMutationAudit,
    ) => {
      return port.assignTariff(organizationId, tariffId, audit);
    },
    upsertOverride: (
      input: {
        organizationId: string;
        mechanic: OrgMechanic;
        enabled: boolean;
        quota: TariffQuota | null;
        expiresAt: string | null;
      },
      audit: PlatformMutationAudit,
    ) => {
      assertMechanic(input.mechanic);
      if (input.quota) assertQuota(input.mechanic, input.quota);
      if (input.expiresAt && !Number.isFinite(new Date(input.expiresAt).getTime())) {
        throw new Error('entitlement_override_expiry_invalid');
      }
      return port.upsertOverride(input, audit);
    },
    deleteOverride: (
      organizationId: string,
      mechanic: OrgMechanic,
      audit: PlatformMutationAudit,
    ) => {
      assertMechanic(mechanic);
      return port.deleteOverride(organizationId, mechanic, audit);
    },
    setTrialPolicy: (policy: TrialPolicy, audit: PlatformMutationAudit) => {
      assertTrialPolicy(policy);
      return port.setTrialPolicy(policy, audit);
    },
    startTrial: (organizationId: string, audit: PlatformMutationAudit) => {
      return port.startTrial(organizationId, audit);
    },
    extendTrial: (organizationId: string, days: number, audit: PlatformMutationAudit) => {
      if (!Number.isSafeInteger(days) || days <= 0) throw new Error('trial_extension_days_invalid');
      return port.extendTrial(organizationId, days, audit);
    },
  };
}

export type PlatformEntitlementsService = ReturnType<typeof createPlatformEntitlementsService>;
