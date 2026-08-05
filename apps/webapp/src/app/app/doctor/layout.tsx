/**
 * /app/doctor/layout.tsx — thin shell: delegates request-local bootstrap to loadDoctorWorkspaceShell.
 */
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../../styles/doctor.css';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { loadDoctorWorkspaceShell } from './loadDoctorWorkspaceShell';

export const metadata: Metadata = staffPwaLayoutMetadata;

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const shell = await loadDoctorWorkspaceShell();
  const { session, workspaceAccess } = shell;

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
      brand={shell.shellBrand}
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
