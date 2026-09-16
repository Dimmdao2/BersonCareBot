import type { ComponentProps } from 'react';
import { Label as SharedLabel } from '@/shared/ui/primitives/label';
import { cn } from '@/lib/utils';

/** Doctor field label: comfortable line height and shared 7px text inset. */
export function Label({ className, ...props }: ComponentProps<typeof SharedLabel>) {
  return <SharedLabel className={cn('leading-[1.5] indent-[7px]', className)} {...props} />;
}
