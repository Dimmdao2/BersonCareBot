import { MECHANICS, type OrgEntitlements, type OrgMechanic } from "./types";
import type { OrgEntitlementsPort } from "./ports";

/**
 * Store P0 — entitlement foundation (dormant). Resolves, for EACH canonical mechanic, the
 * precedence override > tariff > default-true. Default-true is intentional: no route is gated in
 * P0, so an org with no tariff assigned (the entire fleet today) resolves to all-enabled —
 * identical behavior to before this module existed. See STORE_P0_ENTITLEMENTS_PLAN.md.
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
    result[mechanic] = overrideValue ?? tariffValue ?? true;
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
