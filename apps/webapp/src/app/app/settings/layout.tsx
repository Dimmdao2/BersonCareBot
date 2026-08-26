/**
 * Тот же каркас, что у `/app/doctor`: полноширинная шапка, под ней левое меню разделов (md+) и контент.
 * Доступ как на странице: не клиент (клиент → свой hub + toast).
 */
import type { ReactNode } from 'react';
import '../../styles/doctor.css';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadDoctorWorkspaceShell } from '../doctor/loadDoctorWorkspaceShell';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const shell = await loadDoctorWorkspaceShell(true);
  const { session } = shell;

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
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
