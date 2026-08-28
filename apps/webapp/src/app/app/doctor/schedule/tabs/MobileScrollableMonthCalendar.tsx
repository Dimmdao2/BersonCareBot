'use client';

import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

type MonthModel = {
  key: string;
  title: string;
  days: Array<{ dateKey: string; day: number; inMonth: boolean; isToday: boolean }>;
};

export function MobileScrollableMonthCalendar({
  rangeStart,
  rangeEnd,
  timeZone,
  appointments,
  onDateClick,
  onAppointmentClick,
}: {
  rangeStart: string;
  rangeEnd: string;
  timeZone: string;
  appointments: CalendarAppointmentEvent[];
  onDateClick: (dateKey: string) => void;
  onAppointmentClick: (appointment: CalendarAppointmentEvent) => void;
}) {
  const months = useMemo<MonthModel[]>(() => {
    const result: MonthModel[] = [];
    const today = DateTime.now().setZone(timeZone).toISODate();
    let cursor = DateTime.fromISO(rangeStart, { zone: timeZone }).startOf('month');
    const end = DateTime.fromISO(rangeEnd, { zone: timeZone }).startOf('month');
    while (cursor < end) {
      const monthStart = cursor;
      const gridStart = monthStart.startOf('week');
      const gridEnd = monthStart.endOf('month').endOf('week');
      const days: MonthModel['days'] = [];
      let day = gridStart;
      while (day <= gridEnd) {
        const dateKey = day.toISODate();
        if (dateKey) {
          days.push({
            dateKey,
            day: day.day,
            inMonth: day.month === monthStart.month,
            isToday: dateKey === today,
          });
        }
        day = day.plus({ days: 1 });
      }
      result.push({
        key: monthStart.toFormat('yyyy-MM'),
        title: monthStart.setLocale('ru').toFormat('LLLL yyyy'),
        days,
      });
      cursor = cursor.plus({ months: 1 });
    }
    return result;
  }, [rangeEnd, rangeStart, timeZone]);

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarAppointmentEvent[]>();
    for (const appointment of appointments) {
      const dateKey = DateTime.fromISO(appointment.startAt).setZone(timeZone).toISODate();
      if (!dateKey) continue;
      const current = grouped.get(dateKey);
      if (current) current.push(appointment);
      else grouped.set(dateKey, [appointment]);
    }
    for (const items of grouped.values()) {
      items.sort((left, right) => left.startAt.localeCompare(right.startAt));
    }
    return grouped;
  }, [appointments, timeZone]);

  return (
    <div className="min-h-full bg-white pb-4">
      {months.map((month) => (
        <section key={month.key} data-mobile-calendar-month={month.key}>
          <h2 className="sticky top-0 z-[2] border-y border-border/60 bg-white/95 px-3 py-2 text-sm font-medium capitalize backdrop-blur-sm">
            {month.title}
          </h2>
          <div className="grid grid-cols-7 border-b border-border/60 bg-white text-center text-[10px] text-muted-foreground">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-1.5">
                {weekday}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {month.days.map((day) => {
              const dayAppointments = appointmentsByDate.get(day.dateKey) ?? [];
              return (
                <div
                  key={day.dateKey}
                  data-date={day.dateKey}
                  className={cn(
                    'doctor-mobile-month-day min-h-[76px] min-w-0 border-r border-b border-border/60 bg-white px-0.5 py-1',
                    !day.inMonth && 'bg-muted/20 text-muted-foreground/60',
                  )}
                  onClick={() => onDateClick(day.dateKey)}
                >
                  <span
                    className={cn(
                      'mx-auto mb-1 flex size-6 items-center justify-center text-[11px]',
                      day.isToday && 'rounded-full bg-[#db715d] font-semibold text-white',
                    )}
                  >
                    {day.day}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {dayAppointments.slice(0, 2).map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        className="truncate rounded-[3px] border border-primary/25 bg-primary/10 px-0.5 py-px text-left text-[9px] leading-tight text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAppointmentClick(appointment);
                        }}
                      >
                        {appointment.patientName?.trim() || 'Запись'}
                      </button>
                    ))}
                    {dayAppointments.length > 2 ? (
                      <span className="px-0.5 text-[9px] text-muted-foreground">
                        +{dayAppointments.length - 2}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
