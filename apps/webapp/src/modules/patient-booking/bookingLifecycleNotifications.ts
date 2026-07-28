export type IntegratorBookingEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.payment_captured';

import {
  parseBookingLifecycleNotificationsSettings,
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from '@/modules/booking-notifications/settings';

export { parseBookingLifecycleNotificationsSettings, resolveBookingNotifyTargets };
export type { BookingLifecycleNotificationsSettings };

export function buildBookingNotificationsSent(input: {
  eventType: IntegratorBookingEventType;
  idempotencyKey: string;
  notifyPatient: boolean;
  notifyStaff: boolean;
  integratorStatus: 'sent' | 'failed' | 'skipped';
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    policy: {
      notifyPatient: input.notifyPatient,
      notifyStaff: input.notifyStaff,
    },
    integrator_booking_event: {
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      status: input.integratorStatus,
      at: new Date().toISOString(),
    },
  };
  return out;
}
