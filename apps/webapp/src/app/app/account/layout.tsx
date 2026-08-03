import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../../styles/doctor.css';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadStaffAccountPageContext } from './accountContext';

export const metadata: Metadata = staffPwaLayoutMetadata;

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const { session, workspaceContext } = await loadStaffAccountPageContext();
  const isPlatformConsole = session.user.role === 'admin';

  return (
    <DoctorWorkspaceShell
      isPlatformOperator={isPlatformConsole}
      menuKind={isPlatformConsole ? 'platform' : 'doctor'}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
      workspaceContext={workspaceContext ?? undefined}
      enableTenantRuntime={workspaceContext !== null}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
