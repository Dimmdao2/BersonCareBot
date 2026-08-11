'use client';

import 'react-day-picker/style.css';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { DateTime } from 'luxon';
import { CalendarDays } from 'lucide-react';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/doctor/primitives/popover';
import { cn } from '@/lib/utils';

/**
 * Shared canonical date-only picker (react-day-picker, no time input).
 * value/onChange — строка "yyyy-MM-dd".
 * max — максимально допустимая дата (строка "yyyy-MM-dd"), например сегодня.
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  /** Максимальная допустимая дата (включительно), формат "yyyy-MM-dd". */
  max?: string;
};

export function DoctorDatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'Выберите дату',
  testId,
  id,
  ariaLabel,
  className,
  max,
}: Props) {
  const [open, setOpen] = useState(false);
  const dt = value ? DateTime.fromISO(value) : null;
  const selectedDate = dt?.isValid ? dt.toJSDate() : undefined;
  const label = dt?.isValid ? dt.setLocale('ru').toFormat('d MMMM yyyy') : placeholder;
  const maxDate = max ? DateTime.fromISO(max).toJSDate() : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        data-testid={testId}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'default' }),
          'w-full justify-start gap-2 font-normal',
          !dt?.isValid && 'text-muted-foreground',
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
          onSelect={(d) => {
            if (!d) return;
            onChange(DateTime.fromJSDate(d).toFormat('yyyy-MM-dd'));
            setOpen(false);
          }}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
