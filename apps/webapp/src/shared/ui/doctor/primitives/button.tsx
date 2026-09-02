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

const doctorButtonRadiusClassName =
  'doctor-button-radius rounded-[var(--doctor-button-radius,8px)]';

/** Doctor button radius (8px). Explicit caller radii (`rounded-none`, icon circles) still win. */
export function Button({ className, size, ...props }: SharedButtonProps) {
  return (
    <SharedButton
      size={size}
      className={cn(doctorButtonRadiusClassName, size === 'sm' && 'h-9', className)}
      {...props}
    />
  );
}

/** Link/button class helper with the same doctor-only radius. */
export function buttonVariants(props?: SharedButtonVariantsProps): string {
  const { className, size, ...variants } = props ?? {};
  return cn(
    sharedButtonVariants({ ...variants, size }),
    doctorButtonRadiusClassName,
    size === 'sm' && 'h-9',
    className,
  );
}

export type { ButtonVariants } from '@/shared/ui/primitives/button';
