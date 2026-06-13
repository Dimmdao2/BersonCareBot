/**
 * Doctor app shell: content container under `#app-shell-doctor`.
 * Header/sidebar live in `app/doctor/layout.tsx` (`DoctorWorkspaceShell`).
 */

import type { ReactNode } from "react";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import type { SessionUser } from "@/shared/types/session";

export type DoctorAppShellProps = {
  title: string;
  children: ReactNode;
  /** Legacy AppShell props — ignored; doctor chrome is in DoctorWorkspaceShell layout. */
  user?: SessionUser | null;
  backHref?: string;
  backLabel?: string;
};

export function DoctorAppShell({ children }: DoctorAppShellProps) {
  // `--doctor-sticky-offset` определяется зонально для `#app-shell-doctor` в `doctor.css`
  // (см. doctorWorkspaceLayout.ts): <md → высота мобильной DoctorHeader, md+ → высота per-page DoctorPageHeader.
  return (
    <div id="app-shell-doctor" className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <main id="app-shell-content" className="flex flex-col gap-3">
        {children}
      </main>
    </div>
  );
}
