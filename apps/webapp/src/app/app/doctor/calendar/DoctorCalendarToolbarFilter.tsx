'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import {
  calendarCreateFieldLabel,
  resolveCalendarCreateFieldMode,
} from '@/modules/booking-calendar/calendarCreateFieldMode';
import type { CalendarFilterOption } from '@/modules/booking-calendar/types';
import { cn } from '@/lib/utils';

type Props = {
  noneLabel: string;
  options: readonly CalendarFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

function noneValue() {
  return '__none__';
}

/** Фильтр календаря: один вариант в каталоге — только подпись, иначе селект. */
export function DoctorCalendarToolbarFilter({
  noneLabel,
  options,
  value,
  onChange,
  onOpenChange,
  className,
}: Props) {
  const mode = resolveCalendarCreateFieldMode(options, null);
  if (mode === 'hidden') return null;

  if (mode === 'fixed') {
    const label = calendarCreateFieldLabel(options, value ?? options[0]?.id ?? null, noneLabel);
    return (
      <span
        className={cn(
          'doctor-button-radius inline-flex h-8 w-[10rem] min-w-0 items-center border border-border bg-muted/40 px-2 text-xs text-foreground',
          className,
        )}
      >
        <span className="truncate">{label}</span>
      </span>
    );
  }

  const displayLabel = value
    ? (options.find((option) => option.id === value)?.label ?? noneLabel)
    : noneLabel;

  return (
    <Select
      value={value ?? noneValue()}
      onValueChange={(v) => onChange(v === noneValue() ? null : v)}
      onOpenChange={onOpenChange}
    >
      <SelectTrigger className={cn('w-[10rem]', className)} displayLabel={displayLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={noneValue()} label={noneLabel}>
          {noneLabel}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} label={o.label}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
