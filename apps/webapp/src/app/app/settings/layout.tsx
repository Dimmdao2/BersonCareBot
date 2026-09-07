/**
 * Тот же каркас, что у `/app/doctor`: полноширинная шапка, под ней левое меню разделов (md+) и контент.
 * Доступ как на странице: не клиент (клиент → свой hub + toast).
 */
import type { ReactNode } from 'react';
import '../../styles/doctor.css';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadDoctorWorkspaceShell } from '../doctor/loadDoctorWorkspaceShell';
import { ClinicMaintenanceScreen } from '@/shared/ui/doctor/ClinicMaintenanceScreen';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveDoctorWorkspaceComposition } from '@/modules/doctor-workspace/composition';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const shell = await loadDoctorWorkspaceShell(true);
  const { session } = shell;

  const [teamEntitlement, seats] = await Promise.all([
    requireEntitlementForReadAction(shell.workspaceContext, 'clinic_team'),
    buildAppDeps().clinicSeats.getSeatStatus(
      shell.workspaceContext.organizationId,
      session.user.userId,
    ),
  ]);
  const managementMode =
    shell.workspaceContext.canManageOrganization &&
    resolveDoctorWorkspaceComposition({
      clinicTeamEntitled: teamEntitlement.ok,
      seats,
    }) === 'clinic';

  if (shell.maintenance.enabled) {
    return (
      <ClinicMaintenanceScreen
        clinicName={shell.shellBrand.displayName}
        message={shell.maintenance.message}
      />
    );
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
      brand={shell.shellBrand}
      menuKind={managementMode ? 'management' : 'doctor'}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
