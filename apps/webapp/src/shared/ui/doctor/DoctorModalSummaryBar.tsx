import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DoctorModalSummaryBarProps = {
  children: ReactNode;
  className?: string;
};

/** Fixed contextual summary between a canonical modal header and its scrolling list. */
export function DoctorModalSummaryBar({ children, className }: DoctorModalSummaryBarProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 shrink-0 border-b border-border/60 bg-background px-4 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
