import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from '@/app-layer/booking/staffBookingIntegratorEvent';
import { appointmentReminderPlanForPreset } from '@/modules/booking-notifications/appointmentReminderPresets';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { requireAdminBookingEngine } from '../../_requireAdminBookingEngine';

const bodySchema = z.object({
  organizationId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  platformUserId: z.string().uuid().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  title: z.string().optional(),
});

async function resolveDefaultSpecialistId(
  deps: ReturnType<typeof buildAppDeps>,
  organizationId: string,
): Promise<string | null> {
  if (!deps.bookingEngine) return null;
  const specialists = await deps.bookingEngine.catalog.listSpecialists(organizationId);
  const active = specialists.find((item) => item.isActive) ?? specialists[0] ?? null;
  return active?.id ?? null;
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const { ctx } = gate;
  const orgId = parsed.data.organizationId ?? ctx.organizationId;
  const principalCtx = { ...ctx, organizationId: orgId };
  const deps = buildAppDeps();
  const syncPort = createBookingSyncPort();

  // Staff manual creates are in-person and MUST have a concrete specialist.
  // A NULL specialist_id bypasses the be_appointments_specialist_no_overlap
  // exclusion constraint (it only covers non-null), letting a booking land on
  // any occupied slot. ONLINE patient bookings legitimately use NULL, but they
  // never reach this route. (F2: null-specialist overlap escape.)
  const resolvedSpecialistId =
    parsed.data.specialistId ?? (await resolveDefaultSpecialistId(deps, orgId));
  if (!resolvedSpecialistId) {
    return NextResponse.json({ ok: false, error: 'specialist_required' }, { status: 400 });
  }

  try {
    if (deps.bookingScheduling) {
      await deps.bookingScheduling.assertSlotAvailable({
        organizationId: orgId,
        specialistId: resolvedSpecialistId,
        roomId: parsed.data.roomId ?? null,
        slotStart: parsed.data.startAt,
        slotEnd: parsed.data.endAt,
        durationMinutes: parsed.data.durationMinutes,
      });
    }
    const appointment = await withDoctorWorkspacePrincipal(
      principalCtx,
      'admin.booking-engine.appointments.manual-create',
      async () => {
        const reminderSettings = await ctx.service.getSpecialistAppointmentReminderSettings({
          organizationId: orgId,
          specialistId: resolvedSpecialistId,
        });
        return ctx.service.createAppointment({
          organizationId: orgId,
          branchId: parsed.data.branchId ?? null,
          roomId: parsed.data.roomId ?? null,
          specialistId: resolvedSpecialistId,
          serviceId: parsed.data.serviceId ?? null,
          platformUserId: parsed.data.platformUserId ?? null,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          durationMinutes: parsed.data.durationMinutes,
          source: 'admin_manual',
          status: 'confirmed',
          phoneNormalized: parsed.data.phoneNormalized ?? null,
          actorId: ctx.session.user.userId,
          appointmentReminderAllowedPresetIds: reminderSettings?.allowedPresetIds ?? [],
          appointmentReminderPresetId: reminderSettings?.defaultPresetId ?? null,
        });
      },
    );

    const bookingRow = deps.patientBooking
      ? await deps.patientBooking.getBookingByCanonicalAppointment(appointment.id)
      : null;
    try {
      const reminderPlan = appointmentReminderPlanForPreset(
        appointment.appointmentReminderPresetId,
      );
      await syncPort.emitBookingEvent({
        eventType: 'booking.created',
        idempotencyKey: `staff.booking.created:${appointment.id}:${appointment.startAt}`,
        payload: {
          organizationId: appointment.organizationId,
          bookingId: bookingRow?.id ?? appointment.id,
          userId: bookingRow?.userId ?? appointment.platformUserId ?? appointment.id,
          bookingType: bookingRow?.bookingType ?? 'in_person',
          city: bookingRow?.city ?? undefined,
          category: bookingRow?.category ?? 'general',
          slotStart: appointment.startAt,
          slotEnd: appointment.endAt,
          contactName:
            bookingRow?.contactName ?? staffBookingContactNameFromAppointment(appointment),
          contactPhone: bookingRow?.contactPhone ?? appointment.phoneNormalized ?? '+70000000000',
          contactEmail: bookingRow?.contactEmail ?? undefined,
          cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
          serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(appointment, bookingRow),
          canonicalAppointmentId: appointment.id,
          reminderPlan,
        },
      });
    } catch {
      // Lifecycle event is best-effort.
    }
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed';
    if (
      message === 'slot_overlap' ||
      (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23P01')
    ) {
      return NextResponse.json({ ok: false, error: 'slot_overlap' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
