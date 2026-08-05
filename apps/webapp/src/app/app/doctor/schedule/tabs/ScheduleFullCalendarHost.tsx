'use client';

/**
 * Isolated FullCalendar + plugins chunk for the schedule calendar tab.
 * Imported via next/dynamic so KPI/toolbar can paint before FC parse.
 */
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import ruLocale from '@fullcalendar/core/locales/ru';
import type { ComponentProps, Ref } from 'react';

type FullCalendarProps = ComponentProps<typeof FullCalendar>;

export type ScheduleFullCalendarHostProps = Omit<FullCalendarProps, 'plugins' | 'locale' | 'ref'> & {
  calendarRef?: Ref<InstanceType<typeof FullCalendar>>;
};

export function ScheduleFullCalendarHost({ calendarRef, ...props }: ScheduleFullCalendarHostProps) {
  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
      locale={ruLocale}
      {...props}
    />
  );
}
