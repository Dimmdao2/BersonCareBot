import type { OrganizationMembershipRole } from "@/modules/organization-membership/ports";
import type { UserRole } from "@/shared/types/session";

/**
 * U1 launch vocabulary. This is authorization data, not a navigation model:
 * routes and actions must resolve it from a trusted session plus membership first.
 */
export const LAUNCH_CAPABILITIES = [
  "platform.operations",
  "organization.management",
  "clinical.workspace",
  "account.self",
  "patient.global-account",
  "patient.enrolled-care",
  "public.entry",
] as const;

export type LaunchCapability = (typeof LAUNCH_CAPABILITIES)[number];

export type TrustedWorkspaceCapabilityFacts = {
  sessionRole: UserRole;
  adminMode?: boolean;
  membershipRole?: OrganizationMembershipRole;
  specialistId?: string | null;
  canManageOrganization?: boolean;
  canAccessClinicalWorkspace?: boolean;
};

/**
 * Conservative projection of already-trusted session and membership facts.
 *
 * A global administrator in explicit admin mode deliberately stops here: it is
 * a platform operator, not an implicit member of a clinical or organization
 * workspace. Patient/public authorization retains its dedicated guards until
 * U5A; their names remain in this vocabulary so route classification has one
 * complete language.
 */
export function resolveLaunchCapabilities(
  facts: TrustedWorkspaceCapabilityFacts,
): ReadonlySet<LaunchCapability> {
  if (facts.sessionRole === "admin" && facts.adminMode === true) {
    return new Set(["platform.operations"]);
  }

  const capabilities = new Set<LaunchCapability>();
  if (facts.sessionRole === "doctor" || facts.sessionRole === "admin") {
    capabilities.add("account.self");
  }

  const canManageOrganization =
    facts.canManageOrganization ??
    (facts.membershipRole === "owner" || facts.membershipRole === "admin");
  if (canManageOrganization) {
    capabilities.add("organization.management");
  }

  const canAccessClinicalWorkspace =
    facts.canAccessClinicalWorkspace ??
    ((facts.membershipRole === "owner" || facts.membershipRole === "doctor") && facts.specialistId != null);
  if (canAccessClinicalWorkspace) {
    capabilities.add("clinical.workspace");
  }

  return capabilities;
}

export function hasLaunchCapability(
  capabilities: ReadonlySet<LaunchCapability> | readonly LaunchCapability[],
  capability: LaunchCapability,
): boolean {
  if (capabilities instanceof Set) return capabilities.has(capability);
  return (capabilities as readonly LaunchCapability[]).includes(capability);
}
