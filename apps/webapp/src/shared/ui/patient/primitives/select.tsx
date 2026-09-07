import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
  SelectTrigger as SelectTriggerPrimitive,
} from '@/shared/ui/primitives/select';
import { cn } from '@/lib/utils';
import {
  patientJournalControlClassName,
  type PatientControlVariant,
} from './input';

type PatientSelectTriggerProps = React.ComponentProps<typeof SelectTriggerPrimitive> & {
  variant?: PatientControlVariant;
};

function SelectTrigger({ variant = 'default', className, ...props }: PatientSelectTriggerProps) {
  return (
    <SelectTriggerPrimitive
      className={cn(variant === 'journal' && patientJournalControlClassName, className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
