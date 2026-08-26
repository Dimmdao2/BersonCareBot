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
      className={cn('doctor-button-radius bg-white', className)}
      {...props}
    />
  );
}

/** Doctor select popup follows the trigger edge instead of shifting to the selected item. */
export function SelectContent({
  align = 'start',
  alignItemWithTrigger = false,
  ...props
}: ComponentProps<typeof SharedSelectContent>) {
  return (
    <SharedSelectContent
      align={align}
      alignItemWithTrigger={alignItemWithTrigger}
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
