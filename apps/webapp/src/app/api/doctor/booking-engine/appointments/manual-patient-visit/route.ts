import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  createScheduledManualPatientVisit,
  createWalkInManualPatientVisit,
} from '@/app-layer/doctor/createScheduledManualPatientVisit';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from '@/app-layer/booking/staffBookingIntegratorEvent';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { requireDoctorBookingEngine } from '../../_requireDoctorBookingEngine';
import { resolveDoctorCreateSpecialist } from '../../_resolveDoctorAppointmentAccess';

const identitySchema = z.object({
  requestId: z.string().uuid(),
  lastName: z.string().min(1).max(200),
  firstName: z.string().min(1).max(200),
  patronymic: z.string().max(200).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
});

const bodySchema = z.discriminatedUnion('kind', [
  identitySchema
    .extend({
      kind: z.literal('scheduled'),
      branchId: z.string().uuid().nullable().optional(),
      roomId: z.string().uuid().nullable().optional(),
      specialistId: z.string().uuid().nullable().optional(),
      serviceId: z.string().uuid().nullable().optional(),
      startAt: z.string().min(1),
      endAt: z.string().min(1),
      durationMinutes: z.number().int().positive(),
    })
    .strict(),
  identitySchema
    .extend({
      kind: z.literal('walk_in'),
      specialistId: z.string().uuid().nullable().optional(),
      visitedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

function pgCode(error: unknown): { code: string; constraint: string } {
  if (typeof error !== 'object' || error === null) return { code: '', constraint: '' };
  const value = error as { code?: unknown; constraint?: unknown };
  return {
    code: typeof value.code === 'string' ? value.code : '',
    constraint: typeof value.constraint === 'string' ? value.constraint : '',
  };
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const { ctx } = gate;
  const specialistResolution = await resolveDoctorCreateSpecialist(
    ctx,
    parsed.data.specialistId,
  );
  if (!specialistResolution.ok) {
    const status =
      specialistResolution.error === 'schedule_specialist_not_available' ? 404 : 403;
    return NextResponse.json(
      { ok: false, error: specialistResolution.error },
      { status },
    );
  }
  const specialistId = specialistResolution.specialistId;
  const deps = buildAppDeps();
  try {
    const result = await withDoctorWorkspacePrincipal(
      ctx,
      'doctor.booking-engine.appointments.manual-patient-visit',
      async () => {
        if (parsed.data.kind === 'scheduled' && deps.bookingScheduling) {
          const existingCommand = await ctx.service.getAppointment(parsed.data.requestId);
          if (existingCommand?.organizationId !== ctx.organizationId) {
            await deps.bookingScheduling.assertSlotAvailable({
              organizationId: ctx.organizationId,
              specialistId,
              roomId: parsed.data.roomId ?? null,
              slotStart: parsed.data.startAt,
              slotEnd: parsed.data.endAt,
              durationMinutes: parsed.data.durationMinutes,
            });
          }
        }

        const identity = {
          organizationId: ctx.organizationId,
          requestId: parsed.data.requestId,
          createdByUserId: ctx.session.user.userId,
          lastName: parsed.data.lastName,
          firstName: parsed.data.firstName,
          patronymic: parsed.data.patronymic,
          phone: parsed.data.phone,
          email: parsed.data.email,
        };
        const created =
          parsed.data.kind === 'scheduled'
            ? await createScheduledManualPatientVisit(
                {
                  ...identity,
                  appointment: {
                    branchId: parsed.data.branchId ?? null,
                    roomId: parsed.data.roomId ?? null,
                    specialistId,
                    serviceId: parsed.data.serviceId ?? null,
                    startAt: parsed.data.startAt,
                    endAt: parsed.data.endAt,
                    durationMinutes: parsed.data.durationMinutes,
                    source: 'admin_manual',
                    status: 'confirmed',
                    actorId: ctx.session.user.userId,
                  },
                },
                { bookingEngine: ctx.service, emailSetupAccess: deps.emailSetupAccess },
              )
            : await createWalkInManualPatientVisit(
                {
                  ...identity,
                  specialistId,
                  visitedAt: parsed.data.visitedAt,
                },
                { bookingEngine: ctx.service, emailSetupAccess: deps.emailSetupAccess },
              );
        if (!created.ok) return created;

        if (created.kind === 'walk_in') return created;

        let bookingRow: Awaited<
          ReturnType<NonNullable<typeof deps.patientBooking>['getBookingByCanonicalAppointment']>
        > = null;
        try {
          bookingRow = deps.patientBooking
            ? await deps.patientBooking.getBookingByCanonicalAppointment(created.appointment.id)
            : null;
        } catch {
          // The identity/relationship/appointment transaction already committed. Enrichment is optional.
        }
        const contactPhone = bookingRow?.contactPhone ?? created.patient.phoneNormalized;
        if (!created.replayed && contactPhone) {
          try {
            await createBookingSyncPort().emitBookingEvent({
              eventType: 'booking.created',
              idempotencyKey: `staff.booking.created:${created.appointment.id}:${created.appointment.startAt}`,
              payload: {
                organizationId: created.appointment.organizationId,
                bookingId: bookingRow?.id ?? created.appointment.id,
                userId: bookingRow?.userId ?? created.patient.userId,
                bookingType: bookingRow?.bookingType ?? 'in_person',
                city: bookingRow?.city ?? undefined,
                category: bookingRow?.category ?? 'general',
                slotStart: created.appointment.startAt,
                slotEnd: created.appointment.endAt,
                contactName:
                  bookingRow?.contactName ??
                  staffBookingContactNameFromAppointment(created.appointment),
                contactPhone,
                contactEmail: bookingRow?.contactEmail ?? undefined,
                cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
                serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(
                  created.appointment,
                  bookingRow,
                ),
                canonicalAppointmentId: created.appointment.id,
              },
            });
          } catch {
            // Lifecycle delivery is best-effort and cannot turn a committed visit into an API failure.
          }
        }
        return created;
      },
    );

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      appointment: result.appointment,
      clinicalVisitId: result.clinicalVisitId,
      visitKind: result.kind,
      portalStatus: result.portalStatus,
      client: {
        id: result.patient.userId,
        displayName: result.patient.displayName,
        lastName: result.patient.lastName,
        firstName: result.patient.firstName,
        patronymic: result.patient.patronymic,
        phone: result.patient.phoneNormalized,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_failed';
    const pg = pgCode(error);
    if (message === 'slot_overlap' || pg.code === '23P01') {
      return NextResponse.json({ ok: false, error: 'slot_overlap' }, { status: 409 });
    }
    if (message === 'idempotency_conflict') {
      return NextResponse.json({ ok: false, error: 'idempotency_conflict' }, { status: 409 });
    }
    if (message === 'visit_in_future' || message === 'invalid_visit_time') {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    if (
      message === 'email_conflict' ||
      (pg.code === '23505' && pg.constraint === 'uq_platform_users_email_normalized_active')
    ) {
      return NextResponse.json({ ok: false, error: 'email_conflict' }, { status: 409 });
    }
    if (message === 'identity_conflict' || message === 'patient_not_available') {
      return NextResponse.json({ ok: false, error: 'patient_not_available' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'create_failed' }, { status: 400 });
  }
}
