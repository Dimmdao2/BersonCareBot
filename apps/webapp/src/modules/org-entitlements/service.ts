import {
  MECHANIC_REGISTRY,
  MECHANICS,
  type AccessLifecyclePolicy,
  type AccessTerminalState,
  type DowngradePolicyMap,
  type MechanicDowngradePolicy,
  type OrgEntitlements,
  type OrgQuotaProjection,
  type EffectiveOrgCommercialAccess,
  type MechanicAccessResolution,
  type MechanicClass,
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
  const mechanicClass = MECHANIC_REGISTRY[mechanic].class;
  if (
    (mechanicClass === 'объём' && quota.unit !== 'bytes') ||
    (mechanicClass === 'запас' && quota.unit !== 'items') ||
    (mechanicClass !== 'объём' && mechanicClass !== 'запас')
  ) {
    throw new Error('tariff_quota_unit_invalid');
  }
  if (
    quota.warningAtPercent !== null &&
    (!Number.isSafeInteger(quota.warningAtPercent) ||
      quota.warningAtPercent < 0 ||
      quota.warningAtPercent > 100)
  ) {
    throw new Error('tariff_quota_warning_invalid');
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
    assertMechanic(key);
    if (!value) throw new Error('tariff_quota_mechanic_invalid');
    assertQuota(key, value);
    if (key === 'files' && value.unit === 'bytes') normalized.files = value;
    else if (key === 'patient_count' && value.unit === 'items') normalized.patient_count = value;
    else if (key === 'branches' && value.unit === 'items') normalized.branches = value;
    else throw new Error('tariff_quota_mechanic_invalid');
  }
  return normalized;
}

function assertAccessPolicy(policy: AccessLifecyclePolicy): void {
  for (const value of [policy.graceDays, policy.readOnlyDays, policy.warningCount]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('access_policy_value_invalid');
  }
  const terminalStates: AccessTerminalState[] = ['read_only', 'disabled'];
  if (!terminalStates.includes(policy.terminalState)) {
    throw new Error('access_policy_terminal_state_invalid');
  }
}

/**
 * §5a stage 4b.3 — allowed downgrade-policy values are fixed by mechanic CLASS, not chosen per
 * entity: numeric (`запас`/`объём`) get `block`/`freeze_growth`; capability (`возможность`) get
 * `block`/`disable_immediately`/`read_only`. Seats (`места`) has no "exceeded seats" state at all
 * (owner 30.07, #4a.1 — overage is billed, not blocked) and critical (`никогда`) mechanics never
 * leave the tariff, so neither gets a downgrade policy.
 */
const DOWNGRADE_POLICY_VALUES_BY_CLASS: Partial<Record<MechanicClass, readonly MechanicDowngradePolicy[]>> = {
  запас: ['block', 'freeze_growth'],
  объём: ['block', 'freeze_growth'],
  возможность: ['block', 'disable_immediately', 'read_only'],
};

function assertDowngradePolicy(mechanic: OrgMechanic, value: string): asserts value is MechanicDowngradePolicy {
  const allowed = DOWNGRADE_POLICY_VALUES_BY_CLASS[MECHANIC_REGISTRY[mechanic].class];
  if (!allowed || !(allowed as readonly string[]).includes(value)) {
    throw new Error('tariff_downgrade_policy_invalid');
  }
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
  if (
    input.includedSeatsWarningAtPercent !== null &&
    (!Number.isSafeInteger(input.includedSeatsWarningAtPercent) ||
      input.includedSeatsWarningAtPercent < 0 ||
      input.includedSeatsWarningAtPercent > 100)
  ) {
    throw new Error('tariff_seat_warning_invalid');
  }
  if (input.systemAccessPolicy) assertAccessPolicy(input.systemAccessPolicy);
  const mechanicAccessPolicies = {} as Tariff['mechanicAccessPolicies'];
  for (const [mechanic, policy] of Object.entries(input.mechanicAccessPolicies)) {
    assertMechanic(mechanic);
    if (!policy) continue;
    assertAccessPolicy(policy);
    if (MECHANIC_REGISTRY[mechanic].class === 'никогда') {
      throw new Error('critical_mechanic_access_policy_forbidden');
    }
    mechanicAccessPolicies[mechanic] = policy;
  }
  const mechanics: Record<string, boolean> = {};
  for (const mechanic of Object.keys(input.mechanics)) assertMechanic(mechanic);
  for (const mechanic of MECHANICS) {
    if (MECHANIC_REGISTRY[mechanic].class === 'возможность') {
      mechanics[mechanic] = input.mechanics[mechanic] === true;
    }
  }
  const downgradePolicies: DowngradePolicyMap = {};
  for (const [mechanic, value] of Object.entries(input.downgradePolicies)) {
    assertMechanic(mechanic);
    if (!value) continue;
    assertDowngradePolicy(mechanic, value);
    downgradePolicies[mechanic] = value;
  }
  return {
    ...input,
    name,
    description: input.description.trim(),
    currency: input.currency?.trim().toUpperCase() ?? null,
    mechanics,
    quotas: normalizeQuotaMap(input.quotas),
    mechanicAccessPolicies,
    downgradePolicies,
  };
}

