import type { BeAppointment } from '@/modules/booking-engine/types';
import type { BookingSyncPort } from '@/modules/patient-booking/ports';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import type { AppointmentReminderPlan } from '@/modules/booking-notifications/settings';
import {
  buildPatientCancelledMessageText,
  buildPatientCreatedMessageText,
  buildPatientRescheduledMessageText,
} from '@/modules/patient-booking/patientMessageText';
import {
  buildDoctorCancelledMessageText,
  buildDoctorCreatedMessageText,
  buildDoctorRescheduledMessageText,
} from '@/modules/patient-booking/doctorMessageText';
import { resolveBookingCalendarSyncFields } from '@/modules/patient-booking/bookingCalendarSyncFields';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

type StaffBookingEventType = 'booking.created' | 'booking.cancelled' | 'booking.rescheduled';

export function staffBookingContactNameFromAppointment(appt: BeAppointment): string {
  const attr = appt.attributionJson ?? {};
  const name =
    typeof attr.contact_name === 'string'
      ? attr.contact_name
      : typeof attr.contactName === 'string'
        ? attr.contactName
        : null;
  return name?.trim() || 'Пациент';
}

export function staffBookingServiceTitleFromAppointment(
  appt: BeAppointment,
  bookingRow?: PatientBookingRecord | null,
): string | null {
  if (bookingRow?.serviceTitleSnapshot) return bookingRow.serviceTitleSnapshot;
  const attr = appt.attributionJson ?? {};
  const title =
    typeof attr.service_title === 'string'
      ? attr.service_title
      : typeof attr.serviceTitle === 'string'
        ? attr.serviceTitle
        : null;
  return title?.trim() || null;
}

export async function emitStaffCanonicalBookingEvent(opts: {
  syncPort: BookingSyncPort | null | undefined;
  eventType: StaffBookingEventType;
  appointment: BeAppointment;
  bookingRow?: PatientBookingRecord | null;
  /** R21: пробросить подавление пациентского уведомления в интегратор (cancel/no-show-путь). */
  suppressPatientNotification?: boolean;
  /** D14(1): вебапп-решение — отменять ли ожидающие напоминания на этом событии. */
  cancelPendingReminders?: boolean;
  /** D14(2): вебапп-решение — слать ли пуш пациенту и каким вариантом (null — не слать). */
  patientPushVariant?: 'created' | 'cancelled' | 'rescheduled' | null;
  /** D14(4): вебапп-решение — уведомлять ли врача. */
  doctorNotify?: boolean;
  /** D13a(добор): план напоминаний для путей персонала — читается вебаппом из настроек клиники. */
  reminderPlan?: AppointmentReminderPlan;
}): Promise<'sent' | 'skipped'> {
  // R21: if suppression is active, skip the integrator event entirely (patient notification).
  if (opts.suppressPatientNotification) return 'skipped';
  if (!opts.syncPort) return 'skipped';
  const bookingRow = opts.bookingRow ?? null;
  const bookingId = bookingRow?.id ?? opts.appointment.id;
  const userId = bookingRow?.userId ?? opts.appointment.platformUserId ?? opts.appointment.id;
  const contactName =
    bookingRow?.contactName ?? staffBookingContactNameFromAppointment(opts.appointment);
  const contactPhone =
    bookingRow?.contactPhone ?? opts.appointment.phoneNormalized ?? '+70000000000';
  const bookingType = bookingRow?.bookingType ?? 'in_person';
  const city = bookingRow?.city ?? null;
  const cityCodeSnapshot = bookingRow?.cityCodeSnapshot ?? null;
  const slotStart = opts.appointment.startAt;
  const timeZone = await getAppDisplayTimeZone();
  const patientMessageText =
    opts.eventType === 'booking.created'
      ? buildPatientCreatedMessageText({ slotStart, bookingType, city, cityCodeSnapshot }, timeZone)
      : opts.eventType === 'booking.cancelled'
        ? buildPatientCancelledMessageText({ slotStart }, timeZone)
        : buildPatientRescheduledMessageText({ slotStart, bookingType }, timeZone);
  const doctorMessageText =
    opts.eventType === 'booking.created'
      ? buildDoctorCreatedMessageText({ slotStart, contactName, contactPhone }, timeZone)
      : opts.eventType === 'booking.cancelled'
        ? buildDoctorCancelledMessageText({ slotStart, contactName }, timeZone)
        : buildDoctorRescheduledMessageText({ slotStart, contactName, contactPhone }, timeZone);
  try {
    await opts.syncPort.emitBookingEvent({
      eventType: opts.eventType,
      idempotencyKey: `staff.${opts.eventType}:${opts.appointment.id}:${opts.appointment.startAt}`,
      payload: {
        organizationId: opts.appointment.organizationId,
        bookingId,
        userId,
        bookingType: bookingRow?.bookingType ?? 'in_person',
        city: bookingRow?.city ?? undefined,
        category: bookingRow?.category ?? 'general',
        slotStart: opts.appointment.startAt,
        slotEnd: opts.appointment.endAt,
        contactName,
        contactPhone,
        contactEmail: bookingRow?.contactEmail ?? undefined,
        cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
        serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(opts.appointment, bookingRow),
        canonicalAppointmentId: opts.appointment.id,
        ...(opts.reminderPlan ? { reminderPlan: opts.reminderPlan } : {}),
        ...(opts.suppressPatientNotification ? { suppressPatientNotification: true } : {}),
        ...(opts.cancelPendingReminders !== undefined
          ? { cancelPendingReminders: opts.cancelPendingReminders }
          : {}),
        ...(opts.patientPushVariant !== undefined
          ? { patientPushVariant: opts.patientPushVariant }
          : {}),
        patientMessageText,
        ...(opts.doctorNotify !== undefined ? { doctorNotify: opts.doctorNotify } : {}),
        doctorMessageText,
        ...resolveBookingCalendarSyncFields(opts.eventType),
      },
    });
    return 'sent';
  } catch {
    return 'skipped';
  }
}
