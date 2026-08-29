'use client';

import {
  DoctorPageToolbar,
  type DoctorPageToolbarProps,
} from '@/shared/ui/doctor/shell/DoctorPageToolbar';

export type DoctorCatalogStickyToolbarProps = Omit<DoctorPageToolbarProps, 'placement'> & {
  /** The surrounding flex body already begins below `DoctorPageHeader`. */
  withinRemainingHeight?: boolean;
};

/** Липкая верхняя полоска каталога врача: совмещается с `DoctorCatalogPageLayout` и отступами контейнера. */
export function DoctorCatalogStickyToolbar({
  children,
  className,
  withinRemainingHeight = false,
  ...props
}: DoctorCatalogStickyToolbarProps) {
  return (
    <DoctorPageToolbar
      placement={withinRemainingHeight ? 'sticky-remaining' : 'sticky-page'}
      className={className}
      {...props}
    >
      {children}
    </DoctorPageToolbar>
  );
}
