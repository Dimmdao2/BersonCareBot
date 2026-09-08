import * as React from 'react';

import { cn } from '@/lib/utils';
import { Label } from './primitives/label';

type PatientFieldProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  children: React.ReactNode;
  label: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
};

/** Presentational field shell; it never changes the control or its aria-describedby. */
function PatientField({
  children,
  className,
  error,
  help,
  htmlFor,
  label,
  ...props
}: PatientFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      <Label variant="field" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {help ? <div>{help}</div> : null}
      {error ? <div>{error}</div> : null}
    </div>
  );
}

export { PatientField };
