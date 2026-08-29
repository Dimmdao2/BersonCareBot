import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
  DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';

export type DoctorPageToolbarPlacement = 'header' | 'sticky-page' | 'sticky-remaining';

export type DoctorPageToolbarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: ReactNode;
  className?: string;
  placement?: DoctorPageToolbarPlacement;
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
  ...props
}: DoctorPageToolbarProps) {
  const sticky = placement !== 'header';

  return (
    <div
      {...props}
      data-doctor-page-toolbar=""
      className={cn(
        'border-b border-border/60 px-[var(--doctor-block-padding,18px)] py-1.5',
        DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
        sticky && 'sticky z-20 -mx-3 -mt-3',
        placement === 'sticky-page' && DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
        placement === 'sticky-remaining' && DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}
