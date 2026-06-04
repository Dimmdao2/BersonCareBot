"use client";

import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import type { CalendarCreateFieldMode } from "@/modules/booking-calendar/calendarCreateFieldMode";
import type { CalendarFilterOption } from "@/modules/booking-calendar/types";

type Props = {
  fieldLabel: string;
  mode: CalendarCreateFieldMode;
  options: readonly CalendarFilterOption[];
  value: string | null;
  noneLabel: string;
  onChange: (value: string | null) => void;
};

function noneValue() {
  return "__none__";
}

export function DoctorCalendarCreateFormField({
  fieldLabel,
  mode,
  options,
  value,
  noneLabel,
  onChange,
}: Props) {
  if (mode === "hidden") return null;

  const displayLabel = options.find((o) => o.id === value)?.label ?? "—";

  if (mode === "fixed") {
    return (
      <div className="space-y-1">
        <Label>{fieldLabel}</Label>
        <Input readOnly value={displayLabel} aria-label={fieldLabel} />
      </div>
    );
  }

  return (
    <Select
      value={value ?? noneValue()}
      onValueChange={(v) => onChange(v === noneValue() ? null : v)}
    >
      <SelectTrigger displayLabel={options.find((o) => o.id === value)?.label ?? noneLabel}>
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
