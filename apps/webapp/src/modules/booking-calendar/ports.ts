import type { CalendarAggregate, CalendarAppointmentEvent, CalendarFilters, CalendarFilterMeta } from "./types";

export type BookingCalendarPort = {
  listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]>;
  listFilterMeta(organizationId: string): Promise<CalendarFilterMeta>;
  resolveSchedulingForSlots(input: {
    organizationId: string;
    specialistId: string;
    branchId: string;
    serviceId: string;
  }): Promise<{ durationMinutes: number; roomId: string | null; branchTimezone: string } | null>;
};

export type BookingCalendarService = {
  getCalendar(filters: CalendarFilters): Promise<CalendarAggregate>;
};
