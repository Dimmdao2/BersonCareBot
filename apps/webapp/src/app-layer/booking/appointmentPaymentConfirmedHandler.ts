import type { BookingEnginePort } from '@/modules/booking-engine/ports';
import {
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from '@/modules/booking-notifications/settings';
import type { BookingSyncPort, PatientBookingsPort } from '@/modules/patient-booking/ports';
import { appointmentReminderPlanForPreset } from '@/modules/booking-notifications/appointmentReminderPresets';
import { buildPatientPaymentCapturedMessageText } from '@/modules/patient-booking/patientMessageText';
import { buildDoctorPaymentCapturedMessageText } from '@/modules/patient-booking/doctorMessageText';
import { resolveBookingCalendarSyncFields } from '@/modules/patient-booking/bookingCalendarSyncFields';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';

type AppointmentPaymentConfirmedInput = {
  appointmentIds: readonly string[];
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
    if (confirmed.length === 0) return;

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
    // Правка ведущего: этот выход стоял здесь до S8 и остаётся. Отключённые уведомления гасили
    // событие целиком — вместе с напоминаниями и календарной синхронизацией, которые оно везёт.
    // Это отдельный дефект, и он вынесен владельцу вопросом, а не чинится заодно: S8 обязан
    // изменить ТОЛЬКО количество сообщений, иначе клиника с выключенными уведомлениями внезапно
    // начнёт рассылать напоминания.
    if (!paymentNotify.notifyPatient && !paymentNotify.notifyStaff) return;

    const timeZone = await getAppDisplayTimeZone();
    // Слоты перечисляются в сообщении по времени приёма, а не в порядке, в котором их вернула
    // цепочка: человек читает «вы записаны на …» как расписание.
    const messageAppointments = [...appointments]
      .sort((left, right) => Date.parse(left.row.slotStart) - Date.parse(right.row.slotStart))
      .map(({ row }) => ({
        slotStart: row.slotStart,
        serviceTitle: row.serviceTitleSnapshot ?? row.category,
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
          reminderPlan: appointmentReminderPlanForPreset(appointment.appointmentReminderPresetId),
          ...(carriesPatientMessage
            ? { patientMessageText }
            : { suppressPatientNotification: true }),
          doctorNotify: carriesDoctorMessage,
          ...(carriesDoctorMessage ? { doctorMessageText } : {}),
          ...resolveBookingCalendarSyncFields('booking.payment_captured'),
        },
        // Ждём НАМЕРЕННО: бросок отсюда уходит вызывающему вебхука платежей, и повтор вебхука —
        // единственное, что доигрывает это событие. Отложить его = потерять повтор.
        waitForDelivery: true,
      });
    }
  };
}