function assertTrialPolicy(policy: TrialPolicy): void {
  if (!policy.startEvent.trim()) throw new Error('trial_start_event_required');
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
 * A numeric quota is commercial configuration, not a capability flag.  `undefined` means the
 * tariff never configured a limit; `unlimited` is an explicit stored choice, distinct from an
 * omitted key.  This deliberately covers future `запас` mechanics as well as today's `объём`.
 */
function numericQuotaFromSnapshot(
  snapshot: Pick<OrgEntitlementSnapshot, 'tariff' | 'overrides'>,
  mechanic: OrgMechanic,
): TariffQuota | undefined {
  const override = snapshot.overrides.find(
    (entry) => entry.mechanic === mechanic && isOverrideActive(entry.expiresAt),
  );
  return (
    override?.quota ??
    (snapshot.tariff?.quotas as Partial<Record<OrgMechanic, TariffQuota>> | undefined)?.[mechanic]
  );
}

function requiresExplicitNumericQuota(mechanicClass: MechanicClass): boolean {
  return mechanicClass === 'объём' || mechanicClass === 'запас';
}

function isMechanicIncludedFromSnapshot(
  snapshot: Pick<OrgEntitlementSnapshot, 'tariff' | 'overrides' | 'access'>,
  mechanic: OrgMechanic,
): boolean {
  const mechanicClass = MECHANIC_REGISTRY[mechanic].class;
  if (mechanicClass === 'никогда') return true;
  const override = snapshot.overrides.find(
    (entry) => entry.mechanic === mechanic && isOverrideActive(entry.expiresAt),
  );
  if (override) return override.enabled;
  if (!snapshot.tariff) return snapshot.access.source === 'compatibility';
  if (mechanicClass === 'места') return snapshot.tariff.includedSeats !== null;
  if (requiresExplicitNumericQuota(mechanicClass)) {
    return numericQuotaFromSnapshot(snapshot, mechanic) !== undefined;
  }
  return snapshot.tariff.mechanics[mechanic] === true;
}

/**
 * `null` is an explicit unlimited file plan (or the unchanged compatibility path); `undefined`
 * means a tariff was assigned but never configured the file limit and must refuse new growth.
 */
export function fileStorageLimitFromSnapshot(
  snapshot: Pick<OrgEntitlementSnapshot, 'tariff' | 'overrides' | 'access'>,
): number | null | undefined {
  if (!snapshot.tariff || snapshot.access.source === 'compatibility') return null;
  const quota = numericQuotaFromSnapshot(snapshot, 'files');
  if (!quota) return undefined;
  return quota.kind === 'numeric' ? quota.limit : null;
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
  const result = {} as OrgEntitlements;
  for (const mechanic of MECHANICS) {
    result[mechanic] = isMechanicIncludedFromSnapshot(snapshot, mechanic);
  }
  return result;
}

/**
 * Shared by both quota-projection entry points below. Returns a typed threshold projection only
 * for quota keys that are really enforced today (`места`/`запас`/`объём` with a real usage number);
 * declared future quota keys intentionally do not appear here.
 */
function projectQuotas(
  snapshot: Pick<OrgEntitlementSnapshot, 'tariff' | 'overrides'>,
  usage: Partial<Record<OrgMechanic, number>>,
): OrgQuotaProjection[] {
  const activeOverrides = new Map(
    snapshot.overrides
      .filter((override) => isOverrideActive(override.expiresAt))
      .map((override) => [override.mechanic, override]),
  );
  return MECHANICS.flatMap((mechanic) => {
    const mechanicClass = MECHANIC_REGISTRY[mechanic].class;
    if (mechanicClass !== 'места' && mechanicClass !== 'запас' && mechanicClass !== 'объём') {
      return [];
    }
    // Specialist seats are configured by includedSeats/seatLimitOverride rather than the generic
    // tariff quota map, but are enforced with the same snapshot semantics.
    const clinicTeamOverride = activeOverrides.get('clinic_team');
    const clinicSeatLimit =
      clinicTeamOverride?.seatLimitOverride ?? snapshot.tariff?.includedSeats;
    const quota:
      | TariffQuota
      | {
          kind: 'numeric';
          limit: number;
          unit: 'seats';
          warningAtPercent: number | null;
        }
      | undefined =
      mechanic === 'clinic_team'
        ? clinicSeatLimit === null || clinicSeatLimit === undefined
          ? undefined
          : {
              kind: 'numeric',
              limit: clinicSeatLimit,
              unit: 'seats',
              warningAtPercent: snapshot.tariff?.includedSeatsWarningAtPercent ?? null,
            }
        : numericQuotaFromSnapshot(snapshot, mechanic);
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
            : quota.warningAtPercent !== null &&
                currentUsage * 100 >= quota.limit * quota.warningAtPercent
              ? 'warning'
              : 'below_warning',
        enforcement: MECHANIC_REGISTRY[mechanic].quotaEnforcement,
      },
    ];
  });
}

