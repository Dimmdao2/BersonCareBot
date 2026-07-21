import {
  CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE,
  MECHANIC_DEFAULT_ENABLED,
  MECHANIC_REGISTRY,
  MECHANICS,
  type OrgEntitlements,
  type EffectiveOrgCommercialAccess,
  type OrgEntitlementSnapshot,
  type OrgMechanic,
  type Tariff,
  type TariffQuota,
  type TariffQuotaMap,
  type TrialPolicy,
} from "./types";
import type { OrgEntitlementsPort, PlatformEntitlementsPort, PlatformMutationAudit } from "./ports";

function assertAudit(audit: PlatformMutationAudit): void {
  if (!audit.reason.trim()) throw new Error("commercial_change_reason_required");
}

function assertMechanic(value: string): asserts value is OrgMechanic {
  if (!MECHANICS.includes(value as OrgMechanic)) throw new Error("entitlement_mechanic_invalid");
}

function assertQuota(mechanic: OrgMechanic, quota: TariffQuota): void {
  if (!MECHANIC_REGISTRY[mechanic].quotaUnits.includes(quota.unit as never)) {
    throw new Error("tariff_quota_unit_invalid");
  }
  if (
    mechanic === "courses" &&
    (quota.unit !== "items" || quota.period !== "snapshot" || quota.usagePolicy !== "snapshot")
  ) {
    throw new Error("tariff_quota_enforcement_shape_invalid");
  }
  if (quota.kind === "unlimited") {
    if (quota.limit !== null) throw new Error("tariff_quota_unlimited_limit_invalid");
    return;
  }
  if (!Number.isSafeInteger(quota.limit) || (quota.limit ?? -1) < 0) {
    throw new Error("tariff_quota_limit_invalid");
  }
}

function normalizeQuotaMap(quotas: TariffQuotaMap): TariffQuotaMap {
  const normalized: TariffQuotaMap = {};
  for (const [key, value] of Object.entries(quotas)) {
    if (!MECHANICS.includes(key as OrgMechanic) || !value) throw new Error("tariff_quota_mechanic_invalid");
    assertQuota(key as OrgMechanic, value);
    normalized[key as OrgMechanic] = value;
  }
  return normalized;
}

function normalizeTariffInput(input: Omit<Tariff, "id" | "createdAt" | "updatedAt">) {
  const name = input.name.trim();
  if (!name) throw new Error("tariff_name_required");
  if (input.priceMinor !== null && (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0)) {
    throw new Error("tariff_price_invalid");
  }
  if (input.priceMinor !== null && !input.currency?.trim()) throw new Error("tariff_currency_required");
  if (input.includedSeats !== null && (!Number.isSafeInteger(input.includedSeats) || input.includedSeats < 0)) {
    throw new Error("tariff_seat_limit_invalid");
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
  if (policy.startEvent !== "organization_provisioned") {
    throw new Error("trial_start_event_unsupported");
  }
  if (!Number.isSafeInteger(policy.durationDays) || policy.durationDays <= 0) {
    throw new Error("trial_duration_invalid");
  }
  if (!Number.isSafeInteger(policy.graceDays) || policy.graceDays < 0) {
    throw new Error("trial_grace_invalid");
  }
  if (policy.postTrialBehavior === "tariff" && !policy.postTrialTariffId) {
    throw new Error("trial_post_tariff_required");
  }
  if (policy.postTrialBehavior !== "tariff" && policy.postTrialTariffId !== null) {
    throw new Error("trial_post_tariff_forbidden");
  }
}

function isOverrideActive(expiresAt: string | null | undefined): boolean {
  return !expiresAt || new Date(expiresAt).getTime() > Date.now();
}

function entitlementsFromSnapshot(
  snapshot: Pick<OrgEntitlementSnapshot, "tariff" | "overrides">,
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
      MECHANIC_DEFAULT_ENABLED[mechanic];
  }
  return result;
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
  const overrideByMechanic = new Map(activeOverrides.map((override) => [override.mechanic, override.enabled]));
  const clinicTeamEnabled =
    overrideByMechanic.get("clinic_team") ?? tariff?.mechanics.clinic_team ?? MECHANIC_DEFAULT_ENABLED.clinic_team;
  if (!clinicTeamEnabled) return 0;

  const seatOverride = activeOverrides.find((entry) => entry.mechanic === "clinic_team");
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
      input: Omit<Tariff, "id" | "createdAt" | "updatedAt">,
      audit: PlatformMutationAudit,
    ) => {
      assertAudit(audit);
      return port.createTariff(normalizeTariffInput(input), audit);
    },
    updateTariff: (
      id: string,
      input: Omit<Tariff, "id" | "createdAt" | "updatedAt">,
      audit: PlatformMutationAudit,
    ) => {
      assertAudit(audit);
      return port.updateTariff(id, normalizeTariffInput(input), audit);
    },
    archiveTariff: (id: string, audit: PlatformMutationAudit) => {
      assertAudit(audit);
      return port.archiveTariff(id, audit);
    },
    assignTariff: (organizationId: string, tariffId: string | null, audit: PlatformMutationAudit) => {
      assertAudit(audit);
      return port.assignTariff(organizationId, tariffId, audit);
    },
    upsertOverride: (
      input: { organizationId: string; mechanic: OrgMechanic; enabled: boolean; quota: TariffQuota | null; expiresAt: string | null },
      audit: PlatformMutationAudit,
    ) => {
      assertAudit(audit);
      assertMechanic(input.mechanic);
      if (input.quota) assertQuota(input.mechanic, input.quota);
      if (input.expiresAt && !Number.isFinite(new Date(input.expiresAt).getTime())) {
        throw new Error("entitlement_override_expiry_invalid");
      }
      return port.upsertOverride(input, audit);
    },
    deleteOverride: (organizationId: string, mechanic: OrgMechanic, audit: PlatformMutationAudit) => {
      assertAudit(audit);
      assertMechanic(mechanic);
      return port.deleteOverride(organizationId, mechanic, audit);
    },
    setTrialPolicy: (policy: TrialPolicy, audit: PlatformMutationAudit) => {
      assertAudit(audit);
      assertTrialPolicy(policy);
      return port.setTrialPolicy(policy, audit);
    },
    startTrial: (organizationId: string, audit: PlatformMutationAudit) => {
      assertAudit(audit);
      return port.startTrial(organizationId, audit);
    },
    extendTrial: (organizationId: string, days: number, audit: PlatformMutationAudit) => {
      assertAudit(audit);
      if (!Number.isSafeInteger(days) || days <= 0) throw new Error("trial_extension_days_invalid");
      return port.extendTrial(organizationId, days, audit);
    },
  };
}

export type PlatformEntitlementsService = ReturnType<typeof createPlatformEntitlementsService>;
