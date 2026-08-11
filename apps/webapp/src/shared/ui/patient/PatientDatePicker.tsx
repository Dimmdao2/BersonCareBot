'use client';

import 'react-day-picker/style.css';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { DateTime } from 'luxon';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/shared/ui/patient/primitives/button-variants';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/patient/primitives/popover';

type PatientDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  max?: string;
};

/** Patient-zone date-only picker. value/onChange use the yyyy-MM-dd format. */
export function PatientDatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'Выберите дату',
  id,
  ariaLabel,
  className,
  max,
}: PatientDatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = value ? DateTime.fromISO(value) : null;
  const selectedDate = date?.isValid ? date.toJSDate() : undefined;
  const label = date?.isValid ? date.setLocale('ru').toFormat('d MMMM yyyy') : placeholder;
  const maxDate = max ? DateTime.fromISO(max).toJSDate() : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'default' }),
          'w-full justify-start gap-2 font-normal',
          !date?.isValid && 'text-muted-foreground',
          className,
        )}
      >
        <CalendarDays className="size-4 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        style={{ ['--rdp-accent-color' as string]: 'var(--primary)' }}
      >
        <DayPicker
          mode="single"
          locale={ru}
          weekStartsOn={1}
          selected={selectedDate}
          defaultMonth={selectedDate}
          disabled={maxDate ? { after: maxDate } : undefined}
          onSelect={(nextDate) => {
            if (!nextDate) return;
            onChange(DateTime.fromJSDate(nextDate).toFormat('yyyy-MM-dd'));
            setOpen(false);
          }}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
