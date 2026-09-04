'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorMetaTextClass } from '@/shared/ui/doctor/doctorVisual';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

export type DoctorExerciseActivityCalendarDay = {
  date: string;
  completedCount: number;
};

type CalendarState = 'loading' | 'ready' | 'error';
type CalendarMode = 'aggregate' | 'exercise';
type CalendarDayStatus = 'full' | 'partial' | 'missed' | 'no-assign' | 'future';

type CalendarCellData = {
  day: number;
  status: CalendarDayStatus;
  today: boolean;
  ratio?: number;
};

function monthLabelFor(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}

function localDateParts(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function buildCalendarGrid(params: {
  days: DoctorExerciseActivityCalendarDay[];
  year: number;
  month: number;
  mode: CalendarMode;
  todayIso?: string;
}): { firstDayOffset: number; days: CalendarCellData[] } {
  const { days, year, month, mode, todayIso } = params;
  const fallbackToday = new Date();
  const parsedToday = todayIso ? localDateParts(todayIso) : null;
  const todayYear = parsedToday?.year ?? fallbackToday.getFullYear();
  const todayMonth = parsedToday?.month ?? fallbackToday.getMonth() + 1;
  const todayDay = parsedToday?.day ?? fallbackToday.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstJsDay = new Date(year, month - 1, 1).getDay();
  const firstDayOffset = firstJsDay === 0 ? 6 : firstJsDay - 1;
  const viewedMonthIndex = year * 12 + month;
  const currentMonthIndex = todayYear * 12 + todayMonth;
  const completedByDay = new Map<number, number>();

  for (const entry of days) {
    const parts = localDateParts(entry.date);
    if (!parts || parts.year !== year || parts.month !== month) continue;
    completedByDay.set(parts.day, (completedByDay.get(parts.day) ?? 0) + entry.completedCount);
  }

  return {
    firstDayOffset,
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const completedCount = completedByDay.get(day);
      const today = year === todayYear && month === todayMonth && day === todayDay;
      const future =
        viewedMonthIndex > currentMonthIndex ||
        (viewedMonthIndex === currentMonthIndex && day > todayDay);
      let status: CalendarDayStatus;

      if (future) status = 'future';
      else if (mode === 'aggregate' && today) status = 'missed';
      else if (mode === 'exercise' && (completedCount ?? 0) > 0) status = 'full';
      else if (mode === 'exercise') status = 'no-assign';
      else if (completedCount === undefined) status = 'no-assign';
      else if (completedCount >= 3) status = 'full';
      else if (completedCount >= 1) status = 'partial';
      else status = 'missed';

      return {
        day,
        status,
        today,
        ratio: completedCount ? Math.min(completedCount / 3, 1) : undefined,
      };
    }),
  };
}

function CalendarCell({ value }: { value: CalendarCellData }) {
  const statusClass = (() => {
    switch (value.status) {
      case 'full':
        return 'bg-primary font-semibold text-white';
      case 'partial':
        return value.ratio && value.ratio > 0.4
          ? 'bg-[hsl(215_45%_76%)] font-semibold text-white'
          : 'bg-[hsl(215_45%_89%)] text-muted-foreground/90';
      case 'missed':
        return 'border border-border bg-background text-muted-foreground/90';
      case 'future':
        return 'bg-muted/20 text-muted-foreground/90';
      case 'no-assign':
        return 'bg-muted/40 text-muted-foreground/90';
    }
  })();

  return (
    <div
      className={cn(
        'flex h-[26px] items-center justify-center rounded-md text-[10px]',
        statusClass,
        value.today && 'ring-2 ring-[#e8c84a] ring-inset',
      )}
    >
      {value.day}
    </div>
  );
}

export function DoctorExerciseActivityCalendar({
  days,
  year,
  month,
  state = 'ready',
  mode = 'aggregate',
  todayIso,
  disableNext = false,
  onMonthChange,
  className,
}: {
  days: DoctorExerciseActivityCalendarDay[];
  year: number;
  month: number;
  state?: CalendarState;
  mode?: CalendarMode;
  todayIso?: string;
  disableNext?: boolean;
  onMonthChange: (delta: -1 | 1) => void;
  className?: string;
}) {
  const touchStartXRef = useRef<number | null>(null);
  const grid = buildCalendarGrid({ days, year, month, mode, todayIso });

  return (
    <div
      className={className}
      onTouchStart={(event) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartXRef.current;
        touchStartXRef.current = null;
        if (startX == null) return;
        const delta = (event.changedTouches[0]?.clientX ?? 0) - startX;
        if (Math.abs(delta) < 48) return;
        if (delta > 0) onMonthChange(-1);
        if (delta < 0 && !disableNext) onMonthChange(1);
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Предыдущий месяц"
          onClick={() => onMonthChange(-1)}
          className="size-8 p-0 text-muted-foreground"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <span
          className={cn(
            doctorMetaTextClass,
            'flex-1 text-center font-medium capitalize text-foreground',
          )}
        >
          {monthLabelFor(year, month)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Следующий месяц"
          onClick={() => onMonthChange(1)}
          disabled={disableNext}
          className="size-8 p-0 text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {state === 'loading' ? <DoctorPanelLoading className="min-h-24" /> : null}
      {state === 'error' ? (
        <p className={cn(doctorMetaTextClass, 'py-2')}>Данные о выполнении недоступны.</p>
      ) : null}
      {state === 'ready' ? (
        <>
          <div className="mb-0.5 grid grid-cols-7 gap-0.5">
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((day) => (
              <div
                key={day}
                className="flex h-4 items-center justify-center text-[10px] uppercase text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: grid.firstDayOffset }).map((_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {grid.days.map((day) => (
              <CalendarCell key={day.day} value={day} />
            ))}
          </div>
          <div className={cn(doctorMetaTextClass, 'mt-3 flex flex-wrap gap-3')}>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary" />
              {mode === 'exercise' ? 'Выполнено' : 'Полностью'}
            </span>
            {mode === 'aggregate' ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm bg-[hsl(215_45%_76%)]" />
                  Частично
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm border border-border bg-background" />
                  Не выполнено
                </span>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
