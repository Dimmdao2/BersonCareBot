'use client';

import type { EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

function appointmentLastName(appointment: CalendarAppointmentEvent): string {
  return appointment.patientName?.trim().split(/\s+/)[0] || 'Запись';
}

function eventDateKey(start: EventInput['start'], timeZone: string): string | null {
  if (typeof start === 'string') return DateTime.fromISO(start, { zone: timeZone }).toISODate();
  if (start instanceof Date) return DateTime.fromJSDate(start).setZone(timeZone).toISODate();
  return null;
}

export function MobileScrollableMonthCalendar({
  rangeStart,
  rangeEnd,
  timeZone,
  events,
  onDateClick,
  onAppointmentClick,
}: {
  rangeStart: string;
  rangeEnd: string;
  timeZone: string;
  events: EventInput[];
  onDateClick: (dateKey: string) => void;
  onAppointmentClick: (appointment: CalendarAppointmentEvent) => void;
}) {
  const days = useMemo(() => {
    const start = DateTime.fromISO(rangeStart, { zone: timeZone }).startOf('week');
    const exclusiveEnd = DateTime.fromISO(rangeEnd, { zone: timeZone })
      .minus({ days: 1 })
      .endOf('week')
      .plus({ days: 1 })
      .startOf('day');
    const count = Math.max(7, Math.round(exclusiveEnd.diff(start, 'days').days));
    return Array.from({ length: count }, (_, index) => start.plus({ days: index }));
  }, [rangeEnd, rangeStart, timeZone]);

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarAppointmentEvent[]>();
    for (const event of events) {
      const appointment = event.extendedProps?.appointment as
        | CalendarAppointmentEvent
        | undefined;
      const dateKey = eventDateKey(event.start, timeZone);
      if (!appointment || !dateKey) continue;
      const appointments = grouped.get(dateKey) ?? [];
      appointments.push(appointment);
      grouped.set(dateKey, appointments);
    }
    return grouped;
  }, [events, timeZone]);

  const today = DateTime.now().setZone(timeZone).toISODate();

  return (
    <div className="doctor-mobile-native-months min-h-full bg-white pb-2">
      <div className="sticky top-0 z-[3] grid grid-cols-7 border-b border-border/60 bg-white/95 text-center text-[10px] text-muted-foreground backdrop-blur-sm">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="py-1.5">
            {weekday}
          </span>
        ))}
      </div>
      <div className="mobile-continuous-calendar grid grid-cols-7">
        {days.map((day, index) => {
          const dateKey = day.toISODate();
          if (!dateKey) return null;
          const appointments = appointmentsByDate.get(dateKey) ?? [];
          return (
            <div
              key={dateKey}
              className={cn(
                'fc-daygrid-day relative min-h-[4.75rem] min-w-0 border-b border-r border-border/60 bg-white p-1',
                index % 7 === 6 && 'border-r-0',
              )}
              data-date={dateKey}
            >
              <button
                type="button"
                className="absolute inset-0 z-0"
                aria-label={day.setLocale('ru').toFormat('d LLLL yyyy')}
                onClick={() => onDateClick(dateKey)}
              />
              <div className="pointer-events-none relative z-[1] flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    'inline-flex size-7 items-center justify-center self-end text-[11px] leading-none',
                    dateKey === today && 'rounded-full bg-[#db715d] font-semibold text-white',
                  )}
                >
                  {day.day}
                </span>
                {appointments.slice(0, 3).map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    className="pointer-events-auto min-w-0 truncate rounded-sm bg-primary/15 px-1 py-0.5 text-left text-[10px] leading-tight text-foreground"
                    onClick={() => onAppointmentClick(appointment)}
                  >
                    {appointmentLastName(appointment)}
                  </button>
                ))}
                {appointments.length > 3 ? (
                  <span className="truncate px-1 text-[10px] text-muted-foreground">
                    +{appointments.length - 3}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
