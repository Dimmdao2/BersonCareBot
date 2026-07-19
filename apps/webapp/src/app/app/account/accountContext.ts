import { cache } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffAccountPage } from "@/app-layer/guards/requireRole";
import type { DoctorWorkspaceContext } from "@/modules/doctor-workspace/types";

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
  const resolution = await buildAppDeps().organizationMembership.resolveOrganizationForUser({
    platformUserId: session.user.userId,
  });

  if (!resolution.ok) {
    return { session, workspaceContext: null };
  }

  const { context } = resolution;
  const canAccessClinicalWorkspace =
    context.canAccessClinicalWorkspace ??
    ((context.role === "owner" || context.role === "doctor") && context.specialistId !== null);
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
