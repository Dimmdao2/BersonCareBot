/**
 * Doctor app shell: content container under `#app-shell-doctor`.
 * Header/sidebar live in `app/doctor/layout.tsx` (`DoctorWorkspaceShell`).
 */

import type { ReactNode } from 'react';
import {
  DOCTOR_PAGE_CONTAINER_CLASS,
  DOCTOR_FULL_HEIGHT_PAGE_CLASS,
  DOCTOR_FULL_HEIGHT_CONTENT_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import type { SessionUser } from '@/shared/types/session';
import { DoctorShellChromeRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';

export type DoctorAppShellProps = {
  title: string;
  children: ReactNode;
  /**
   * Layout mode:
   * - `"default"` (default): padded flow container with the shared 18px bottom gutter.
   * - `"full-height"`: flex-col fill-height container for pages whose inner lists
   *   scroll internally (Пациенты, Коммуникации, Заявки, Расписание-список).
   *   На всех ширинах shell занимает остаток viewport и делегирует прокрутку
   *   внутренним панелям. Обычные страницы должны использовать `"default"`.
   */
  layout?: 'default' | 'full-height';
  /** Legacy AppShell props — ignored; doctor chrome is in DoctorWorkspaceShell layout. */
  user?: SessionUser | null;
  backHref?: string;
  backLabel?: string;
  /** Page-specific actions rendered before the mobile menu button. */
  mobileHeaderActions?: ReactNode;
};

export function DoctorAppShell({
  title,
  children,
  layout = 'default',
  backHref,
  backLabel,
  mobileHeaderActions,
}: DoctorAppShellProps) {
  // `--doctor-sticky-offset` определяется зонально для `#app-shell-doctor` в `doctor.css`
  // (см. doctorWorkspaceLayout.ts): <md → высота мобильной DoctorHeader, md+ → высота per-page DoctorPageHeader.
  if (layout === 'full-height') {
    return (
      <div
        id="app-shell-doctor"
        className={`${DOCTOR_FULL_HEIGHT_PAGE_CLASS} theme-bersoncare-doctor-dna`}
      >
        <DoctorShellChromeRegistration
          title={title}
          backHref={backHref}
          backLabel={backLabel}
          mobileActions={mobileHeaderActions}
        />
        <main
          id="app-shell-content"
          className={`${DOCTOR_FULL_HEIGHT_CONTENT_CLASS} doctor-page-content gap-3 px-3`}
        >
          {children}
        </main>
      </div>
    );
  }
  return (
    <div
      id="app-shell-doctor"
      className={`${DOCTOR_PAGE_CONTAINER_CLASS} theme-bersoncare-doctor-dna`}
    >
      <DoctorShellChromeRegistration
        title={title}
        backHref={backHref}
        backLabel={backLabel}
        mobileActions={mobileHeaderActions}
      />
      <main id="app-shell-content" className="doctor-page-content flex flex-col gap-3 px-3">
        {children}
      </main>
    </div>
  );
}
