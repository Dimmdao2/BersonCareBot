import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { emitPackageLinkedCalendarSync } from '@/app-layer/booking/emitPackageCalendarSync';
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from '@/app-layer/booking/staffBookingIntegratorEvent';
import { loadAppointmentReminderPlanFromSystemSettings } from '@/modules/booking-notifications/settings';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { requireDoctorBookingEngine } from '../../_requireDoctorBookingEngine';
import { resolveDoctorCreateSpecialist } from '../../_resolveDoctorAppointmentAccess';

const bodySchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  platformUserId: z.string().uuid().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const { ctx } = gate;
  const specialistResolution = await resolveDoctorCreateSpecialist(ctx, parsed.data.specialistId);
  if (!specialistResolution.ok) {
    const status = specialistResolution.error === 'schedule_specialist_not_available' ? 404 : 403;
    return NextResponse.json({ ok: false, error: specialistResolution.error }, { status });
  }
  const deps = buildAppDeps();
  const syncPort = createBookingSyncPort();

  // Staff manual creates are in-person and MUST have a concrete specialist.
  // A NULL specialist_id bypasses the be_appointments_specialist_no_overlap
  // exclusion constraint (it only covers non-null), letting a booking land on
  // any occupied slot. ONLINE patient bookings legitimately use NULL, but they
  // never reach this route. (F2: null-specialist overlap escape.)
  try {
    const appointment = await withDoctorWorkspacePrincipal(
      ctx,
      'doctor.booking-engine.appointments.manual-create',
      async () => {
        const resolvedSpecialistId = specialistResolution.specialistId;
        if (deps.bookingScheduling) {
          await deps.bookingScheduling.assertSlotAvailable({
            organizationId: ctx.organizationId,
            specialistId: resolvedSpecialistId,
            roomId: parsed.data.roomId ?? null,
            slotStart: parsed.data.startAt,
            slotEnd: parsed.data.endAt,
            durationMinutes: parsed.data.durationMinutes,
          });
        }
        if (parsed.data.platformUserId) {
          const isSchedulableClient =
            await deps.patientOrganization?.hasSchedulableClientRelationship(
              parsed.data.platformUserId,
              ctx.organizationId,
            );
          if (!isSchedulableClient) throw new Error('patient_not_available');
        }
        let created = await ctx.service.createAppointment({
          organizationId: ctx.organizationId,
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
        });
        try {
          if (parsed.data.platformUserId && parsed.data.serviceId && deps.memberships) {
            const picked = await deps.memberships.pickAutoPackageForBooking(
              parsed.data.platformUserId,
              ctx.organizationId,
              parsed.data.serviceId,
            );
            if (picked) {
              await deps.memberships.reserveForAppointment({
                organizationId: ctx.organizationId,
                patientPackageId: picked.id,
                serviceId: parsed.data.serviceId,
                appointmentId: created.id,
                platformUserId: parsed.data.platformUserId,
              });
              const fresh = await ctx.service.getAppointment(created.id);
              if (fresh) created = fresh;
              await emitPackageLinkedCalendarSync(syncPort, created);
            }
          }
        } catch {
          // The appointment is already committed; optional package enrichment cannot reverse the API result.
        }
        let bookingRow: Awaited<
          ReturnType<NonNullable<typeof deps.patientBooking>['getBookingByCanonicalAppointment']>
        > = null;
        try {
          bookingRow = deps.patientBooking
            ? await deps.patientBooking.getBookingByCanonicalAppointment(created.id)
            : null;
        } catch {
          // Optional compatibility projection read; the canonical appointment remains authoritative.
        }
        try {
          const reminderPlan = await loadAppointmentReminderPlanFromSystemSettings(
            created.organizationId,
            (key, scope, options) => deps.systemSettings.getSetting(key, scope, options),
          );
          await syncPort.emitBookingEvent({
            eventType: 'booking.created',
            idempotencyKey: `staff.booking.created:${created.id}:${created.startAt}`,
            payload: {
              organizationId: created.organizationId,
              bookingId: bookingRow?.id ?? created.id,
              userId: bookingRow?.userId ?? created.platformUserId ?? created.id,
              bookingType: bookingRow?.bookingType ?? 'in_person',
              city: bookingRow?.city ?? undefined,
              category: bookingRow?.category ?? 'general',
              slotStart: created.startAt,
              slotEnd: created.endAt,
              contactName:
                bookingRow?.contactName ?? staffBookingContactNameFromAppointment(created),
              contactPhone: bookingRow?.contactPhone ?? created.phoneNormalized ?? '+70000000000',
              contactEmail: bookingRow?.contactEmail ?? undefined,
              cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
              serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(created, bookingRow),
              canonicalAppointmentId: created.id,
              reminderPlan,
            },
          });
        } catch {
          // Lifecycle event is best-effort for a committed staff manual create.
        }
        return created;
      },
    );
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
    if (message === 'patient_not_available') {
      return NextResponse.json({ ok: false, error: 'patient_not_available' }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
