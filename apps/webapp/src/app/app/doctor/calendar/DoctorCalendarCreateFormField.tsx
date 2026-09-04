'use client';

import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import type { CalendarCreateFieldMode } from '@/modules/booking-calendar/calendarCreateFieldMode';
import type { CalendarFilterOption } from '@/modules/booking-calendar/types';

type Props = {
  fieldLabel: string;
  mode: CalendarCreateFieldMode;
  options: readonly CalendarFilterOption[];
  value: string | null;
  noneLabel: string;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
};

function noneValue() {
  return '__none__';
}

/**
 * Поле каталога в форме записи. У каждого состояния — своя подпись и полная ширина
 * (APPT-FORM-08): выбор, зафиксированное значение и отсутствующий каталог выглядят
 * одинаково по геометрии, отличается только контрол.
 */
export function DoctorCalendarCreateFormField({
  fieldLabel,
  mode,
  options,
  value,
  noneLabel,
  emptyLabel,
  disabled,
  onChange,
}: Props) {
  if (mode === 'hidden') {
    return (
      <div className="flex flex-col gap-1">
        <Label>{fieldLabel}</Label>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const displayLabel = options.find((o) => o.id === value)?.label ?? '—';

  if (mode === 'fixed') {
    return (
      <div className="flex flex-col gap-1">
        <Label>{fieldLabel}</Label>
        <Input readOnly value={displayLabel} aria-label={fieldLabel} className="w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Label>{fieldLabel}</Label>
      <Select
        value={value ?? noneValue()}
        disabled={disabled}
        onValueChange={(v) => onChange(v === noneValue() ? null : v)}
      >
        <SelectTrigger
          className="w-full"
          aria-label={fieldLabel}
          displayLabel={options.find((option) => option.id === value)?.label ?? noneLabel}
        >
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
    </div>
  );
}
