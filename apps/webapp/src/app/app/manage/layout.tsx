import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../../styles/doctor.css';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadManagementWorkspace } from './loadManagementWorkspace';

export const metadata: Metadata = staffPwaLayoutMetadata;

export default async function ManagementLayout({ children }: { children: ReactNode }) {
  const { workspace, organizationName } = await loadManagementWorkspace();
  const workspaceContext: DoctorWorkspaceContext = {
    organizationId: workspace.organizationId,
    organizationName,
    membershipId: workspace.membershipId,
    membershipRole: workspace.membershipRole,
    specialistId: workspace.specialistId,
    canManageOrganization: workspace.canManageOrganization,
    canManageAllSpecialists: workspace.canManageAllSpecialists,
    canAccessClinicalWorkspace: workspace.canAccessClinicalWorkspace,
    doctorScreensDisabled: workspace.doctorScreensDisabled,
    selectedSpecialistId: workspace.canManageAllSpecialists ? null : workspace.specialistId,
  };

  return (
    <DoctorWorkspaceShell
      isPlatformOperator={workspace.session.user.role === 'admin'}
      userRole={workspace.session.user.role}
      userDisplayName={workspace.session.user.displayName}
      workspaceContext={workspaceContext}
      enableTenantRuntime={false}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
