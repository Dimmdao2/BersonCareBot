/**
 * Тот же каркас, что у `/app/doctor`: полноширинная шапка, под ней левое меню разделов (md+) и контент.
 * Доступ как на странице: не клиент (клиент → свой hub + toast).
 */
import type { ReactNode } from 'react';
import '../../styles/doctor.css';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadDoctorWorkspaceShell } from '../doctor/loadDoctorWorkspaceShell';
import { ClinicMaintenanceScreen } from '@/shared/ui/doctor/ClinicMaintenanceScreen';
import { DoctorGlobalQuickActions } from '../doctor/DoctorGlobalQuickActions';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const shell = await loadDoctorWorkspaceShell(true);
  const { session } = shell;

  const managementMode =
    shell.workspaceContext.canManageOrganization && shell.workspaceComposition === 'clinic';

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
      supportGroupLabel={shell.supportGroupLabel}
      appointmentLabel={shell.appointmentLabel}
      workspaceContext={shell.workspaceContext}
      workspaceComposition={shell.workspaceComposition}
      coursesEnabled={shell.coursesEnabled}
      promoEnabled={shell.promoEnabled}
      cmsEnabled={shell.cmsEnabled}
      patientHomeTodayEnabled={shell.patientHomeTodayEnabled}
      specialistTasksEnabled={shell.specialistTasksEnabled}
      workspaceModules={shell.workspaceModules}
      communicationsSurface={shell.communicationsSurface}
      brand={shell.shellBrand}
      menuKind={managementMode ? 'management' : 'doctor'}
      /*
       * Быстрые действия шапки живут в КАЖДОМ кабинетном экране, а не только под `/app/doctor`
       * (владелец 15.09.2026: «в режиме „профиль“ иконки в верхней панели „создать запись“ и
       * „новый клиент“ пропадают почему-то»). Причина была ровно в этом: настройки — отдельный
       * сегмент, и свой каркас он собирал без них. Условие то же, что у клинического каркаса:
       * кому клинический кабинет недоступен, тому и создавать запись нечем.
       */
      mobileHeaderActions={
        shell.workspaceAccess.canAccessClinicalWorkspace ? (
          <DoctorGlobalQuickActions
            patientSingularLabel={shell.patientLabel}
            appointmentsManageOwn={shell.workspaceAccess.appointmentsManageOwn}
          />
        ) : undefined
      }
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
