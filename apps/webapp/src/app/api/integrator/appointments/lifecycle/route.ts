import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { appointmentReminderPlanForOffsets } from '@/modules/booking-notifications/appointmentReminderSchedule';
import { resolveBookingNotifyTargets } from '@/modules/booking-notifications/settings';
import { resolveBookingCalendarSyncFields } from '@/modules/patient-booking/bookingCalendarSyncFields';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    appointmentId: z.string().uuid(),
    historyId: z.string().uuid().optional(),
    fact: z.enum(['created', 'awaiting_payment', 'rescheduled', 'cancelled', 'no_show']),
  })
  .strict();

/**
 * The durable row deliberately carries only an immutable transition identity.  This signed replay
 * re-reads canonical appointment/projection data, then enters the existing lifecycle handler with
 * a synchronous delivery request; a queue row is not acknowledged while `after()` work exists.
 */
export async function POST(request: Request) {
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const idempotencyKey = request.headers.get('x-bersoncare-idempotency-key');
  const rawBody = await request.text();
  if (!timestamp || !signature || !idempotencyKey) {
    return NextResponse.json({ ok: false, error: 'invalid_webhook_headers' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(JSON.parse(rawBody || 'null'));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  const input = parsed.data;
  if (!idempotencyKey.endsWith(`:${input.historyId ?? input.appointmentId}`)) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (!enterVerifiedIntegratorOrganizationPrincipal(input.organizationId, 'integrator-booking-lifecycle')) {
    return NextResponse.json({ ok: false, error: 'invalid_organization' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.patientBooking) {
    return NextResponse.json({ ok: false, error: 'booking_lifecycle_unavailable' }, { status: 503 });
  }
  const appointment = await deps.bookingEngine.getAppointment(input.appointmentId);
  if (!appointment || appointment.organizationId !== input.organizationId) {
    return NextResponse.json({ ok: false, error: 'canonical_appointment_missing' }, { status: 409 });
  }
  const booking = await deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId);
  if (!booking) {
    // Creation can commit before the staff projection is materialized.  Returning a retryable
    // result keeps the durable row alive instead of inventing a second projection writer here.
    return NextResponse.json({ ok: false, error: 'booking_projection_missing' }, { status: 503 });
  }

  const settings = await import('@/modules/booking-notifications/settings');
  const notificationSettings = await settings.loadBookingLifecycleNotificationsFromSystemSettings(
    (key, scope) => deps.systemSettings.getSetting(key, scope),
  );
  const eventType =
    input.fact === 'rescheduled'
      ? 'booking.rescheduled'
      : input.fact === 'cancelled' || input.fact === 'no_show'
        ? 'booking.cancelled'
        : 'booking.created';
  const notify = resolveBookingNotifyTargets(
    eventType,
    { notifyPatient: true, notifyStaff: true },
    notificationSettings,
  );
  const calendar = resolveBookingCalendarSyncFields(eventType);
  try {
    await createBookingSyncPort().emitBookingEvent({
      eventType,
      idempotencyKey,
      payload: {
        organizationId: input.organizationId,
        bookingId: booking.id,
        userId: booking.userId ?? appointment.platformUserId ?? booking.id,
        bookingType: booking.bookingType,
        city: booking.city ?? undefined,
        category: booking.category,
        slotStart: booking.slotStart,
        slotEnd: booking.slotEnd,
        contactName: booking.contactName,
        contactPhone: booking.contactPhone,
        contactEmail: booking.contactEmail ?? undefined,
        cityCodeSnapshot: booking.cityCodeSnapshot,
        serviceTitleSnapshot: booking.serviceTitleSnapshot,
        canonicalAppointmentId: appointment.id,
        reminderPlan: appointmentReminderPlanForOffsets(
          appointment.appointmentReminderOffsetsMinutes,
        ),
        cancelPendingReminders: eventType === 'booking.cancelled',
        patientPushVariant:
          eventType === 'booking.rescheduled'
            ? 'rescheduled'
            : eventType === 'booking.cancelled'
              ? 'cancelled'
              : 'created',
        suppressPatientNotification: !notify.notifyPatient,
        doctorNotify: notify.notifyStaff,
        ...calendar,
      },
      waitForDelivery: true,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'booking_lifecycle_failed' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
