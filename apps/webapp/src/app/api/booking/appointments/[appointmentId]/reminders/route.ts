import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import {
  appointmentReminderPlanForOffsets,
  isAppointmentReminderSelectionAllowed,
} from '@/modules/booking-notifications/appointmentReminderSchedule';
import { staffBookingContactNameFromAppointment } from '@/app-layer/booking/staffBookingIntegratorEvent';

const bodySchema = z.object({
  offsetsMinutes: z.array(z.number().int().positive()).max(3),
  mutationId: z.string().uuid(),
});

async function loadOwnConfirmedPreference(appointmentId: string) {
  const deps = buildAppDeps();
  const bookingEngine = deps.bookingEngine;
  if (!bookingEngine) return { deps, preference: null };
  const preference = await bookingEngine.getPatientAppointmentReminderPreference(appointmentId);
  if (!preference || !['confirmed', 'rescheduled'].includes(preference.status)) {
    return { deps, preference: null };
  }
  return { deps, preference };
}

export async function GET(_: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { appointmentId } = await params;
  const { preference } = await loadOwnConfirmedPreference(appointmentId);
  if (!preference) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, preference });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }
  const { appointmentId } = await params;
  const { deps, preference } = await loadOwnConfirmedPreference(appointmentId);
  if (
    !preference ||
    !isAppointmentReminderSelectionAllowed(
      preference.availableOffsetsMinutes,
      parsed.data.offsetsMinutes,
    )
  ) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const updated = await deps.bookingEngine?.setPatientAppointmentReminderOffsets({
    appointmentId,
    offsetsMinutes: parsed.data.offsetsMinutes,
  });
  if (!updated) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const appointment = await deps.bookingEngine?.getAppointment(appointmentId);
  if (!appointment || appointment.organizationId !== preference.organizationId) {
    return NextResponse.json({ ok: false, error: 'schedule_sync_failed' }, { status: 503 });
  }
  const booking = await deps.patientBooking
    .getBookingByCanonicalAppointment(appointmentId)
    .catch(() => null);
  try {
    await deps.bookingSync.emitBookingEvent({
      eventType: 'booking.reminder_updated',
      idempotencyKey: `booking.reminder_updated:${booking?.id ?? appointment.id}:${parsed.data.mutationId}`,
      payload: {
        organizationId: preference.organizationId,
        bookingId: booking?.id ?? appointment.id,
        userId: gate.session.user.userId,
        bookingType: booking?.bookingType ?? 'in_person',
        city: booking?.city ?? undefined,
        category: booking?.category ?? 'general',
        slotStart: appointment.startAt,
        slotEnd: appointment.endAt,
        contactName: booking?.contactName ?? staffBookingContactNameFromAppointment(appointment),
        contactPhone: booking?.contactPhone ?? appointment.phoneNormalized ?? '+70000000000',
        contactEmail: booking?.contactEmail ?? undefined,
        canonicalAppointmentId: appointmentId,
        reminderPlan: appointmentReminderPlanForOffsets(parsed.data.offsetsMinutes),
        cancelPendingReminders: true,
      },
      // Ждём НАМЕРЕННО: отказ этого события человек видит как 503 `schedule_sync_failed` ниже.
      // Событие записи ушло с пути запроса (владелец 19.08), но здесь оно ПОТРЕБЛЯЕТСЯ — уберём
      // ожидание, и человек получит «сохранено» там, где напоминания не пересобрались.
      waitForDelivery: true,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'schedule_sync_failed' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
