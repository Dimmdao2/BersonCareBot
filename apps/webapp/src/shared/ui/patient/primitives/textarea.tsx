import * as React from 'react';

import { Textarea as TextareaPrimitive } from '@/shared/ui/primitives/textarea';
import { cn } from '@/lib/utils';
import {
  patientControlTypographyClassName,
  patientJournalControlClassName,
  type PatientControlVariant,
} from './input';

type PatientTextareaProps = React.ComponentProps<typeof TextareaPrimitive> & {
  variant?: PatientControlVariant;
};

function Textarea({ variant = 'default', className, ...props }: PatientTextareaProps) {
  return (
    <TextareaPrimitive
      className={cn(patientControlTypographyClassName, variant === 'journal' && patientJournalControlClassName, className)}
      {...props}
    />
  );
}

export { Textarea };
