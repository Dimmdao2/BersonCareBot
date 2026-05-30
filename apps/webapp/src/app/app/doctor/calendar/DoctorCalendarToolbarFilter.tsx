"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calendarCreateFieldLabel,
  resolveCalendarCreateFieldMode,
} from "@/modules/booking-calendar/calendarCreateFieldMode";
import type { CalendarFilterOption } from "@/modules/booking-calendar/types";

type Props = {
  noneLabel: string;
  options: readonly CalendarFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
};

function noneValue() {
  return "__none__";
}

/** Фильтр календаря: один вариант в каталоге — только подпись, иначе селект. */
export function DoctorCalendarToolbarFilter({ noneLabel, options, value, onChange }: Props) {
  const mode = resolveCalendarCreateFieldMode(options, null);
  if (mode === "hidden") return null;

  if (mode === "fixed") {
    const label = calendarCreateFieldLabel(options, value ?? options[0]?.id ?? null, noneLabel);
    return (
      <span className="inline-flex h-8 w-[10rem] min-w-0 items-center rounded-md border border-border bg-muted/40 px-2 text-xs text-foreground">
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <Select value={value ?? noneValue()} onValueChange={(v) => onChange(v === noneValue() ? null : v)}>
      <SelectTrigger className="w-[10rem]" displayLabel={options.find((o) => o.id === value)?.label ?? noneLabel}>
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
