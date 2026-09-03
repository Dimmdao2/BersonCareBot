'use client';

import type { ComponentProps } from 'react';
import {
  Select,
  SelectContent as SharedSelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger as SharedSelectTrigger,
  SelectValue,
} from '@/shared/ui/primitives/select';
import { cn } from '@/lib/utils';

/** Doctor select radius matches doctor buttons (8px). Explicit caller radii remain authoritative. */
export function SelectTrigger({ className, ...props }: ComponentProps<typeof SharedSelectTrigger>) {
  return (
    <SharedSelectTrigger
      className={cn('rounded-[var(--doctor-button-radius,8px)] bg-white', className)}
      {...props}
    />
  );
}

/** Doctor select popup overlaps its trigger; matching item padding keeps both left edges aligned. */
export function SelectContent({
  align = 'start',
  alignItemWithTrigger = true,
  className,
  ...props
}: ComponentProps<typeof SharedSelectContent>) {
  return (
    <SharedSelectContent
      align={align}
      alignItemWithTrigger={alignItemWithTrigger}
      className={cn(
        'rounded-[var(--doctor-button-radius,8px)] [&_[data-slot=select-item]]:pl-3',
        className,
      )}
      {...props}
    />
  );
}

export {
  Select,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
};
