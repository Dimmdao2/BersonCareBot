'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import type { DoctorMenuAccess } from '@/shared/ui/doctor/doctorNavLinks';
import { DoctorBottomNav } from '@/shared/ui/doctor/shell/DoctorBottomNav';
import { DoctorHeader } from '@/shared/ui/doctor/shell/DoctorHeader';
import { DOCTOR_WORKSPACE_TOP_PADDING_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';

type DoctorWorkspaceViewportProps = {
  header: {
    userDisplayName?: string;
    isPlatformOperator: boolean;
    menuAccess: DoctorMenuAccess;
    patientLabel?: string;
    hideMenuOnDesktop: boolean;
    enableBadgePolling: boolean;
    menuKind: 'doctor' | 'platform';
  };
  sidebar?: ReactNode;
  bottomNav?: {
    menuAccess: DoctorMenuAccess;
    patientLabel?: string;
  };
  children: ReactNode;
};

/**
 * Viewport owner for the doctor workspace.
 *
 * Today (fit dashboard) and Patients (continuous list) are the pilots for the mobile three-row
 * frame: header, remaining content, bottom navigation. Other routes keep the legacy overlay
 * compensation until both scroll contracts are visually accepted.
 */
export function DoctorWorkspaceViewport({
  header,
  sidebar,
  bottomNav,
  children,
}: DoctorWorkspaceViewportProps) {
  const pathname = usePathname() ?? routePaths.doctor;
  const useMobileRows =
    pathname === routePaths.doctor || pathname === routePaths.doctorPatients;

  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background"
      data-doctor-mobile-frame={useMobileRows ? 'rows' : 'overlay'}
    >
      <DoctorHeader {...header} mobilePlacement={useMobileRows ? 'row' : 'overlay'} />
      <div
        className={cn(
          'flex min-h-0 flex-1 md:pb-0',
          useMobileRows
            ? 'pb-0 pt-0'
            : cn(
                'pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]',
                DOCTOR_WORKSPACE_TOP_PADDING_CLASS,
              ),
        )}
      >
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
      {bottomNav ? (
        <DoctorBottomNav
          {...bottomNav}
          mobilePlacement={useMobileRows ? 'row' : 'overlay'}
        />
      ) : null}
    </div>
  );
}
