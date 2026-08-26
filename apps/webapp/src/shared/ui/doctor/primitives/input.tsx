import type { ComponentProps } from 'react';
import {
  Input as SharedInput,
  inputFieldSurfaceClassName as sharedInputFieldSurfaceClassName,
} from '@/shared/ui/primitives/input';
import { cn } from '@/lib/utils';

export const inputFieldSurfaceClassName = cn(
  sharedInputFieldSurfaceClassName,
  'rounded-[var(--doctor-control-radius,8px)] bg-white dark:bg-input/30',
);

/** Doctor-only input surface; patient/public consumers keep the shared primitive unchanged. */
export function Input({ className, ...props }: ComponentProps<typeof SharedInput>) {
  return <SharedInput className={cn(inputFieldSurfaceClassName, className)} {...props} />;
}
