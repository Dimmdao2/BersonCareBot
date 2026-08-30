'use client';

import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import {
  DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
  DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';

export type DoctorPageToolbarPlacement = 'header' | 'sticky-page' | 'sticky-remaining';

export const DOCTOR_MOBILE_PAGE_TOOLBAR_DOCK_ID = 'doctor-mobile-page-toolbar-dock';

export type DoctorPageToolbarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: ReactNode;
  className?: string;
  placement?: DoctorPageToolbarPlacement;
  /** На mobile переносит эту же панель в настоящую строку над нижней навигацией. */
  dockOnMobile?: boolean;
};

/**
 * Единственная поверхность панели под шапкой врача.
 * Страница передаёт только содержимое; компонент владеет фоном, границей,
 * системными отступами и sticky-положением.
 */
export function DoctorPageToolbar({
  children,
  className,
  placement = 'header',
  dockOnMobile = false,
  ...props
}: DoctorPageToolbarProps) {
  const isMobile = useIsMobileViewport();
  const [mobileDock, setMobileDock] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMobileDock(document.getElementById(DOCTOR_MOBILE_PAGE_TOOLBAR_DOCK_ID));
  }, []);

  const isDocked = dockOnMobile && isMobile && mobileDock !== null;
  const effectivePlacement = isDocked ? 'header' : placement;
  const sticky = effectivePlacement !== 'header';

  const toolbar = (
    <div
      {...props}
      data-doctor-page-toolbar=""
      data-doctor-page-toolbar-docked={isDocked ? '' : undefined}
      className={cn(
        'border-b border-border/60 px-[var(--doctor-block-padding,18px)] py-1.5',
        DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
        sticky && 'sticky z-20 -mx-3 -mt-3',
        effectivePlacement === 'sticky-page' && DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
        effectivePlacement === 'sticky-remaining' && DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS,
        dockOnMobile && !isDocked && 'max-md:hidden',
        className,
      )}
    >
      {children}
    </div>
  );

  return isDocked ? createPortal(toolbar, mobileDock) : toolbar;
}
