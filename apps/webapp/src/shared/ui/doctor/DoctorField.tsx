import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/shared/ui/doctor/primitives/label';

const widthClasses = {
  sm: 'w-full max-w-[var(--doctor-field-sm,12rem)]',
  md: 'w-full max-w-[var(--doctor-field-md,24rem)]',
  lg: 'w-full max-w-[var(--doctor-field-lg,40rem)]',
} as const;

type DoctorFieldProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  width?: keyof typeof widthClasses;
};

/** Label, control and optional hint with the canonical doctor-form width contract. */
export function DoctorField({
  label,
  children,
  htmlFor,
  hint,
  width = 'md',
  className,
  ...props
}: DoctorFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', widthClasses[width], className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
