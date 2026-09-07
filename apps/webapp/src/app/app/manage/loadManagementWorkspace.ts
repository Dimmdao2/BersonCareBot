import { cache } from 'react';
import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { requireOrganizationManagementContext } from '@/app-layer/guards/requireRole';
import { resolveDoctorWorkspaceComposition } from '@/modules/doctor-workspace/composition';

export const loadManagementWorkspace = cache(async () => {
  const workspace = await requireOrganizationManagementContext();
  const deps = buildAppDeps();
  const bookingEngine = deps.bookingEngine;
  const [organization, clinicTeamEntitlement, seats] = await Promise.all([
    bookingEngine
      ? bookingEngine.organization.getOrganization(workspace.organizationId)
      : Promise.resolve(null),
    requireEntitlementForReadAction(workspace, 'clinic_team'),
    deps.clinicSeats.getSeatStatus(workspace.organizationId, workspace.session.user.userId),
  ]);
  const workspaceComposition = resolveDoctorWorkspaceComposition({
    clinicTeamEntitled: clinicTeamEntitlement.ok,
    seats,
  });

  if (workspaceComposition === 'solo') redirect('/app/settings?tab=organization');

  return {
    workspace,
    organizationName: organization?.title?.trim() || 'Кабинет',
    workspaceComposition,
  };
});
