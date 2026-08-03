import { cache } from 'react';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireStaffAccountPage } from '@/app-layer/guards/requireRole';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';

export type StaffAccountPageContext = {
  session: Awaited<ReturnType<typeof requireStaffAccountPage>>;
  workspaceContext: DoctorWorkspaceContext | null;
};

/**
 * The account itself is personal and does not require an organization.  When the
 * staff user does have the single launch membership, keep that context only for
 * the surrounding staff shell and the retained specialist-specific defaults.
 */
export const loadStaffAccountPageContext = cache(async (): Promise<StaffAccountPageContext> => {
  const session = await requireStaffAccountPage();
  if (
    session.staffSecurity?.assurance === 'recovery' ||
    session.staffSecurity?.assurance === 'recovery_confirmation'
  ) {
    return { session, workspaceContext: null };
  }
  // `requireStaffAccountPage()` above already resolved this exact fact once, inside
  // `stampDbPrincipalFromSession`: a doctor-class session with no organization membership
  // stamps the identity-self DB wall (app_patient), which deliberately holds no grant on
  // `be_organization_members` — that table is staff/platform-only. A membership can only be
  // added by a separate action, never appear mid-request, so a second lookup under that
  // narrower wall cannot discover a different answer than the first one already reached; it can
  // only fail closed on the table grant instead of returning the same "no membership" result.
  // Reproduced live on TEST 2026-08-03: this second lookup 500'd with "permission denied for
  // table be_organization_members" the moment the identity-self fallback above started running
  // for the global admin's own account page.
  let resolution;
  try {
    resolution = await buildAppDeps().organizationMembership.resolveOrganizationForUser({
      platformUserId: session.user.userId,
    });
  } catch {
    return { session, workspaceContext: null };
  }

  if (!resolution.ok) {
    return { session, workspaceContext: null };
  }

  const { context } = resolution;
  const canAccessClinicalWorkspace =
    context.canAccessClinicalWorkspace ??
    ((context.role === 'owner' || context.role === 'doctor') && context.specialistId !== null);
  return {
    session,
    workspaceContext: {
      organizationId: context.organizationId,
      organizationName: null,
      membershipId: context.membershipId,
      membershipRole: context.role,
      specialistId: context.specialistId,
      canManageOrganization: context.canManageOrganization,
      canManageAllSpecialists: context.canManageAllSpecialists,
      canAccessClinicalWorkspace,
      selectedSpecialistId: context.canManageAllSpecialists ? null : context.specialistId,
    },
  };
});
