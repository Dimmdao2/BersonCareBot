import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../../../styles/doctor.css';
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export const metadata: Metadata = staffPwaLayoutMetadata;

/** URL-preserving platform branch. It never resolves or renders a tenant workspace. */
export default async function GlobalAdminDoctorLayout({ children }: { children: ReactNode }) {
  buildAppDeps();
  const session = await requirePlatformOperationsPage();
  return (
    <DoctorWorkspaceShell
      isPlatformOperator={true}
      enableTenantRuntime={false}
      menuKind="platform"
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
