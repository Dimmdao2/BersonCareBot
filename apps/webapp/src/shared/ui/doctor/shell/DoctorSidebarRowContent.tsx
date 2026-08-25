import type { ReactNode } from 'react';
import type { ClassValue } from 'clsx';
import { cn } from '@/lib/utils';
import { DOCTOR_MENU_ITEM_RADIUS_CLASS } from '@/shared/ui/doctor/navChrome';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';

type DoctorSidebarRowContentProps = {
  icon: ReactNode;
  label?: ReactNode;
  trailing?: ReactNode;
  tabletExpanded: boolean;
  iconVisibility?: 'always' | 'collapsed-only';
};

export function doctorSidebarRowClassName(
  tabletExpanded: boolean,
  ...classNames: ClassValue[]
): string {
  return cn(
    buttonVariants({ variant: 'ghost' }),
    DOCTOR_MENU_ITEM_RADIUS_CLASS,
    'flex h-9 w-full items-center justify-center px-0 text-sm font-normal',
    'lg:justify-start lg:px-3',
    tabletExpanded && 'md:justify-start md:px-3',
    classNames,
  );
}

/** One geometry for every row in the tablet rail and expanded/desktop sidebar. */
export function DoctorSidebarRowContent({
  icon,
  label,
  trailing,
  tabletExpanded,
  iconVisibility = 'always',
}: DoctorSidebarRowContentProps) {
  const collapsedOnlyIcon = iconVisibility === 'collapsed-only';

  return (
    <span
      className={cn(
        'grid min-w-0 grid-cols-[1.75rem] items-center justify-center',
        collapsedOnlyIcon
          ? 'lg:flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-2'
          : 'lg:flex-1 lg:grid-cols-[1.75rem_minmax(0,1fr)_auto] lg:gap-2',
        tabletExpanded &&
          (collapsedOnlyIcon
            ? 'md:flex-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-2'
            : 'md:flex-1 md:grid-cols-[1.75rem_minmax(0,1fr)_auto] md:gap-2'),
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center',
          collapsedOnlyIcon && 'lg:hidden',
          collapsedOnlyIcon && tabletExpanded && 'md:hidden',
        )}
      >
        {icon}
      </span>
      {label ? (
        <span
          className={cn(
            'min-w-0 truncate text-left md:hidden lg:block',
            tabletExpanded && 'md:block',
          )}
        >
          {label}
        </span>
      ) : null}
      {trailing ? (
        <span
          className={cn(
            'shrink-0 md:hidden lg:flex',
            tabletExpanded && 'md:flex',
          )}
        >
          {trailing}
        </span>
      ) : null}
    </span>
  );
}
