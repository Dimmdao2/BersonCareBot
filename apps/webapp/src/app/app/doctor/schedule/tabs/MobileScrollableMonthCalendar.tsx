'use client';

import type { CalendarOptions } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import { cn } from '@/lib/utils';
import { ScheduleFullCalendarHost } from './ScheduleFullCalendarHost';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

function appointmentLastName(appointment: CalendarAppointmentEvent): string {
  return appointment.patientName?.trim().split(/\s+/)[0] || 'Запись';
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
  events: CalendarOptions['events'];
  onDateClick: (dateKey: string) => void;
  onAppointmentClick: (appointment: CalendarAppointmentEvent) => void;
}) {
  const dayCount = useMemo(() => {
    const start = DateTime.fromISO(rangeStart, { zone: timeZone });
    const end = DateTime.fromISO(rangeEnd, { zone: timeZone });
    return Math.max(7, Math.round(end.diff(start, 'days').days));
  }, [rangeEnd, rangeStart, timeZone]);

  return (
    <div className="doctor-mobile-native-months min-h-full bg-white pb-2">
      <style>{`
        .doctor-mobile-native-months .fc {
          --fc-border-color: color-mix(in srgb, var(--border) 62%, transparent);
          --fc-today-bg-color: transparent;
        }
        .doctor-mobile-native-months .fc-scrollgrid {
          border-inline: 0;
          border-top: 0;
        }
        .doctor-mobile-native-months .fc-daygrid-day-frame {
          min-height: 4.75rem;
        }
        .doctor-mobile-native-months .fc-day-today {
          background: transparent !important;
        }
        .doctor-mobile-native-months .fc-event {
          box-shadow: none !important;
          --fc-event-text-color: var(--foreground) !important;
        }
        .doctor-mobile-native-months .fc-event-main {
          color: var(--foreground) !important;
        }
        .doctor-mobile-native-months .fc-daygrid-day-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.75rem;
          min-height: 1.75rem;
          font-size: 0.6875rem;
          font-weight: 400;
        }
        .doctor-mobile-native-months .fc-today-circle {
          border-radius: 9999px;
          background: rgb(219 113 93 / 85%);
          color: white;
          font-weight: 600;
        }
      `}</style>
      <div className="sticky top-0 z-[3] grid grid-cols-7 border-b border-border/60 bg-white/95 text-center text-[10px] text-muted-foreground backdrop-blur-sm">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="py-1.5">
            {weekday}
          </span>
        ))}
      </div>
      <ScheduleFullCalendarHost
        key={`${rangeStart}:${rangeEnd}`}
        initialView="mobileContinuousMonths"
        views={{
          mobileContinuousMonths: {
            type: 'dayGrid',
            duration: { days: dayCount },
          },
        }}
        initialDate={rangeStart}
        visibleRange={{ start: rangeStart, end: rangeEnd }}
        timeZone={timeZone}
        events={events}
        headerToolbar={false}
        height="auto"
        dayHeaders={false}
        dayMaxEvents
        editable={false}
        selectable={false}
        navLinks={false}
        dateClick={(arg) => onDateClick(arg.dateStr.slice(0, 10))}
        eventClick={(arg) => {
          const appointment = arg.event.extendedProps?.appointment as
            | CalendarAppointmentEvent
            | undefined;
          if (appointment) onAppointmentClick(appointment);
        }}
        dayCellContent={(arg) => {
          const dateKey = DateTime.fromJSDate(arg.date).setZone(timeZone).toISODate();
          const isToday = dateKey === DateTime.now().setZone(timeZone).toISODate();
          return (
            <span className={cn('fc-daygrid-day-number', isToday && 'fc-today-circle')}>
              {arg.date.getDate()}
            </span>
          );
        }}
        eventContent={(info) => {
          const appointment = info.event.extendedProps?.appointment as
            | CalendarAppointmentEvent
            | undefined;
          return (
            <div className="truncate px-1 text-[11px] leading-tight">
              {appointment ? appointmentLastName(appointment) : info.event.title}
            </div>
          );
        }}
      />
    </div>
  );
}
