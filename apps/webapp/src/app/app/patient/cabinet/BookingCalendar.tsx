'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/shared/ui/patient/primitives/badge';
import { Button } from '@/shared/ui/patient/primitives/button';
import { cn } from '@/lib/utils';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';

type Props = {
  availableDates: string[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

type MonthCursor = {
  year: number;
  monthIndex: number;
};

type CalendarDay = {
  date: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
};

function toLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayIsoDate(): string {
  return toLocalIsoDate(new Date());
}

function parseIsoDate(date: string): Date | null {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toMonthCursor(date: string): MonthCursor {
  const d = parseIsoDate(date);
  if (!d) {
    const today = new Date();
    return { year: today.getFullYear(), monthIndex: today.getMonth() };
  }
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
}

function monthKey({ year, monthIndex }: MonthCursor): number {
  return year * 12 + monthIndex;
}

function addMonths({ year, monthIndex }: MonthCursor, delta: number): MonthCursor {
  const d = new Date(Date.UTC(year, monthIndex + delta, 1, 12));
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
}

function buildMonthDays({ year, monthIndex }: MonthCursor): CalendarDay[] {
  const first = new Date(Date.UTC(year, monthIndex, 1, 12));
  const firstWeekdayMondayBased = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, monthIndex, 1 - firstWeekdayMondayBased, 12));
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + index);
    return {
      date: d.toISOString().slice(0, 10),
      dayOfMonth: d.getUTCDate(),
      inCurrentMonth: d.getUTCMonth() === monthIndex,
    };
  });
}

function formatDateLabel(date: string): string {
  const d = parseIsoDate(date);
  if (!d) return date;
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
  });
}

function formatMonthLabel(cursor: MonthCursor): string {
  const d = new Date(Date.UTC(cursor.year, cursor.monthIndex, 1, 12));
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function BookingCalendar({ availableDates, selectedDate, onSelectDate }: Props) {
  const todayIso = getTodayIsoDate();
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const selectableDates = useMemo(
    () => availableDates.filter((date) => date >= todayIso).sort(),
    [availableDates, todayIso],
  );
  const preferredDate = selectedDate ?? selectableDates[0] ?? todayIso;
  const [displayedMonth, setDisplayedMonth] = useState<MonthCursor>(() =>
    toMonthCursor(preferredDate),
  );

  useEffect(() => {
    setDisplayedMonth(toMonthCursor(preferredDate));
  }, [preferredDate]);

  const days = useMemo(() => buildMonthDays(displayedMonth), [displayedMonth]);
  const currentMonthKey = monthKey(displayedMonth);
  const firstSelectableMonthKey = monthKey(toMonthCursor(selectableDates[0] ?? todayIso));
  const hasNextMonthWithSlots = selectableDates.some(
    (date) => monthKey(toMonthCursor(date)) > currentMonthKey,
  );
  const canGoPrev = currentMonthKey > firstSelectableMonthKey;

  if (selectableDates.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Выбор даты</h3>
          <Badge variant="outline">Шаг 4</Badge>
        </div>
        <p className={patientMutedTextClass}>Нет доступных дат для выбранного формата.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Выбор даты</h3>
          <Badge variant="outline">Шаг 4</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoPrev}
            aria-label="Предыдущий месяц"
            onClick={() => setDisplayedMonth((month) => addMonths(month, -1))}
          >
            Назад
          </Button>
          <p className="min-w-[9rem] text-center text-sm font-medium capitalize">
            {formatMonthLabel(displayedMonth)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNextMonthWithSlots}
            aria-label="Следующий месяц"
            onClick={() => setDisplayedMonth((month) => addMonths(month, 1))}
          >
            Вперёд
          </Button>
        </div>
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        role="grid"
        aria-label="Календарь доступных дат записи"
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[11px] font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const isToday = day.date === todayIso;
          const isSelected = day.date === selectedDate;
          const isPast = day.date < todayIso;
          const hasSlots = availableDateSet.has(day.date);
          const disabled = !day.inCurrentMonth || isPast || !hasSlots;
          const ariaLabel = `${formatDateLabel(day.date)}${isToday ? ', сегодня' : ''}${
            hasSlots && !isPast ? ', есть слоты' : ', нет доступных слотов'
          }`;
          return (
            <button
              key={day.date}
              type="button"
              disabled={disabled}
              aria-label={ariaLabel}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(day.date)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
                isSelected
                  ? 'border-[var(--patient-color-primary)] bg-[var(--patient-color-primary)] text-white'
                  : 'border-[var(--patient-border,#d8deef)] bg-[var(--patient-card-bg)] text-[var(--patient-text-main,#111827)]',
                !isSelected && hasSlots && !isPast && day.inCurrentMonth
                  ? 'hover:border-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary-soft)]'
                  : null,
                disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer',
                !day.inCurrentMonth ? 'bg-transparent' : null,
              )}
            >
              <span>{day.dayOfMonth}</span>
              {isToday ? (
                <span
                  className={cn('mt-0.5 text-[10px]', isSelected ? 'text-white' : 'text-primary')}
                >
                  Сегодня
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
