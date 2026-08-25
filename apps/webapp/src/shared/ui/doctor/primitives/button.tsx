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

/** Doctor button with the shared exact 8px radius. */
export function Button({ className, size, ...props }: SharedButtonProps) {
  return (
    <SharedButton
      size={size}
      className={cn(
        '!rounded-[var(--button-radius,8px)]',
        size === 'sm' && 'h-9',
        className,
      )}
      {...props}
    />
  );
}

/** Link/button class helper with the same shared button radius. */
export function buttonVariants(props?: SharedButtonVariantsProps): string {
  const { className, size, ...variants } = props ?? {};
  return cn(
    sharedButtonVariants({ ...variants, size }),
    '!rounded-[var(--button-radius,8px)]',
    size === 'sm' && 'h-9',
    className,
  );
}

export type { ButtonVariants } from '@/shared/ui/primitives/button';