/**
 * Platform (global-admin) view — §5a stage 6.2. Usage comes from the cross-org, platform-only
 * `getEnforcedQuotaUsage` (SECURITY DEFINER) so the operator can read any organization's numbers.
 */
export async function resolveOrgQuotaProjections(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<OrgQuotaProjection[]> {
  const [snapshot, usage] = await Promise.all([
    port.getSnapshot(organizationId),
    port.getEnforcedQuotaUsage(organizationId),
  ]);
  return projectQuotas(snapshot, usage);
}

/**
 * Clinic-facing "used out of included" view — §5a stage 6.1. Usage comes from `getOwnQuotaUsage`,
 * which reads only the caller's own organization under the ordinary staff principal (no platform
 * privilege). Same projection logic as the platform view — one resolver, two usage sources.
 */
export async function resolveOwnOrgQuotaProjections(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<OrgQuotaProjection[]> {
  const [snapshot, usage] = await Promise.all([
    port.getSnapshot(organizationId),
    port.getOwnQuotaUsage(organizationId),
  ]);
  return projectQuotas(snapshot, usage);
}

export async function resolveOrgEntitlementSnapshot(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<{ entitlements: OrgEntitlements; access: EffectiveOrgCommercialAccess }> {
  const snapshot = await port.getSnapshot(organizationId);
  return { entitlements: entitlementsFromSnapshot(snapshot), access: snapshot.access };
}

export async function resolveMechanicAccess(
  port: OrgEntitlementsPort,
  organizationId: string,
  mechanic: OrgMechanic,
): Promise<MechanicAccessResolution> {
  return port.resolveMechanicAccess(organizationId, mechanic);
}

/** A numeric file ceiling for the repository write transaction; see `fileStorageLimitFromSnapshot`. */
export async function resolveFileStorageLimit(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<number | null | undefined> {
  return fileStorageLimitFromSnapshot(await port.getSnapshot(organizationId));
}

/**
 * Store P0 — entitlement foundation. Resolves, for EACH canonical mechanic, the precedence
 * override > tariff. The no-tariff compatibility commercial state stays explicit full access;
 * every assigned tariff and organization exception is data configured.
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
 * override > tariff. `null` is explicit "not configured"; callers must refuse growth.
 */
export async function resolveClinicSeatLimit(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<number | null> {
  const [tariff, overrides] = await Promise.all([
    port.getTariffForOrg(organizationId),
    port.listOverrides(organizationId),
  ]);
  const activeOverrides = overrides.filter((override) => isOverrideActive(override.expiresAt));
  const seatOverride = activeOverrides.find((entry) => entry.mechanic === 'clinic_team');
  if (seatOverride?.seatLimitOverride != null) return seatOverride.seatLimitOverride;
  return tariff?.includedSeats ?? null;
}

export async function resolveEffectiveCommercialAccess(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<EffectiveOrgCommercialAccess> {
  return port.getEffectiveCommercialAccess(organizationId);
}

export type TariffDowngradeBlock = {
  mechanic: OrgMechanic;
  reason: 'quota_exceeded' | 'mechanic_removed';
};

export class TariffDowngradeBlockedError extends Error {
  readonly blocks: TariffDowngradeBlock[];
  constructor(blocks: TariffDowngradeBlock[]) {
    super(`tariff_downgrade_blocked:${blocks.map((block) => block.mechanic).join(',')}`);
    this.blocks = blocks;
  }
}

/**
 * §5a stage 4b.3/4b.4 — the "ручка 2" evaluator. ONE generic pass over every mechanic; which
 * mechanics block a transition is a data lookup (`downgradePolicies`), never a per-mechanic
 * branch. `freeze_growth` and `disable_immediately` need no code here at all: the existing
 * quota check (`assertStockQuotaAvailable`) and mechanic resolver already produce that behaviour
 * the moment the new tariff is assigned — this function only ever decides what to REFUSE.
 * An unset policy defaults to `block` (fail-closed), matching the rest of this module's rule that
 * an unconfigured numeric mechanic refuses growth rather than falling back to unlimited.
 */
export function evaluateTariffDowngrade(params: {
  usage: Partial<Record<OrgMechanic, number>>;
  currentTariff: Pick<Tariff, 'mechanics'>;
  targetTariff: Pick<Tariff, 'mechanics' | 'quotas' | 'downgradePolicies'>;
}): TariffDowngradeBlock[] {
  const blocks: TariffDowngradeBlock[] = [];
  for (const mechanic of MECHANICS) {
    const mechanicClass = MECHANIC_REGISTRY[mechanic].class;
    const policy = params.targetTariff.downgradePolicies[mechanic] ?? 'block';
    if (mechanicClass === 'запас' || mechanicClass === 'объём') {
      const targetQuota = (params.targetTariff.quotas as Partial<Record<OrgMechanic, TariffQuota>>)[
        mechanic
      ];
      if (!targetQuota || targetQuota.kind === 'unlimited' || targetQuota.limit === null) continue;
      const used = params.usage[mechanic] ?? 0;
      if (used <= targetQuota.limit) continue;
      if (policy === 'block') blocks.push({ mechanic, reason: 'quota_exceeded' });
    } else if (mechanicClass === 'возможность') {
      const wasIncluded = params.currentTariff.mechanics[mechanic] === true;
      const willBeIncluded = params.targetTariff.mechanics[mechanic] === true;
      if (!wasIncluded || willBeIncluded) continue;
      if (policy === 'block') blocks.push({ mechanic, reason: 'mechanic_removed' });
    }
  }
  return blocks;
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
    assignTariff: async (
      organizationId: string,
      tariffId: string | null,
      audit: PlatformMutationAudit,
    ) => {
      if (tariffId) {
        const [organizations, tariffs, usage] = await Promise.all([
          port.listOrganizations(),
          port.listTariffs(),
          port.getOrganizationMechanicUsage(organizationId),
        ]);
        const organization = organizations.find((entry) => entry.id === organizationId);
        const targetTariff = tariffs.find((entry) => entry.id === tariffId);
        if (!targetTariff) throw new Error('tariff_not_found');
        const currentTariff = organization?.tariffId
          ? tariffs.find((entry) => entry.id === organization.tariffId)
          : null;
        if (currentTariff) {
          const blocks = evaluateTariffDowngrade({ usage, currentTariff, targetTariff });
          if (blocks.length > 0) throw new TariffDowngradeBlockedError(blocks);
        }
      }
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
