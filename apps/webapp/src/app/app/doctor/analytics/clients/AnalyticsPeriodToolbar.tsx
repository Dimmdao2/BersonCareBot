'use client';

import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import type { AdminStatsTimePreset } from '@/modules/admin-platform-stats/types';
import { cn } from '@/lib/utils';
import type { AnalyticsPeriodValue } from './analyticsPeriodUi';

type Props = {
  period: AnalyticsPeriodValue;
  periodLabel: string | null;
  periodError: string | null;
  onPresetChange: (preset: AdminStatsTimePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onApplyCustom: () => void;
  branchPicker?: React.ReactNode;
};

export function AnalyticsPeriodToolbar({
  period,
  periodLabel,
  periodError,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
  branchPicker,
}: Props) {
  return (
    <div id="doctor-analytics-period-toolbar" className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-4 overflow-hidden rounded-lg border border-border bg-white p-0.5">
          {(
            [
              ['day', 'Сутки'],
              ['week', '7 дней'],
              ['month', '30 дней'],
              ['custom', 'Период'],
            ] as const
          ).map(([preset, label]) => {
            const active = period.preset === preset;
            return (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={active}
                className={cn(
                  'h-8 min-w-0 rounded-md px-1 text-xs font-medium shadow-none sm:px-3 sm:text-sm',
                  active &&
                    'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                )}
                onClick={() => onPresetChange(preset)}
              >
                <span className="truncate">{label}</span>
              </Button>
            );
          })}
        </div>
        {branchPicker}
      </div>

      {period.preset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">С</span>
            <DoctorDatePicker
              value={period.customFrom}
              onChange={onCustomFromChange}
              testId="custom-from"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">По</span>
            <DoctorDatePicker
              value={period.customTo}
              onChange={onCustomToChange}
              testId="custom-to"
            />
          </div>
          <Button type="button" size="sm" onClick={onApplyCustom}>
            Показать
          </Button>
        </div>
      ) : null}

      {periodLabel ? (
        <p className="truncate text-sm font-semibold text-foreground">{periodLabel}</p>
      ) : null}

      {periodError ? (
        <p className="text-destructive text-sm" role="alert">
          {periodError}
        </p>
      ) : null}
    </div>
  );
}
