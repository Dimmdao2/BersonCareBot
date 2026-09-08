import Link from 'next/link';
import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TabsContent, TabsList, TabsTrigger } from '@/shared/ui/patient/primitives/tabs';

type PatientSegmentedStripProps = ComponentPropsWithoutRef<'div'> & {
  as?: 'div' | 'nav';
  rounded?: 'card' | 'lg' | 'none';
};

/** Shared patient chrome for related previous/next controls and segmented tabs. */
export function PatientSegmentedStrip({
  as: Component = 'div',
  className,
  rounded = 'none',
  ...props
}: PatientSegmentedStripProps) {
  return (
    <Component
      className={cn(
        'flex w-full shrink-0 items-stretch gap-px overflow-hidden border border-[var(--patient-segmented-border)] bg-[var(--patient-segmented-border)] shadow-sm',
        rounded === 'card' &&
          'rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]',
        rounded === 'lg' && 'rounded-lg',
        className,
      )}
      {...props}
    />
  );
}

const patientSegmentedPagerCellClass =
  'flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 px-3 py-2 patient-type-navigation outline-none transition-colors duration-150 no-underline';

type PatientSegmentedPagerLinkProps = Omit<ComponentProps<typeof Link>, 'className'> & {
  className?: string;
};

export function PatientSegmentedPagerLink({
  className,
  ...props
}: PatientSegmentedPagerLinkProps) {
  return (
    <Link
      className={cn(
        patientSegmentedPagerCellClass,
        'cursor-pointer bg-[var(--patient-segmented-bg)] patient-text-segmented hover:bg-[var(--patient-segmented-hover-bg)] active:bg-[var(--patient-segmented-active-bg)]',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--patient-color-primary)]',
        className,
      )}
      {...props}
    />
  );
}

export function PatientSegmentedPagerDisabledCell({
  children,
  className,
  tone = 'token',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'faded' | 'token';
}) {
  return (
    <span
      aria-hidden
      className={cn(
        patientSegmentedPagerCellClass,
        'pointer-events-none',
        tone === 'token' &&
          'bg-[var(--patient-segmented-disabled-bg)] patient-text-segmented-disabled',
        tone === 'faded' && 'bg-[var(--patient-segmented-bg)] patient-text-segmented opacity-40',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PatientSegmentedPagerLabel({
  children,
  className,
  width = 'auto',
}: {
  children: ReactNode;
  className?: string;
  width?: 'auto' | 'compact' | 'wide';
}) {
  return (
    <div
      className={cn(
        'flex min-h-[2.75rem] min-w-0 items-center justify-center bg-[var(--patient-segmented-bg)] px-3 py-2 text-center patient-type-navigation-label patient-text-segmented-label',
        width === 'compact' && 'flex-[1.4]',
        width === 'wide' && 'flex-[2]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PatientSegmentedTabList({
  className,
  ...props
}: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      activateOnFocus
      aria-label="Разделы программы"
      className={cn(
        'sticky top-0 z-[5] grid !h-auto !w-full grid-cols-3 gap-px !rounded-none border-x border-b border-[var(--patient-segmented-border)] !bg-[var(--patient-segmented-border)] !p-0 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

type PatientSegmentedTabProps = Omit<ComponentProps<typeof TabsTrigger>, 'children'> & {
  label: ReactNode;
  subtitle: ReactNode;
};

export function PatientSegmentedTab({
  className,
  label,
  subtitle,
  ...props
}: PatientSegmentedTabProps) {
  return (
    <TabsTrigger
      className={cn(
        'group/segmented-tab relative flex !h-auto min-h-[3.25rem] !rounded-none !border-0 px-1 py-2 text-center !shadow-none lg:min-h-[3.5rem] lg:px-2',
        'bg-[var(--patient-segmented-bg)] patient-text-segmented hover:bg-[var(--patient-segmented-hover-bg)] data-active:!bg-[var(--patient-segmented-active-bg)] data-active:!shadow-none',
        'focus-visible:!border-[var(--patient-color-primary)] focus-visible:!ring-2 focus-visible:!ring-inset focus-visible:!ring-[var(--patient-color-primary)]',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary)] after:opacity-0 data-active:after:opacity-100',
        className,
      )}
      {...props}
    >
      <span className="patient-type-navigation patient-text-segmented-tab-label">
        {label}
      </span>
      <span className="patient-type-navigation-label patient-text-segmented-tab-subtitle">
        {subtitle}
      </span>
    </TabsTrigger>
  );
}

export function PatientSegmentedTabPanel({
  className,
  ...props
}: ComponentProps<typeof TabsContent>) {
  return <TabsContent keepMounted className={cn('!flex-none !text-inherit', className)} {...props} />;
}
