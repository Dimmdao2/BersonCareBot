import type { BookingEnginePort } from '@/modules/booking-engine/ports';
import {
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from '@/modules/booking-notifications/settings';
import type { BookingSyncPort, PatientBookingsPort } from '@/modules/patient-booking/ports';
import type { AppointmentReminderPlan } from '@/modules/booking-notifications/settings';

type AppointmentPaymentConfirmedInput = {
  appointmentId: string;
  paymentId: string;
  platformUserId: string | null;
};

export function createAppointmentPaymentConfirmedHandler(deps: {
  patientBookings: Pick<
    PatientBookingsPort,
    'markConfirmedByCanonicalAppointment' | 'getByCanonicalAppointmentId'
  >;
  bookingEngine: Pick<BookingEnginePort, 'getAppointment'>;
  loadNotificationSettings: () => Promise<BookingLifecycleNotificationsSettings>;
  loadReminderPlan: (organizationId: string) => Promise<AppointmentReminderPlan>;
  bookingSync: Pick<BookingSyncPort, 'emitBookingEvent'>;
}) {
  return async (input: AppointmentPaymentConfirmedInput): Promise<void> => {
    const updated = await deps.patientBookings.markConfirmedByCanonicalAppointment(
      input.appointmentId,
    );
    const row =
      updated ?? (await deps.patientBookings.getByCanonicalAppointmentId(input.appointmentId));
    if (!row || row.status !== 'confirmed') return;

    const appointment = await deps.bookingEngine.getAppointment(input.appointmentId);
    if (!appointment) throw new Error('booking_payment_appointment_organization_required');

    const notificationSettings = await deps.loadNotificationSettings();
    const paymentNotify = resolveBookingNotifyTargets(
      'booking.payment_captured',
      { notifyPatient: true, notifyStaff: true },
      notificationSettings,
    );
    if (!paymentNotify.notifyPatient && !paymentNotify.notifyStaff) return;
    const reminderPlan = await deps.loadReminderPlan(appointment.organizationId);

    await deps.bookingSync.emitBookingEvent({
      eventType: 'booking.payment_captured',
      idempotencyKey: `booking.payment_captured:${input.paymentId}:${input.appointmentId}`,
      payload: {
        organizationId: appointment.organizationId,
        bookingId: row.id,
        userId: input.platformUserId ?? row.userId ?? row.id,
        bookingType: row.bookingType,
        city: row.city ?? undefined,
        category: row.category,
        slotStart: row.slotStart,
        slotEnd: row.slotEnd,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail ?? undefined,
        cityCodeSnapshot: row.cityCodeSnapshot,
        serviceTitleSnapshot: row.serviceTitleSnapshot,
        canonicalAppointmentId: input.appointmentId,
        reminderPlan,
      },
    });
  };
}
