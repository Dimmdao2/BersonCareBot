import type { OrganizationMembershipRole } from '@/modules/organization-membership/ports';
import type { UserRole } from '@/shared/types/session';

/**
 * U1 launch vocabulary. This is authorization data, not a navigation model:
 * routes and actions must resolve it from a trusted session plus membership first.
 */
export const LAUNCH_CAPABILITIES = [
  'platform.operations',
  'organization.management',
  'clinical.workspace',
  'account.self',
  'patient.global-account',
  'patient.enrolled-care',
  'public.entry',
] as const;

export type LaunchCapability = (typeof LAUNCH_CAPABILITIES)[number];

export type TrustedWorkspaceCapabilityFacts = {
  sessionRole: UserRole;
  membershipRole?: OrganizationMembershipRole;
  specialistId?: string | null;
  canManageOrganization?: boolean;
  canAccessClinicalWorkspace?: boolean;
  /** Personal override, owner (04.08): "отключить У СЕБЯ" — used only when the caller has not
   * already resolved {@link canAccessClinicalWorkspace} itself. */
  doctorScreensDisabled?: boolean;
};

/**
 * Conservative projection of already-trusted session and membership facts.
 *
 * A global administrator deliberately stops here: it is a platform operator,
 * not an implicit member of a clinical or organization workspace —
 * `organization.management` and `clinical.workspace` are never derived for
 * this branch, regardless of any membership facts passed in.
 * It does resolve `account.self` alongside `platform.operations` (owner
 * ruling 2026-07-26): the platform operator still manages its own personal
 * account — profile, security/2FA, sessions, notifications, PWA install —
 * exactly like a doctor account does a few lines below. That is the one
 * place this branch and the general one below deliberately agree.
 * Patient/public authorization retains its dedicated guards until U5A; their
 * names remain in this vocabulary so route classification has one complete
 * language.
 */
export function resolveLaunchCapabilities(
  facts: TrustedWorkspaceCapabilityFacts,
): ReadonlySet<LaunchCapability> {
  if (facts.sessionRole === 'admin') {
    return new Set(['platform.operations', 'account.self']);
  }

  const capabilities = new Set<LaunchCapability>();
  if (facts.sessionRole === 'doctor') {
    capabilities.add('account.self');
  }

  const canManageOrganization =
    facts.canManageOrganization ??
    (facts.membershipRole === 'owner' || facts.membershipRole === 'admin');
  if (canManageOrganization) {
    capabilities.add('organization.management');
  }

  const canAccessClinicalWorkspace =
    facts.canAccessClinicalWorkspace ??
    ((facts.membershipRole === 'owner' ||
      facts.membershipRole === 'admin' ||
      facts.membershipRole === 'doctor') &&
      facts.specialistId != null &&
      !facts.doctorScreensDisabled);
  if (canAccessClinicalWorkspace) {
    capabilities.add('clinical.workspace');
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
