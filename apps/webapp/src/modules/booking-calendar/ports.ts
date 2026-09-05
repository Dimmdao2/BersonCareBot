import type {
  CalendarAggregate,
  CalendarAppointmentEvent,
  AppointmentFeedFilters,
  AppointmentFeedPage,
  CalendarFilters,
  CalendarFilterMeta,
} from './types';

/**
 * APPT-DETAIL-11: досбор деталей записи, которые календарный репозиторий сформировать не может —
 * сводка оплаты зависит от тарифной механики и платёжного контура. Инъекция держит направление
 * зависимостей: модуль календаря не знает о модуле платежей, композицию делает app-layer.
 */
export type AppointmentDetailHydrator = (
  organizationId: string,
  events: CalendarAppointmentEvent[],
) => Promise<CalendarAppointmentEvent[]>;

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
