'use client';

import type { Ref } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';

/**
 * Doctor schedule toolbar controls: white surface instead of the doctor canvas tint that
 * `variant="outline"` paints by default. Shared by the calendar and the work-schedule
 * toolbars so both read as the same control family.
 */
export const DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS = 'bg-white hover:bg-muted';
export const DOCTOR_ACTIVE_FILTER_BUTTON_CLASS =
  'border-primary text-primary hover:bg-primary/5 hover:text-primary';

/** Square icon control of the schedule toolbars (radius comes from the doctor button). */
export const DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS = 'size-[32px] shrink-0';

/** Period/month label button shared by the calendar and the work-schedule toolbars. */
export const DOCTOR_SCHEDULE_PERIOD_LABEL_CLASS =
  'h-8 min-w-0 flex-1 truncate px-2 text-center text-xs font-medium text-foreground';

export type DoctorSchedulePeriodNavProps = {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onLabelClick: () => void;
  prevAriaLabel: string;
  nextAriaLabel: string;
  labelAriaLabel: string;
  labelRef?: Ref<HTMLButtonElement>;
  className?: string;
  labelClassName?: string;
  prevTestId?: string;
  nextTestId?: string;
  labelTestId?: string;
};

/**
 * `◀ период ▶` of the doctor schedule toolbars. One implementation keeps the month/period
 * controls of «Записи» and «График работы» identical in size, font, surface and radius.
 */
export function DoctorSchedulePeriodNav({
  label,
  onPrev,
  onNext,
  onLabelClick,
  prevAriaLabel,
  nextAriaLabel,
  labelAriaLabel,
  labelRef,
  className,
  labelClassName,
  prevTestId,
  nextTestId,
  labelTestId,
}: DoctorSchedulePeriodNavProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1', className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={cn(
          DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
          DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
        )}
        onClick={onPrev}
        aria-label={prevAriaLabel}
        data-testid={prevTestId}
      >
        <Play className="size-3 rotate-180" fill="currentColor" aria-hidden />
      </Button>
      <Button
        ref={labelRef}
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
          DOCTOR_SCHEDULE_PERIOD_LABEL_CLASS,
          labelClassName,
        )}
        onClick={onLabelClick}
        aria-label={labelAriaLabel}
        data-testid={labelTestId}
      >
        {label}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={cn(
          DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
          DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
        )}
        onClick={onNext}
        aria-label={nextAriaLabel}
        data-testid={nextTestId}
      >
        <Play className="size-3" fill="currentColor" aria-hidden />
      </Button>
    </div>
  );
}
