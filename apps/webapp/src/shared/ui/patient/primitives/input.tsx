import * as React from 'react';

import { Input as InputPrimitive } from '@/shared/ui/primitives/input';
import { cn } from '@/lib/utils';

export { inputFieldSurfaceClassName } from '@/shared/ui/primitives/input';

export type PatientControlVariant = 'default' | 'journal';

/** Shared 40px journal field chrome, backed by patient-theme control tokens. */
export const patientJournalControlClassName = cn(
  'h-[var(--patient-control-height,2.5rem)] w-full min-w-[200px]',
  'rounded-[var(--patient-control-radius,var(--patient-card-radius-mobile))] md:rounded-[var(--patient-control-radius,var(--patient-card-radius-desktop))]',
  'border-[var(--patient-control-border,var(--patient-border))] bg-[var(--patient-control-bg,var(--patient-card-bg))]',
  'px-[var(--patient-control-padding-inline,0.75rem)] text-base text-[var(--patient-control-text,var(--patient-text-primary))] shadow-none',
  'focus-visible:border-[var(--patient-control-focus-border,var(--patient-color-primary))] focus-visible:ring-2 focus-visible:ring-[var(--patient-control-focus-ring,var(--patient-color-primary))]',
);

type PatientInputProps = React.ComponentProps<typeof InputPrimitive> & {
  variant?: PatientControlVariant;
};

function Input({ variant = 'default', className, ...props }: PatientInputProps) {
  return (
    <InputPrimitive
      className={cn(variant === 'journal' && patientJournalControlClassName, className)}
      {...props}
    />
  );
}

export { Input };
