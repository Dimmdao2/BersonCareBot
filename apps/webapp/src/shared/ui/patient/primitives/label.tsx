import * as React from 'react';

import { Label as LabelPrimitive } from '@/shared/ui/primitives/label';
import { cn } from '@/lib/utils';
import { patientFormLabelClass } from '@/shared/ui/patient/patientVisual';

export type PatientLabelVariant = 'default' | 'field';

export const patientFieldLabelClassName =
  `${patientFormLabelClass} uppercase tracking-wide`;

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
