import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { createScheduledManualPatientVisit } from "@/app-layer/doctor/createScheduledManualPatientVisit";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from "@/app-layer/booking/staffBookingIntegratorEvent";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { requireDoctorBookingEngine } from "../../_requireDoctorBookingEngine";

const bodySchema = z.object({
  displayName: z.string().max(500).nullable().optional(),
  phone: z.string().min(1).max(100),
  email: z.string().max(320).nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
});

function pgCode(error: unknown): { code: string; constraint: string } {
  if (typeof error !== "object" || error === null) return { code: "", constraint: "" };
  const value = error as { code?: unknown; constraint?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : "",
    constraint: typeof value.constraint === "string" ? value.constraint : "",
  };
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { ctx } = gate;
  const deps = buildAppDeps();
  try {
    if (deps.bookingScheduling) {
      await deps.bookingScheduling.assertSlotAvailable({
        organizationId: ctx.organizationId,
        specialistId: parsed.data.specialistId,
        roomId: parsed.data.roomId ?? null,
        slotStart: parsed.data.startAt,
        slotEnd: parsed.data.endAt,
        durationMinutes: parsed.data.durationMinutes,
      });
    }

    const result = await withDoctorWorkspacePrincipal(
      ctx,
      "doctor.booking-engine.appointments.manual-patient-visit",
      () =>
        createScheduledManualPatientVisit(
          {
            organizationId: ctx.organizationId,
            createdByUserId: ctx.session.user.userId,
            displayName: parsed.data.displayName,
            phone: parsed.data.phone,
            email: parsed.data.email,
            appointment: {
              branchId: parsed.data.branchId ?? null,
              roomId: parsed.data.roomId ?? null,
              specialistId: parsed.data.specialistId,
              serviceId: parsed.data.serviceId ?? null,
              startAt: parsed.data.startAt,
              endAt: parsed.data.endAt,
              durationMinutes: parsed.data.durationMinutes,
              source: "admin_manual",
              status: "confirmed",
              actorId: ctx.session.user.userId,
            },
          },
          { bookingEngine: ctx.service, emailSetupAccess: deps.emailSetupAccess },
        ),
    );

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    const bookingRow = deps.patientBooking
      ? await deps.patientBooking.getBookingByCanonicalAppointment(result.appointment.id)
      : null;
    try {
      await createBookingSyncPort().emitBookingEvent({
        eventType: "booking.created",
        idempotencyKey: `staff.booking.created:${result.appointment.id}:${result.appointment.startAt}`,
        payload: {
          organizationId: result.appointment.organizationId,
          bookingId: bookingRow?.id ?? result.appointment.id,
          userId: bookingRow?.userId ?? result.patient.userId,
          rubitimeId: bookingRow?.rubitimeId ?? null,
          bookingType: bookingRow?.bookingType ?? "in_person",
          city: bookingRow?.city ?? undefined,
          category: bookingRow?.category ?? "general",
          slotStart: result.appointment.startAt,
          slotEnd: result.appointment.endAt,
          contactName:
            bookingRow?.contactName ?? staffBookingContactNameFromAppointment(result.appointment),
          contactPhone: bookingRow?.contactPhone ?? result.patient.phoneNormalized,
          contactEmail: bookingRow?.contactEmail ?? undefined,
          branchServiceId: bookingRow?.branchServiceId ?? null,
          cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
          serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(
            result.appointment,
            bookingRow,
          ),
          canonicalAppointmentId: result.appointment.id,
        },
      });
    } catch {
      // Same contract as the existing manual route: lifecycle delivery is best-effort.
    }
    return NextResponse.json({
      ok: true,
      appointment: result.appointment,
      client: {
        id: result.patient.userId,
        displayName: result.patient.displayName,
        phone: result.patient.phoneNormalized,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create_failed";
    const pg = pgCode(error);
    if (message === "slot_overlap" || pg.code === "23P01") {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    if (
      message === "email_conflict" ||
      (pg.code === "23505" && pg.constraint === "uq_platform_users_email_normalized_active")
    ) {
      return NextResponse.json({ ok: false, error: "email_conflict" }, { status: 409 });
    }
    if (message === "identity_conflict" || message === "patient_not_available") {
      return NextResponse.json({ ok: false, error: "patient_not_available" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 400 });
  }
}
