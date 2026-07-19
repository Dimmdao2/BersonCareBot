import {
  CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE,
  MECHANIC_DEFAULT_ENABLED,
  MECHANICS,
  type OrgEntitlements,
  type OrgMechanic,
} from "./types";
import type { OrgEntitlementsPort } from "./ports";

/**
 * Store P0 — entitlement foundation. Resolves, for EACH canonical mechanic, the precedence
 * override > tariff > `MECHANIC_DEFAULT_ENABLED[mechanic]`. Default-true remains intentional for
 * compatibility mechanics. `clinic_team` (C4A) and the current owner-only `courses` surface
 * (C4C) are scoped exceptions: both default OFF without a tariff or override. See
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

  const overrideByMechanic = new Map(overrides.map((override) => [override.mechanic, override.enabled]));

  const result = {} as OrgEntitlements;
  for (const mechanic of MECHANICS) {
    const overrideValue = overrideByMechanic.get(mechanic);
    const tariffValue = tariff?.mechanics[mechanic];
    result[mechanic] = overrideValue ?? tariffValue ?? MECHANIC_DEFAULT_ENABLED[mechanic];
  }
  return result;
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
  const overrideByMechanic = new Map(overrides.map((override) => [override.mechanic, override.enabled]));
  const clinicTeamEnabled =
    overrideByMechanic.get("clinic_team") ?? tariff?.mechanics.clinic_team ?? MECHANIC_DEFAULT_ENABLED.clinic_team;
  if (!clinicTeamEnabled) return 0;

  const seatOverride = overrides.find((entry) => entry.mechanic === "clinic_team");
  if (seatOverride?.seatLimitOverride != null) return seatOverride.seatLimitOverride;
  return tariff?.includedSeats ?? CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE;
}
