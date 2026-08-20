import type {
  CalendarAggregate,
  CalendarAppointmentEvent,
  CalendarFilters,
  CalendarFilterMeta,
} from './types';

export type BookingCalendarPort = {
  listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]>;
  listFilterMeta(organizationId: string): Promise<CalendarFilterMeta>;
};

export type BookingCalendarService = {
  getCalendar(filters: CalendarFilters): Promise<CalendarAggregate>;
};
