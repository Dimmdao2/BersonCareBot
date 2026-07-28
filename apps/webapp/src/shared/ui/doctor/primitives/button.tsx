'use client';

import type { ComponentProps } from 'react';
import {
  Button as SharedButton,
  buttonVariants as sharedButtonVariants,
} from '@/shared/ui/primitives/button';
import { cn } from '@/lib/utils';

type SharedButtonProps = ComponentProps<typeof SharedButton>;
type SharedButtonVariantsProps = NonNullable<Parameters<typeof sharedButtonVariants>[0]> & {
  className?: string;
};

/** Doctor-only pill control. Explicit caller radii (`rounded-none`, icon circles) still win. */
export function Button({ className, ...props }: SharedButtonProps) {
  return (
    <SharedButton
      className={cn('rounded-[var(--doctor-control-radius,24px)]', className)}
      {...props}
    />
  );
}

/** Link/button class helper with the same doctor-only pill default. */
export function buttonVariants(props?: SharedButtonVariantsProps): string {
  const { className, ...variants } = props ?? {};
  return cn(
    sharedButtonVariants(variants),
    'rounded-[var(--doctor-control-radius,24px)]',
    className,
  );
}

export type { ButtonVariants } from '@/shared/ui/primitives/button';
