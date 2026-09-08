import * as React from 'react';

import { Input as InputPrimitive } from '@/shared/ui/primitives/input';
import { cn } from '@/lib/utils';

export { inputFieldSurfaceClassName } from '@/shared/ui/primitives/input';

export type PatientControlVariant = 'default' | 'journal';

/** Readable form values use the patient body contract, including in portalled controls. */
export const patientControlTypographyClassName =
  'patient-type-body';

/** Shared 40px journal field chrome, backed by patient-theme control tokens. */
export const patientJournalControlClassName = cn(
  'h-[var(--patient-control-height)] w-full min-w-[200px]',
  'rounded-[var(--patient-control-radius)]',
  'border-[var(--patient-control-border)] bg-[var(--patient-control-bg)]',
  'px-[var(--patient-control-padding-inline)] shadow-none',
  patientControlTypographyClassName,
  'focus-visible:border-[var(--patient-control-focus-border)] focus-visible:ring-2 focus-visible:ring-[var(--patient-control-focus-ring)]',
);

type PatientInputProps = React.ComponentProps<typeof InputPrimitive> & {
  variant?: PatientControlVariant;
};

function Input({ variant = 'default', className, ...props }: PatientInputProps) {
  return (
    <InputPrimitive
      className={cn(patientControlTypographyClassName, variant === 'journal' && patientJournalControlClassName, className)}
      {...props}
    />
  );
}

export { Input };
