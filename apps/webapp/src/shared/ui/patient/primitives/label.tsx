import * as React from 'react';

import { Label as LabelPrimitive } from '@/shared/ui/primitives/label';
import { cn } from '@/lib/utils';

export type PatientLabelVariant = 'default' | 'field';

export const patientFieldLabelClassName =
  'text-[length:var(--patient-font-size-caption)] font-[var(--patient-font-weight-medium)] leading-[var(--patient-line-height-caption)] uppercase tracking-wide text-[var(--patient-text-caption)]';

type PatientLabelProps = React.ComponentProps<typeof LabelPrimitive> & {
  variant?: PatientLabelVariant;
};

function Label({ variant = 'default', className, ...props }: PatientLabelProps) {
  return (
    <LabelPrimitive
      className={cn(variant === 'field' && patientFieldLabelClassName, className)}
      {...props}
    />
  );
}

export { Label };
