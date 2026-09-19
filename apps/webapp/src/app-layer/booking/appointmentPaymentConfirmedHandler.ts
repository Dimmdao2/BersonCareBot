import type { BookingEnginePort } from '@/modules/booking-engine/ports';
import type { PaymentsPort } from '@/modules/payments/ports';
import {
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from '@/modules/booking-notifications/settings';
import type { BookingSyncPort, PatientBookingsPort } from '@/modules/patient-booking/ports';
import { appointmentReminderPlanForOffsets } from '@/modules/booking-notifications/appointmentReminderSchedule';
import { buildPatientPaymentCapturedMessageText } from '@/modules/patient-booking/patientMessageText';
import { buildDoctorPaymentCapturedMessageText } from '@/modules/patient-booking/doctorMessageText';
import { resolveBookingCalendarSyncFields } from '@/modules/patient-booking/bookingCalendarSyncFields';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { bookingServiceTitleForMessage } from '@/modules/patient-booking/bookingCategoryLabels';

type AppointmentPaymentConfirmedInput = {
  /** Present only on the signed durable M2M path; direct lifecycle callers keep their existing shape. */
  organizationId?: string;
  appointmentIds: readonly string[];
  paymentId: string;
  platformUserId: string | null;
};

export class CapturedBookingPaymentBindingError extends Error {
  constructor() {
    super('captured_booking_payment_binding_invalid');
  }
}

/**
 * The signed M2M transport authenticates its caller, not the identifiers in a durable payload.
 * Re-read the payment root under the tenant principal before any projection side effect.
 */
export function createCapturedBookingPaymentBindingValidator(deps: {
  payments: Pick<PaymentsPort, 'findPaymentById' | 'countAppointmentsByPaymentRef'>;
  bookingEngine: Pick<BookingEnginePort, 'getAppointment'>;
}) {
  return async (input: AppointmentPaymentConfirmedInput): Promise<void> => {
    if (!input.organizationId) throw new CapturedBookingPaymentBindingError();
    const organizationId = input.organizationId;
    const appointmentIds = new Set(input.appointmentIds);
    if (appointmentIds.size !== input.appointmentIds.length) {
      throw new CapturedBookingPaymentBindingError();
    }

    const payment = await deps.payments.findPaymentById(input.paymentId, organizationId);
    if (
      !payment ||
      payment.organizationId !== organizationId ||
      payment.appointmentId === null ||
      !appointmentIds.has(payment.appointmentId)
    ) {
      throw new CapturedBookingPaymentBindingError();
    }

    const appointments = await Promise.all(
      input.appointmentIds.map((appointmentId) => deps.bookingEngine.getAppointment(appointmentId)),
    );
    if (
      appointments.some(
        (appointment) =>
          !appointment ||
          appointment.organizationId !== organizationId ||
          appointment.paymentRef !== input.paymentId ||
          appointment.platformUserId !== input.platformUserId,
      )
    ) {
      throw new CapturedBookingPaymentBindingError();
    }

    const paymentAppointmentCount = await deps.payments.countAppointmentsByPaymentRef(
      input.paymentId,
      organizationId,
    );
    if (paymentAppointmentCount !== input.appointmentIds.length) {
      throw new CapturedBookingPaymentBindingError();
    }
  };
}

export function createAppointmentPaymentConfirmedHandler(deps: {
  patientBookings: Pick<
    PatientBookingsPort,
    'markConfirmedByCanonicalAppointment' | 'getByCanonicalAppointmentId'
  >;
  bookingEngine: Pick<BookingEnginePort, 'getAppointment'>;
  loadNotificationSettings: () => Promise<BookingLifecycleNotificationsSettings>;
  bookingSync: Pick<BookingSyncPort, 'emitBookingEvent'>;
}) {
  return async (input: AppointmentPaymentConfirmedInput): Promise<void> => {
    const confirmed: Array<{ appointmentId: string; row: PatientBookingRecord }> = [];
    for (const appointmentId of input.appointmentIds) {
      const updated = await deps.patientBookings.markConfirmedByCanonicalAppointment(appointmentId);
      const row =
        updated ?? (await deps.patientBookings.getByCanonicalAppointmentId(appointmentId));
      if (row?.status === 'confirmed') confirmed.push({ appointmentId, row });
    }
    if (confirmed.length !== input.appointmentIds.length) {
      throw new Error('booking_payment_projection_incomplete');
    }

    const appointments = await Promise.all(
      confirmed.map(async ({ appointmentId, row }) => {
        const appointment = await deps.bookingEngine.getAppointment(appointmentId);
        if (!appointment) throw new Error('booking_payment_appointment_organization_required');
        return { appointmentId, row, appointment };
      }),
    );

    const notificationSettings = await deps.loadNotificationSettings();
    const paymentNotify = resolveBookingNotifyTargets(
      'booking.payment_captured',
      { notifyPatient: true, notifyStaff: true },
      notificationSettings,
    );
    const timeZone = await getAppDisplayTimeZone();
    // Слоты перечисляются в сообщении по времени приёма, а не в порядке, в котором их вернула
    // цепочка: человек читает «вы записаны на …» как расписание.
    const messageAppointments = [...appointments]
      .sort((left, right) => Date.parse(left.row.slotStart) - Date.parse(right.row.slotStart))
      .map(({ row }) => ({
        slotStart: row.slotStart,
        // F3 независимого аудита: здесь стоял `?? row.category`, и в письмо уезжал внутренний
        // ключ — пациент читал «rehab_lfk» вместо «Реабилитация (ЛФК)». У онлайн-записи снимка
        // услуги нет по построению (`canonicalCreate.ts` кладёт null), так что это не редкий край.
        serviceTitle: bookingServiceTitleForMessage(row),
      }));
    const patientMessageText = buildPatientPaymentCapturedMessageText(
      { appointments: messageAppointments },
      timeZone,
    );
    const doctorMessageText = buildDoctorPaymentCapturedMessageText(
      { appointments: messageAppointments, contactName: appointments[0]!.row.contactName },
      timeZone,
    );

    for (const [index, { appointmentId, row, appointment }] of appointments.entries()) {
      const carriesPatientMessage = index === 0 && paymentNotify.notifyPatient;
      const carriesDoctorMessage = index === 0 && paymentNotify.notifyStaff;
      await deps.bookingSync.emitBookingEvent({
        eventType: 'booking.payment_captured',
        idempotencyKey: `booking.payment_captured:${input.paymentId}:${appointmentId}`,
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
          canonicalAppointmentId: appointmentId,
          reminderPlan: appointmentReminderPlanForOffsets(
            appointment.appointmentReminderOffsetsMinutes,
          ),
          ...(carriesPatientMessage
            ? { patientMessageText }
            : { suppressPatientNotification: true }),
          // One provider payment is one patient-visible feed fact even when it covers several
          // appointments. Later slot events still carry their independent calendar/reminder work.
          ...(index === 0 ? {} : { patientPushVariant: null }),
          doctorNotify: carriesDoctorMessage,
          ...(carriesDoctorMessage ? { doctorMessageText } : {}),
          ...resolveBookingCalendarSyncFields('booking.payment_captured'),
        },
        // Delivery preference only controls the two external message legs. Calendar and reminder
        // materialisation remain lifecycle effects, so no clinic preference may suppress them.
        // The lifecycle receiver owns independent step deduplication and retries.
      });
    }
  };
}
