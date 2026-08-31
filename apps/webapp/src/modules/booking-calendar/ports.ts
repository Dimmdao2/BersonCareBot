import type {
  CalendarAggregate,
  CalendarAppointmentEvent,
  AppointmentFeedFilters,
  AppointmentFeedPage,
  CalendarFilters,
  CalendarFilterMeta,
} from './types';

export type BookingCalendarPort = {
  listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]>;
  listAppointmentFeed(filters: AppointmentFeedFilters): Promise<AppointmentFeedPage>;
  listFilterMeta(organizationId: string): Promise<CalendarFilterMeta>;
};

export type BookingCalendarService = {
  listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]>;
  listAppointmentFeed(filters: AppointmentFeedFilters): Promise<AppointmentFeedPage>;
  getCalendar(filters: CalendarFilters): Promise<CalendarAggregate>;
};
