import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { appointmentReminderPlanForOffsets } from '@/modules/booking-notifications/appointmentReminderSchedule';
import { resolveBookingNotifyTargets } from '@/modules/booking-notifications/settings';
import { resolveBookingCalendarSyncFields } from '@/modules/patient-booking/bookingCalendarSyncFields';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from '@/app-layer/booking/staffBookingIntegratorEvent';
import { buildPatientAwaitingPaymentMessageText } from '@/modules/patient-booking/patientMessageText';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    appointmentId: z.string().uuid(),
    historyId: z.string().uuid().optional(),
    reminderId: z.string().min(1).max(200).optional(),
    generationStartAt: z.string().datetime({ offset: true }).optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    ledgerId: z.string().uuid().optional(),
    paymentHistoryId: z.string().uuid().optional(),
    fact: z.enum([
      'created',
      'awaiting_payment',
      'rescheduled',
      'cancelled',
      'no_show',
      'reminder_due',
      'cash_payment',
      'cash_refund',
      'refund_succeeded',
      'prepayment_retained',
      'visit_completed',
    ]),
  })
  .strict()
  .superRefine((body, ctx) => {
    const historyFact = ['rescheduled', 'cancelled', 'no_show', 'visit_completed'].includes(
      body.fact,
    );
    const reminderFact = body.fact === 'reminder_due';
    const cashFact = body.fact === 'cash_payment' || body.fact === 'cash_refund';
    const paymentHistoryFact =
      body.fact === 'refund_succeeded' || body.fact === 'prepayment_retained';
    if (
      historyFact !== Boolean(body.historyId) ||
      reminderFact !== Boolean(body.reminderId) ||
      reminderFact !== Boolean(body.generationStartAt) ||
      reminderFact !== Boolean(body.dueAt) ||
      cashFact !== Boolean(body.ledgerId) ||
      paymentHistoryFact !== Boolean(body.paymentHistoryId)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fact_identity_mismatch' });
    }
  });

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
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  const input = parsed.data;
  const patientFactOnly = [
    'reminder_due',
    'cash_payment',
    'cash_refund',
    'refund_succeeded',
    'prepayment_retained',
    'visit_completed',
  ].includes(input.fact);
  const occurrenceId =
    input.historyId ??
    input.reminderId ??
    input.ledgerId ??
    input.paymentHistoryId ??
    input.appointmentId;
  if (idempotencyKey !== `booking.lifecycle:${input.fact}:${occurrenceId}`) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (
    !enterVerifiedIntegratorOrganizationPrincipal(
      input.organizationId,
      'integrator-booking-lifecycle',
    )
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_organization' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.patientBooking) {
    return NextResponse.json(
      { ok: false, error: 'booking_lifecycle_unavailable' },
      { status: 503 },
    );
  }
  const [appointment, history] = await Promise.all([
    deps.bookingEngine.getAppointment(input.appointmentId),
    input.historyId
      ? deps.bookingEngine.getAppointmentLifecycleHistory(input.historyId)
      : Promise.resolve(null),
  ]);
  if (!appointment || appointment.organizationId !== input.organizationId) {
    return NextResponse.json(
      { ok: false, error: 'canonical_appointment_missing' },
      { status: 409 },
    );
  }
  if (patientFactOnly && !appointment.platformUserId) {
    return NextResponse.json({ ok: false, error: 'canonical_patient_missing' }, { status: 409 });
  }
  if (
    input.historyId &&
    (!history ||
      history.id !== input.historyId ||
      history.organizationId !== input.organizationId ||
      history.appointmentId !== input.appointmentId ||
      (input.fact === 'visit_completed'
        ? history.eventType !== 'status_changed' ||
          !['completed', 'visit_confirmed'].includes(
            typeof history.payload.toStatus === 'string' ? history.payload.toStatus : '',
          )
        : history.eventType !== input.fact))
  ) {
    return NextResponse.json({ ok: false, error: 'canonical_history_mismatch' }, { status: 409 });
  }

  if (
    input.fact === 'reminder_due' &&
    (!input.generationStartAt ||
      Date.parse(appointment.startAt) !== Date.parse(input.generationStartAt) ||
      !input.dueAt ||
      !input.reminderId?.startsWith(
        `${appointment.id}:${encodeURIComponent(input.generationStartAt)}:${encodeURIComponent(input.dueAt)}:`,
      ))
  ) {
    return NextResponse.json({ ok: false, error: 'canonical_reminder_mismatch' }, { status: 409 });
  }

  const moneyFactKind =
    input.fact === 'cash_payment' ||
    input.fact === 'cash_refund' ||
    input.fact === 'refund_succeeded' ||
    input.fact === 'prepayment_retained'
      ? input.fact
      : null;
  const moneyFactId = moneyFactKind
    ? input.fact === 'cash_payment' || input.fact === 'cash_refund'
      ? input.ledgerId
      : input.paymentHistoryId
    : undefined;
  if (moneyFactKind && !deps.bookingAppointmentLifecycle) {
    return NextResponse.json(
      { ok: false, error: 'booking_lifecycle_unavailable' },
      { status: 503 },
    );
  }
  const moneyFact =
    moneyFactKind && moneyFactId && deps.bookingAppointmentLifecycle
      ? await deps.bookingAppointmentLifecycle.readPatientLifecycleFact(
          moneyFactKind,
          moneyFactId,
          input.organizationId,
        )
      : null;
  if (
    moneyFactKind &&
    (!moneyFactId ||
      !moneyFact ||
      moneyFact.id !== moneyFactId ||
      moneyFact.kind !== moneyFactKind ||
      moneyFact.organizationId !== input.organizationId ||
      moneyFact.appointmentId !== input.appointmentId ||
      moneyFact.platformUserId !== appointment.platformUserId)
  ) {
    return NextResponse.json(
      { ok: false, error: 'canonical_money_fact_mismatch' },
      { status: 409 },
    );
  }
  const booking = await deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId);
  if (
    booking &&
    (booking.canonicalAppointmentId !== appointment.id ||
      booking.userId !== appointment.platformUserId ||
      (booking.organizationId !== null && booking.organizationId !== appointment.organizationId))
  ) {
    return NextResponse.json({ ok: false, error: 'booking_projection_mismatch' }, { status: 409 });
  }

  const slotStart =
    history?.eventType === 'rescheduled' ? history.rescheduledStartAt : appointment.startAt;
  const slotEnd =
    history?.eventType === 'rescheduled' ? history.rescheduledEndAt : appointment.endAt;
  if (!slotStart || !slotEnd) {
    return NextResponse.json({ ok: false, error: 'canonical_occurrence_missing' }, { status: 503 });
  }

  let awaitingPayment:
    { checkoutUrl: string; paymentDeadlineAt: string; patientMessageText: string } | undefined;
  if (input.fact === 'awaiting_payment') {
    if (!deps.payments || !appointment.paymentDeadlineAt) {
      return NextResponse.json({ ok: false, error: 'canonical_payment_missing' }, { status: 503 });
    }
    const links = await deps.payments.listAppointmentCheckoutUrls(input.organizationId, [
      appointment.id,
    ]);
    const checkoutUrl = links
      .find((row) => row.appointmentId === appointment.id)
      ?.checkoutUrl?.trim();
    if (!checkoutUrl) {
      return NextResponse.json({ ok: false, error: 'canonical_payment_missing' }, { status: 503 });
    }
    let paymentTimeZone = await getAppDisplayTimeZone();
    if (appointment.branchId) {
      const branch = await deps.bookingEngine.catalog.getBranch(appointment.branchId);
      if (!branch) {
        return NextResponse.json({ ok: false, error: 'canonical_branch_missing' }, { status: 503 });
      }
      if (branch.organizationId !== input.organizationId) {
        return NextResponse.json(
          { ok: false, error: 'canonical_branch_mismatch' },
          { status: 409 },
        );
      }
      paymentTimeZone = branch.timezone;
    }
    const paymentDeadlineAt = appointment.paymentDeadlineAt;
    awaitingPayment = {
      checkoutUrl,
      paymentDeadlineAt,
      patientMessageText: buildPatientAwaitingPaymentMessageText(
        { checkoutUrl, paymentDeadlineAt },
        paymentTimeZone,
      ),
    };
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
        : input.fact === 'awaiting_payment'
          ? 'booking.awaiting_payment'
          : input.fact === 'reminder_due'
            ? 'booking.reminder_due'
            : input.fact === 'cash_payment'
              ? 'booking.cash_payment'
              : input.fact === 'cash_refund' || input.fact === 'refund_succeeded'
                ? 'booking.refund_succeeded'
                : input.fact === 'prepayment_retained'
                  ? 'booking.prepayment_retained'
                  : input.fact === 'visit_completed'
                    ? 'booking.visit_completed'
                    : 'booking.created';
  const notificationPolicyEventType =
    eventType === 'booking.rescheduled' || eventType === 'booking.cancelled'
      ? eventType
      : 'booking.created';
  const notify = resolveBookingNotifyTargets(
    notificationPolicyEventType,
    { notifyPatient: true, notifyStaff: true },
    notificationSettings,
  );
  const suppressPatientNotification =
    history?.payload.suppressPatientNotification === true || !notify.notifyPatient;
  const calendar = resolveBookingCalendarSyncFields(notificationPolicyEventType);
  try {
    await createBookingSyncPort().emitBookingEvent({
      eventType,
      idempotencyKey,
      payload: {
        organizationId: input.organizationId,
        // Canonical appointment id is stable even when the optional patient projection appears
        // between retries; changing this reference would also change the terminal inbox key.
        bookingId: appointment.id,
        ...(appointment.platformUserId ? { userId: appointment.platformUserId } : {}),
        bookingType: appointment.deliveryFormat,
        city: booking?.city ?? undefined,
        category: booking?.category ?? 'general',
        slotStart,
        slotEnd,
        contactName: booking?.contactName ?? staffBookingContactNameFromAppointment(appointment),
        ...(appointment.phoneNormalized || booking?.contactPhone
          ? { contactPhone: appointment.phoneNormalized ?? booking?.contactPhone }
          : {}),
        contactEmail: booking?.contactEmail ?? undefined,
        cityCodeSnapshot: booking?.cityCodeSnapshot ?? null,
        serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(appointment, booking),
        canonicalAppointmentId: appointment.id,
        occurrenceId,
        ...(awaitingPayment
          ? {
              paymentCheckoutUrl: awaitingPayment.checkoutUrl,
              paymentDeadlineAt: awaitingPayment.paymentDeadlineAt,
              patientMessageText: awaitingPayment.patientMessageText,
            }
          : {}),
        reminderPlan: appointmentReminderPlanForOffsets(
          appointment.appointmentReminderOffsetsMinutes,
        ),
        cancelPendingReminders: eventType === 'booking.cancelled',
        patientPushVariant:
          eventType === 'booking.reminder_due'
            ? 'reminder_due'
            : eventType === 'booking.cash_payment'
              ? 'cash_payment'
              : eventType === 'booking.refund_succeeded'
                ? 'refund_succeeded'
                : eventType === 'booking.prepayment_retained'
                  ? 'prepayment_retained'
                  : eventType === 'booking.visit_completed'
                    ? 'visit_completed'
                    : eventType === 'booking.rescheduled'
                      ? 'rescheduled'
                      : eventType === 'booking.cancelled'
                        ? 'cancelled'
                        : eventType === 'booking.awaiting_payment'
                          ? 'awaiting_payment'
                          : 'created',
        suppressPatientNotification: patientFactOnly ? false : suppressPatientNotification,
        doctorNotify: patientFactOnly ? false : notify.notifyStaff,
        ...calendar,
      },
      waitForDelivery: true,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'booking_lifecycle_failed' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
