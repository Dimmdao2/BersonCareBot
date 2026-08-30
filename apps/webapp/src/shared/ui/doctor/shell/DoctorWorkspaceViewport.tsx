'use client';

import type { ReactNode } from 'react';
import type { DoctorMenuAccess } from '@/shared/ui/doctor/doctorNavLinks';
import { DoctorBottomNav } from '@/shared/ui/doctor/shell/DoctorBottomNav';
import { DoctorHeader } from '@/shared/ui/doctor/shell/DoctorHeader';
import { DOCTOR_MOBILE_PAGE_TOOLBAR_DOCK_ID } from '@/shared/ui/doctor/shell/DoctorPageToolbar';

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
 * Mobile chrome uses real viewport rows: header, remaining content, optional page toolbar,
 * bottom navigation.
 * Page-level shells decide whether the middle row is a fitted dashboard, an internally
 * scrolling list/calendar, or a document surface.
 */
export function DoctorWorkspaceViewport({
  header,
  sidebar,
  bottomNav,
  children,
}: DoctorWorkspaceViewportProps) {
  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background"
      data-doctor-mobile-frame="rows"
    >
      <DoctorHeader {...header} />
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
      <div
        id={DOCTOR_MOBILE_PAGE_TOOLBAR_DOCK_ID}
        className="z-20 shrink-0 empty:hidden md:hidden"
        data-doctor-mobile-page-toolbar-dock=""
      />
      {bottomNav ? <DoctorBottomNav {...bottomNav} /> : null}
    </div>
  );
}
