import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DoctorResultCountProps = Omit<ComponentPropsWithoutRef<'p'>, 'children'> & {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
};

export function DoctorResultCount({
  className,
  label,
  value,
  valueClassName,
  ...props
}: DoctorResultCountProps) {
  return (
    <p
      className={cn(
        'inline-flex items-baseline gap-1.5 py-2 text-sm font-medium text-foreground/80',
        className,
      )}
      {...props}
    >
      <span>{label}:</span>
      <span className={cn('text-base font-semibold text-foreground', valueClassName)}>{value}</span>
    </p>
  );
}
