'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

/** Compact inline marker for a patient who is currently on support. */
export function DoctorSupportStar({ className }: { className?: string }) {
  const { supportGroupLabel } = useDoctorPatientTerms();
  return (
    <span
      className={cn(
        'relative -top-0.5 ml-1 inline-block text-[10px] leading-none font-semibold text-primary',
        className,
      )}
      title={supportGroupLabel}
      aria-label={supportGroupLabel}
    >
      ★
    </span>
  );
}

/**
 * Keeps the support marker immediately after a patient name without imposing typography.
 * Callers retain their existing list/header classes; only the name/star geometry is shared.
 */
export function DoctorPatientName({
  children,
  isOnSupport = false,
  className,
  nameClassName,
  ...spanProps
}: {
  children: ComponentPropsWithoutRef<'span'>['children'];
  isOnSupport?: boolean;
  className?: string;
  nameClassName?: string;
} & Omit<ComponentPropsWithoutRef<'span'>, 'children' | 'className'>) {
  return (
    <span className={cn('inline-flex min-w-0 items-baseline', className)} {...spanProps}>
      <span className={cn('min-w-0 truncate', nameClassName)}>{children}</span>
      {isOnSupport ? <DoctorSupportStar className="shrink-0" /> : null}
    </span>
  );
}
