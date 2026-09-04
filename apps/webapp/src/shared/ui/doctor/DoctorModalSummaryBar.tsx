import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  doctorModalSummaryTextClass,
  doctorPanelBottomShadowClass,
} from '@/shared/ui/doctor/doctorVisual';

type DoctorModalSummaryBarProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Fixed contextual summary between a canonical modal header and its scrolling list.
 *
 * Плотность текста и одна лёгкая нижняя тень — общие роли, а не локальные классы у caller.
 */
export function DoctorModalSummaryBar({ children, className }: DoctorModalSummaryBarProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 shrink-0 border-b border-border/60 bg-background px-4 py-3',
        doctorModalSummaryTextClass,
        doctorPanelBottomShadowClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
