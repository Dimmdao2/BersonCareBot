/**
 * /app/doctor/layout.tsx — thin shell: delegates request-local bootstrap to loadDoctorWorkspaceShell.
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import '../../styles/doctor.css';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadDoctorWorkspaceShell } from './loadDoctorWorkspaceShell';
import { ClinicMaintenanceScreen } from '@/shared/ui/doctor/ClinicMaintenanceScreen';
import { DoctorGlobalQuickActions } from './DoctorGlobalQuickActions';

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const shell = await loadDoctorWorkspaceShell();
  const { session, workspaceAccess } = shell;

  if (shell.maintenance.enabled) {
    return (
      <ClinicMaintenanceScreen
        clinicName={shell.shellBrand.displayName}
        message={shell.maintenance.message}
      />
    );
  }

  // A management-only membership has no clinical workspace to render.  Its landing is the
  // separately guarded management mode; the mode switch is only shown when both modes exist.
  if (!workspaceAccess.canAccessClinicalWorkspace && workspaceAccess.canManageOrganization) {
    redirect('/app/manage');
  }

  if (!workspaceAccess.canAccessClinicalWorkspace && !workspaceAccess.canManageOrganization) {
    if (shell.canRenderClinicalChildren) {
      return children;
    }
    redirect('/app/settings?tab=organization');
  }

  return (
    <DoctorWorkspaceShell
      isPlatformOperator={session.user.role === 'admin'}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
      patientLabel={shell.patientLabel}
      workspaceContext={shell.workspaceContext}
      coursesEnabled={shell.coursesEnabled}
      promoEnabled={shell.promoEnabled}
      cmsEnabled={shell.cmsEnabled}
      patientHomeTodayEnabled={shell.patientHomeTodayEnabled}
      specialistTasksEnabled={shell.specialistTasksEnabled}
      workspaceModules={shell.workspaceModules}
      brand={shell.shellBrand}
      mobileHeaderActions={<DoctorGlobalQuickActions patientSingularLabel={shell.patientLabel} />}
    >
      {shell.accessWarnings.length > 0 ? (
        <div
          className="m-3 space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          {shell.accessWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {children}
    </DoctorWorkspaceShell>
  );
}
