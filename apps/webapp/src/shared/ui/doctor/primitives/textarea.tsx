import type { ComponentProps } from 'react';
import { Textarea as SharedTextarea } from '@/shared/ui/primitives/textarea';
import { cn } from '@/lib/utils';

/** Doctor-only textarea surface; matches the shared 8px doctor control radius. */
export function Textarea({ className, ...props }: ComponentProps<typeof SharedTextarea>) {
  return (
    <SharedTextarea
      className={cn(
        'rounded-[var(--doctor-control-radius,8px)] bg-white dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
