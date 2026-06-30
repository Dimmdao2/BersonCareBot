/**
 * Doctor app shell: content container under `#app-shell-doctor`.
 * Header/sidebar live in `app/doctor/layout.tsx` (`DoctorWorkspaceShell`).
 */

import type { ReactNode } from "react";
import {
  DOCTOR_PAGE_CONTAINER_CLASS,
  DOCTOR_FULL_HEIGHT_PAGE_CLASS,
} from "@/shared/ui/doctor/doctorWorkspaceLayout";
import type { SessionUser } from "@/shared/types/session";

export type DoctorAppShellProps = {
  title: string;
  children: ReactNode;
  /**
   * Layout mode:
   * - `"default"` (default): padded content container (`max-w-7xl px-3 pt-3 pb-6`).
   * - `"full-height"`: flex-col fill-height container for pages whose inner lists
   *   scroll internally (Пациенты, Коммуникации, Заявки, Расписание-список).
   *   Overflow is locked only at `lg+` via child classes; mobile scrolls normally.
   */
  layout?: "default" | "full-height";
  /** Legacy AppShell props — ignored; doctor chrome is in DoctorWorkspaceShell layout. */
  user?: SessionUser | null;
  backHref?: string;
  backLabel?: string;
};

export function DoctorAppShell({ children, layout = "default" }: DoctorAppShellProps) {
  // `--doctor-sticky-offset` определяется зонально для `#app-shell-doctor` в `doctor.css`
  // (см. doctorWorkspaceLayout.ts): <md → высота мобильной DoctorHeader, md+ → высота per-page DoctorPageHeader.
  if (layout === "full-height") {
    return (
      <div id="app-shell-doctor" className={DOCTOR_FULL_HEIGHT_PAGE_CLASS}>
        <main id="app-shell-content" className="flex min-h-0 flex-1 flex-col gap-3">
          {children}
        </main>
      </div>
    );
  }
  return (
    <div id="app-shell-doctor" className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <main id="app-shell-content" className="flex flex-col gap-3">
        {children}
      </main>
    </div>
  );
}
