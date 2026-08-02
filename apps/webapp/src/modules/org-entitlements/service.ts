import {
  MECHANIC_REGISTRY,
  MECHANICS,
  quotaMechanicSupportsWarning,
  type AccessLifecyclePolicy,
  type AccessNotificationCondition,
  type AccessNotificationRule,
  type CabinetAccessResolution,
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
  type RegistrationTariffPolicy,
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
  // §5a item 2.6a (owner 31.07): the threshold exists only where he asked for it — patients and
  // file volume. Branches get no warning at all, so a stored percent there is a refusal, not a
  // value quietly dropped on read.
  const warningAtPercent = quota.warningAtPercent ?? null;
  if (warningAtPercent !== null && !quotaMechanicSupportsWarning(mechanic)) {
    throw new Error('tariff_quota_warning_unsupported');
  }
  if (
    warningAtPercent !== null &&
    (!Number.isSafeInteger(warningAtPercent) || warningAtPercent < 0 || warningAtPercent > 100)
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
    if (key === 'files' && value.unit === 'bytes') {
      normalized.files = { ...value, warningAtPercent: value.warningAtPercent ?? null };
    } else if (key === 'patient_count' && value.unit === 'items') {
      normalized.patient_count = { ...value, warningAtPercent: value.warningAtPercent ?? null };
    } else if (key === 'branches' && value.unit === 'items') {
      // `assertQuota` already refused a threshold here; drop the key rather than persist it.
      normalized.branches = { kind: value.kind, limit: value.limit, unit: 'items' };
    } else throw new Error('tariff_quota_mechanic_invalid');
  }
  return normalized;
}

/**
 * §5a item 2.6a — a notification row is валиден by its SHAPE only. The number of rows is not
 * bounded («число строк задаёт владелец, ограничений нет»), the offset may point before or after
 * the end of the period, and the text is never inspected: it is the owner's, variables included.
 */
function assertAccessNotification(rule: AccessNotificationRule): void {
  if (!Number.isSafeInteger(rule.offsetDays)) {
    throw new Error('access_notification_offset_invalid');
  }
  const conditions: AccessNotificationCondition[] = ['payment_succeeded', 'payment_failed'];
  if (!conditions.includes(rule.condition)) {
    throw new Error('access_notification_condition_invalid');
  }
  if (!rule.template.trim()) throw new Error('access_notification_template_required');
}

