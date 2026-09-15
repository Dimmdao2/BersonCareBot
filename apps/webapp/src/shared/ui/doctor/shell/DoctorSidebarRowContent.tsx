'use client';

import type { ReactNode } from 'react';
import type { ClassValue } from 'clsx';
import { cn } from '@/lib/utils';
import { DOCTOR_MENU_ITEM_RADIUS_CLASS } from '@/shared/ui/doctor/navChrome';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { useDoctorShellDesktopRail } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';

type DoctorSidebarRowContentProps = {
  icon: ReactNode;
  label?: ReactNode;
  trailing?: ReactNode;
  iconBadge?: ReactNode;
  tabletExpanded: boolean;
  iconVisibility?: 'always' | 'collapsed-only';
};

export function doctorSidebarRowClassName(
  tabletExpanded: boolean,
  ...classNames: ClassValue[]
): string;
export function doctorSidebarRowClassName(
  state: { tabletExpanded: boolean; desktopRail?: boolean },
  ...classNames: ClassValue[]
): string;
export function doctorSidebarRowClassName(
  state: boolean | { tabletExpanded: boolean; desktopRail?: boolean },
  ...classNames: ClassValue[]
): string {
  const tabletExpanded = typeof state === 'boolean' ? state : state.tabletExpanded;
  const desktopRail = typeof state === 'boolean' ? false : (state.desktopRail ?? false);
  return cn(
    buttonVariants({ variant: 'ghost' }),
    DOCTOR_MENU_ITEM_RADIUS_CLASS,
    'flex h-9 w-full items-center justify-center px-0 text-sm font-normal',
    !desktopRail && 'lg:justify-start lg:px-3',
    tabletExpanded && 'md:justify-start md:px-3',
    classNames,
  );
}

/** One geometry for every row in the tablet rail and expanded/desktop sidebar. */
export function DoctorSidebarRowContent({
  icon,
  label,
  trailing,
  iconBadge,
  tabletExpanded,
  iconVisibility = 'always',
}: DoctorSidebarRowContentProps) {
  /*
   * Просьбу свернуть меню в полоску и на десктопе ряд читает сам из оболочки, а не получает
   * пропом: иначе её пришлось бы протаскивать через каждый ряд, группу и вложенное меню. Вне
   * оболочки (мобильная шторка) хук отдаёт false, и поведение ряда прежнее.
   */
  const desktopRail = useDoctorShellDesktopRail();
  const collapsedOnlyIcon = iconVisibility === 'collapsed-only';

  return (
    <span
      className={cn(
        'grid min-w-0 grid-cols-[1.75rem] items-center justify-center',
        !desktopRail &&
          (collapsedOnlyIcon
            ? 'lg:flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-2'
            : 'lg:flex-1 lg:grid-cols-[1.75rem_minmax(0,1fr)_auto] lg:gap-2'),
        tabletExpanded &&
          (collapsedOnlyIcon
            ? 'md:flex-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-2'
            : 'md:flex-1 md:grid-cols-[1.75rem_minmax(0,1fr)_auto] md:gap-2'),
      )}
    >
      <span
        className={cn(
          'relative flex size-7 items-center justify-center',
          collapsedOnlyIcon && !desktopRail && 'lg:hidden',
          collapsedOnlyIcon && tabletExpanded && 'md:hidden',
        )}
      >
        {icon}
        {iconBadge}
      </span>
      {label ? (
        <span
          className={cn(
            'min-w-0 truncate text-left md:hidden',
            !desktopRail && 'lg:block',
            tabletExpanded && 'md:block',
          )}
        >
          {label}
        </span>
      ) : null}
      {trailing ? (
        <span
          className={cn(
            'shrink-0 md:hidden',
            !desktopRail && 'lg:flex',
            tabletExpanded && 'md:flex',
          )}
        >
          {trailing}
        </span>
      ) : null}
    </span>
  );
}
