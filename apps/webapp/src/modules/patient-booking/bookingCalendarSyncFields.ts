/**
 * D14(5): вебапп решает действие внешнего календаря и пометку в заголовке для события
 * жизненного цикла записи — интегратор их больше не вычисляет по типу события, только применяет
 * присланное. Мэппинг здесь — точная копия того, что раньше вычислял интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`,
 * `trySyncCanonicalBookingToGoogleCalendar`), это перенос поведения, а не новое решение.
 */

export type BookingCalendarAction = 'created' | 'updated' | 'canceled';
export type BookingCalendarTitleMarker = 'none' | 'cancelled' | 'reschedule_pending';

export type BookingCalendarSyncEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.reschedule_requested'
  | 'booking.deleted'
  | 'booking.payment_captured'
  | 'booking.package_linked'
  | 'booking.package_unlinked';

export function resolveBookingCalendarSyncFields(eventType: BookingCalendarSyncEventType): {
  calendarAction: BookingCalendarAction;
  calendarTitleMarker: BookingCalendarTitleMarker;
} {
  const calendarAction: BookingCalendarAction =
    eventType === 'booking.deleted'
      ? 'canceled'
      : eventType === 'booking.created'
        ? 'created'
        : 'updated';
  const calendarTitleMarker: BookingCalendarTitleMarker =
    eventType === 'booking.cancelled'
      ? 'cancelled'
      : eventType === 'booking.reschedule_requested'
        ? 'reschedule_pending'
        : 'none';
  return { calendarAction, calendarTitleMarker };
}