function assertAccessPolicy(policy: AccessLifecyclePolicy): void {
  for (const value of [policy.graceDays, policy.readOnlyDays]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('access_policy_value_invalid');
  }
  if (!Array.isArray(policy.notifications)) {
    throw new Error('access_policy_notifications_invalid');
  }
  for (const rule of policy.notifications) assertAccessNotification(rule);
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
  // §5a item 2.6a (owner 31.07): «количество разрешённых специалистов должно быть явно настроено
  // в тарифе, иначе он не сохранится». Fixed by refusing the SAVE, deliberately not by a runtime
  // substitution: neither "empty → unlimited" nor "empty → count one" may exist, because "empty"
  // must not exist in the database at all.
  if (input.includedSeats === null) throw new Error('tariff_included_seats_required');
  if (!Number.isSafeInteger(input.includedSeats) || input.includedSeats < 0) {
    throw new Error('tariff_seat_limit_invalid');
  }
  // §5a item 5.1 — null keeps seats hard-blocked at includedSeats (§5.2); a configured price
  // requires a currency to bill it in, same requirement priceMinor already has above.
  if (input.additionalSeatPriceMinor !== null) {
    if (
      !Number.isSafeInteger(input.additionalSeatPriceMinor) ||
      input.additionalSeatPriceMinor < 0
    ) {
      throw new Error('tariff_additional_seat_price_invalid');
    }
    if (!input.currency?.trim()) throw new Error('tariff_currency_required');
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
  // #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала → доступа нет» — no compatibility
  // carve-out survives for a tariff-less organization.
  if (!snapshot.tariff) return false;
  if (mechanicClass === 'места') return snapshot.tariff.includedSeats !== null;
  if (requiresExplicitNumericQuota(mechanicClass)) {
    return numericQuotaFromSnapshot(snapshot, mechanic) !== undefined;
  }
  return snapshot.tariff.mechanics[mechanic] === true;
}

/**
 * `null` is an explicit unlimited file plan; `undefined` means the limit is not configured and
 * growth must be refused.
 *
 * §5a item 2.6a (owner 31.07) / #1069 §2.13 (owner 01.08) — «клиники без тарифа быть просто не
 * может… нет доступа и нет никаких механик вне тарифа», «нет активного тарифа и нет триала →
 * доступа нет». A tariff-less organization refuses growth, full stop — no compatibility carve-out.
 */
export function fileStorageLimitFromSnapshot(
  snapshot: Pick<OrgEntitlementSnapshot, 'tariff' | 'overrides'>,
): number | null | undefined {
  if (!snapshot.tariff) return undefined;
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
    const quota: TariffQuota | { kind: 'numeric'; limit: number; unit: 'seats' } | undefined =
      mechanic === 'clinic_team'
        ? clinicSeatLimit === null || clinicSeatLimit === undefined
          ? undefined
          : { kind: 'numeric', limit: clinicSeatLimit, unit: 'seats' }
        : numericQuotaFromSnapshot(snapshot, mechanic);
    const currentUsage = usage[mechanic];
    if (!quota || quota.kind !== 'numeric' || quota.limit === null || currentUsage === undefined)
      return [];
    // Only the mechanics the owner named carry a threshold at all (§5a item 2.6a); everywhere else
    // there is no "approaching the limit" step, just below-warning until the limit is reached.
    const warningAtPercent = quotaMechanicSupportsWarning(mechanic)
      ? ((quota as TariffQuota).warningAtPercent ?? null)
      : null;
    return [
      {
        mechanic,
        quota: { limit: quota.limit, unit: quota.unit },
        usage: currentUsage,
        threshold:
          currentUsage >= quota.limit
            ? 'reached'
            : warningAtPercent !== null && currentUsage * 100 >= quota.limit * warningAtPercent
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

export async function resolveCabinetAccess(
  port: OrgEntitlementsPort,
  organizationId: string,
): Promise<CabinetAccessResolution> {
  return port.resolveCabinetAccess(organizationId);
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
export function evaluateTariffTransition(params: {
  usage: Partial<Record<OrgMechanic, number>>;
  currentTariff: Pick<
    Tariff,
    'mechanics' | 'quotas' | 'includedSeats' | 'priceMinor' | 'currency' | 'billingPeriod'
  >;
  targetTariff: Pick<
    Tariff,
    | 'mechanics'
    | 'quotas'
    | 'downgradePolicies'
    | 'includedSeats'
    | 'priceMinor'
    | 'currency'
    | 'billingPeriod'
  >;
  /** Self-service tariff changes only require cleanup of the three owner-named countable resources. */
  blockableMechanics?: readonly OrgMechanic[];
}): { blocks: TariffDowngradeBlock[]; appliesNextPeriod: boolean } {
  const blocks: TariffDowngradeBlock[] = [];
  const blockableMechanics = params.blockableMechanics ?? MECHANICS;
  // Price is authoritative only when the two stored prices describe the same currency and billing
  // period. Comparing a monthly price with an annual one would invent a proration/normalization
  // policy which the product has deliberately not defined.
  const isCheaperForSamePeriod =
    params.currentTariff.priceMinor !== null &&
    params.targetTariff.priceMinor !== null &&
    params.currentTariff.currency === params.targetTariff.currency &&
    params.currentTariff.billingPeriod === params.targetTariff.billingPeriod &&
    params.targetTariff.priceMinor < params.currentTariff.priceMinor;
  let appliesNextPeriod =
    isCheaperForSamePeriod ||
    (params.targetTariff.includedSeats ?? Number.POSITIVE_INFINITY) <
      (params.currentTariff.includedSeats ?? Number.POSITIVE_INFINITY);
  const targetSeatLimit = params.targetTariff.includedSeats;
  if (
    targetSeatLimit !== null &&
    params.usage.clinic_team !== undefined &&
    params.usage.clinic_team > targetSeatLimit &&
    blockableMechanics.includes('clinic_team')
  ) {
    blocks.push({ mechanic: 'clinic_team', reason: 'quota_exceeded' });
  }
  for (const mechanic of MECHANICS) {
    const mechanicClass = MECHANIC_REGISTRY[mechanic].class;
    const policy = params.targetTariff.downgradePolicies[mechanic] ?? 'block';
    if (mechanicClass === 'запас' || mechanicClass === 'объём') {
      const targetQuota = (params.targetTariff.quotas as Partial<Record<OrgMechanic, TariffQuota>>)[
        mechanic
      ];
      const currentQuota = (params.currentTariff.quotas as Partial<Record<OrgMechanic, TariffQuota>>)[mechanic];
      const currentLimit =
        currentQuota?.kind === 'numeric' && currentQuota.limit !== null
          ? currentQuota.limit
          : Number.POSITIVE_INFINITY;
      const targetLimit =
        targetQuota?.kind === 'numeric' && targetQuota.limit !== null
          ? targetQuota.limit
          : Number.POSITIVE_INFINITY;
      if (targetLimit < currentLimit) appliesNextPeriod = true;
      if (!targetQuota || targetQuota.kind === 'unlimited' || targetQuota.limit === null) continue;
      const used = params.usage[mechanic] ?? 0;
      if (used <= targetQuota.limit) continue;
      if (policy === 'block' && blockableMechanics.includes(mechanic)) {
        blocks.push({ mechanic, reason: 'quota_exceeded' });
      }
    } else if (mechanicClass === 'возможность') {
      const wasIncluded = params.currentTariff.mechanics[mechanic] === true;
      const willBeIncluded = params.targetTariff.mechanics[mechanic] === true;
      if (!wasIncluded || willBeIncluded) continue;
      appliesNextPeriod = true;
      if (policy === 'block' && blockableMechanics.includes(mechanic)) {
        blocks.push({ mechanic, reason: 'mechanic_removed' });
      }
    }
  }
  return { blocks, appliesNextPeriod };
}

/**
 * Clinic billing uses the same transition evaluator as platform assignment, but its owner-approved
 * cleanup gate is deliberately narrower: specialists, branches and patients. File overage is never
 * a reason to refuse a downgrade; the existing file write door freezes only new upload growth.
 */
export async function resolveOwnTariffTransition(
  port: OrgEntitlementsPort,
  organizationId: string,
  tariffId: string,
) {
  const [snapshot, targetTariff, usage] = await Promise.all([
    port.getSnapshot(organizationId),
    port.getActiveTariffById(tariffId),
    port.getOwnQuotaUsage(organizationId),
  ]);
  if (!targetTariff) throw new Error('tariff_not_found');
  const currentTariff = snapshot.tariff;
  return {
    currentTariffId: currentTariff?.id ?? snapshot.access.tariffId,
    targetTariffId: targetTariff.id,
    ...(currentTariff
      ? evaluateTariffTransition({
          usage,
          currentTariff,
          targetTariff,
          blockableMechanics: ['clinic_team', 'branches', 'patient_count'],
        })
      : { blocks: [], appliesNextPeriod: false }),
  };
}

/** Compatibility export for callers that only need blockers; transition classification lives above. */
export function evaluateTariffDowngrade(params: {
  usage: Partial<Record<OrgMechanic, number>>;
  currentTariff: Pick<
    Tariff,
    'mechanics' | 'quotas' | 'includedSeats' | 'priceMinor' | 'currency' | 'billingPeriod'
  >;
  targetTariff: Pick<
    Tariff,
    | 'mechanics'
    | 'quotas'
    | 'downgradePolicies'
    | 'includedSeats'
    | 'priceMinor'
    | 'currency'
    | 'billingPeriod'
  >;
}): TariffDowngradeBlock[] {
  return evaluateTariffTransition(params).blocks;
}

/** Dedicated application boundary for platform commercial operations. Routes must capability-gate before use. */
export function createPlatformEntitlementsService(port: PlatformEntitlementsPort) {
  return {
    listTariffs: () => port.listTariffs(),
    getTariffTransition: async (organizationId: string, tariffId: string) => {
      const [organizations, tariffs, usage] = await Promise.all([
        port.listOrganizations(), port.listTariffs(), port.getOrganizationMechanicUsage(organizationId),
      ]);
      const organization = organizations.find((entry) => entry.id === organizationId);
      const currentTariff = organization?.tariffId
        ? tariffs.find((entry) => entry.id === organization.tariffId) ?? null
        : null;
      const targetTariff = tariffs.find((entry) => entry.id === tariffId) ?? null;
      if (!targetTariff) throw new Error('tariff_not_found');
      return {
        currentTariffId: currentTariff?.id ?? null,
        targetTariffId: targetTariff.id,
        ...(currentTariff ? evaluateTariffTransition({ usage, currentTariff, targetTariff }) : { blocks: [], appliesNextPeriod: false }),
      };
    },
    listOrganizations: () => port.listOrganizations(),
    getTrialPolicy: () => port.getTrialPolicy(),
    getRegistrationTariffPolicy: () => port.getRegistrationTariffPolicy(),
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
      let currentTariff: Tariff | null = null;
      let targetTariff: Tariff | null = null;
      if (tariffId) {
        const [organizations, tariffs, usage] = await Promise.all([
          port.listOrganizations(),
          port.listTariffs(),
          port.getOrganizationMechanicUsage(organizationId),
        ]);
        const organization = organizations.find((entry) => entry.id === organizationId);
        targetTariff = tariffs.find((entry) => entry.id === tariffId) ?? null;
        if (!targetTariff) throw new Error('tariff_not_found');
        currentTariff = organization?.tariffId
          ? tariffs.find((entry) => entry.id === organization.tariffId) ?? null
          : null;
        if (currentTariff) {
          const transition = evaluateTariffTransition({ usage, currentTariff, targetTariff });
          if (transition.blocks.length > 0) throw new TariffDowngradeBlockedError(transition.blocks);
          return port.assignTariff(organizationId, tariffId, audit, {
            applyAtNextPeriod: transition.appliesNextPeriod,
          });
        }
      }
      return port.assignTariff(organizationId, tariffId, audit, {
        applyAtNextPeriod: false,
      });
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
    setRegistrationTariffPolicy: (
      policy: RegistrationTariffPolicy,
      audit: PlatformMutationAudit,
    ) => {
      return port.setRegistrationTariffPolicy(policy, audit);
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
