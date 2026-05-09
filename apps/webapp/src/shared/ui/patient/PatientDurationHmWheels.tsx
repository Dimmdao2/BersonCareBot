"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  REMINDER_INTERVAL_WINDOW_MAX_MINUTES,
  REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
  clampIntervalMinutes,
  hourMinuteToInterval,
  intervalToHourMinute,
} from "@/modules/reminders/reminderIntervalBounds";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

export type PatientDurationHmWheelsProps = {
  value: number;
  onChange: (totalMinutes: number) => void;
  disabled?: boolean;
  className?: string;
};

function minuteOptionsForHour(hour: number): number[] {
  if (hour === 0) return Array.from({ length: 30 }, (_, i) => i + 30);
  if (hour === 10) return Array.from({ length: 60 }, (_, i) => i);
  return Array.from({ length: 60 }, (_, i) => i);
}

/**
 * Two side-by-side native selects (mobile often shows scroll-wheel picker).
 * Interval total: {@link REMINDER_INTERVAL_WINDOW_MIN_MINUTES}…{@link REMINDER_INTERVAL_WINDOW_MAX_MINUTES}.
 */
export function PatientDurationHmWheels({ value, onChange, disabled, className }: PatientDurationHmWheelsProps) {
  const baseId = useId();
  const hourId = `${baseId}-h`;
  const minId = `${baseId}-m`;
  const safe = clampIntervalMinutes(value);
  const { hour, minute } = intervalToHourMinute(safe);
  const minuteOpts = minuteOptionsForHour(hour);
  const minuteVal = minuteOpts.includes(minute) ? minute : minuteOpts[0]!;

  const setHour = (nextH: number) => {
    const opts = minuteOptionsForHour(nextH);
    const nextM = opts.includes(minute) ? minute : opts[0]!;
    const t = hourMinuteToInterval(nextH, nextM);
    if (t != null) onChange(t);
  };

  const setMinute = (nextM: number) => {
    const t = hourMinuteToInterval(hour, nextM);
    if (t != null) onChange(t);
  };

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={hourId} className={cn(patientMutedTextClass, "text-xs")}>
          ч
        </Label>
        <select
          id={hourId}
          className={cn(
            "h-11 w-full rounded-md border border-input bg-background px-2 text-center text-base font-medium shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          disabled={disabled}
          value={hour}
          aria-label="Часы интервала"
          onChange={(e) => setHour(Number(e.target.value))}
        >
          {Array.from({ length: 11 }, (_, h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={minId} className={cn(patientMutedTextClass, "text-xs")}>
          мин
        </Label>
        <select
          id={minId}
          className={cn(
            "h-11 w-full rounded-md border border-input bg-background px-2 text-center text-base font-medium shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          disabled={disabled}
          value={minuteVal}
          aria-label="Минуты интервала"
          onChange={(e) => setMinute(Number(e.target.value))}
        >
          {minuteOpts.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
      <p className="sr-only">
        Интервал от {REMINDER_INTERVAL_WINDOW_MIN_MINUTES} до {REMINDER_INTERVAL_WINDOW_MAX_MINUTES} минут
      </p>
    </div>
  );
}
