/**
 * Doctor app shell: content container under `#app-shell-doctor`.
 * Header/sidebar live in `app/doctor/layout.tsx` (`DoctorWorkspaceShell`).
 */

import type { ReactNode } from 'react';
import {
  DOCTOR_PAGE_CONTAINER_CLASS,
  DOCTOR_FULL_HEIGHT_PAGE_CLASS,
  DOCTOR_FULL_HEIGHT_CONTENT_CLASS,
  DOCTOR_MOBILE_PAGE_BOTTOM_GUTTER_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import type { SessionUser } from '@/shared/types/session';
import { DoctorShellChromeRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { cn } from '@/lib/utils';

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
  /** Keep the shared dashboard gutter above mobile bottom navigation. */
  mobileBottomGutter?: boolean;
  /** Legacy AppShell props — ignored; doctor chrome is in DoctorWorkspaceShell layout. */
  user?: SessionUser | null;
  backHref?: string;
  backLabel?: string;
  /** Page-specific actions rendered before the mobile menu button. */
  mobileHeaderActions?: ReactNode;
  /** Page section tabs rendered as a real shell row above the mobile bottom navigation. */
  mobileBottomTabs?: ReactNode;
};

export function DoctorAppShell({
  title,
  children,
  layout = 'default',
  mobileBottomGutter = false,
  backHref,
  backLabel,
  mobileHeaderActions,
  mobileBottomTabs,
}: DoctorAppShellProps) {
  // `--doctor-sticky-offset` определяется зонально для `#app-shell-doctor` в `doctor.css`
  // (см. doctorWorkspaceLayout.ts): <md → 0, md+ → высота per-page DoctorPageHeader.
  const fullHeight = layout === 'full-height';

  return (
    <div
      id="app-shell-doctor"
      data-doctor-page-layout={layout}
      className={cn(
        fullHeight ? DOCTOR_FULL_HEIGHT_PAGE_CLASS : DOCTOR_PAGE_CONTAINER_CLASS,
        mobileBottomGutter && DOCTOR_MOBILE_PAGE_BOTTOM_GUTTER_CLASS,
        'theme-bersoncare-doctor-dna',
      )}
    >
      <DoctorShellChromeRegistration
        title={title}
        backHref={backHref}
        backLabel={backLabel}
        mobileActions={mobileHeaderActions}
        mobileBottomTabs={mobileBottomTabs}
      />
      <main
        id="app-shell-content"
        className={cn(
          'doctor-page-content flex flex-col gap-3 px-3',
          fullHeight && DOCTOR_FULL_HEIGHT_CONTENT_CLASS,
        )}
      >
        {children}
      </main>
    </div>
  );
}
