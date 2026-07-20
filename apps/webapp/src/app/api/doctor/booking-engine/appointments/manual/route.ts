import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import {
  emitPackageLinkedCalendarSync,
} from "@/app-layer/booking/emitPackageCalendarSync";
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from "@/app-layer/booking/staffBookingIntegratorEvent";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import {
  requireDoctorBookingEngine,
  type DoctorBookingEngineContext,
} from "../../_requireDoctorBookingEngine";

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

async function resolveDefaultSpecialistId(ctx: DoctorBookingEngineContext): Promise<string | null> {
  const specialists = await ctx.service.catalog.listSpecialists(ctx.organizationId);
  const active = specialists.find((item) => item.isActive) ?? specialists[0] ?? null;
  return active?.id ?? null;
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
  const syncPort = createBookingSyncPort();

  // Staff manual creates are in-person and MUST have a concrete specialist.
  // A NULL specialist_id bypasses the be_appointments_specialist_no_overlap
  // exclusion constraint (it only covers non-null), letting a booking land on
  // any occupied slot. ONLINE patient bookings legitimately use NULL, but they
  // never reach this route. (F2: null-specialist overlap escape.)
  const resolvedSpecialistId =
    parsed.data.specialistId ?? (await resolveDefaultSpecialistId(ctx));
  if (!resolvedSpecialistId) {
    return NextResponse.json({ ok: false, error: "specialist_required" }, { status: 400 });
  }

  try {
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
    let appointment = await withDoctorWorkspacePrincipal(ctx, "doctor.booking-engine.appointments.manual-create", async () => {
      if (parsed.data.platformUserId) {
        const isSchedulableClient =
          await deps.patientOrganization?.hasSchedulableClientRelationship(
          parsed.data.platformUserId,
          ctx.organizationId,
        );
        if (!isSchedulableClient) throw new Error("patient_not_available");
      }
      return ctx.service.createAppointment({
        organizationId: ctx.organizationId,
        branchId: parsed.data.branchId ?? null,
        roomId: parsed.data.roomId ?? null,
        specialistId: resolvedSpecialistId,
        serviceId: parsed.data.serviceId ?? null,
        platformUserId: parsed.data.platformUserId ?? null,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        durationMinutes: parsed.data.durationMinutes,
        source: "admin_manual",
        status: "confirmed",
        phoneNormalized: parsed.data.phoneNormalized ?? null,
        actorId: ctx.session.user.userId,
      });
    });

    if (
      parsed.data.platformUserId &&
      parsed.data.serviceId &&
      deps.memberships
    ) {
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
          appointmentId: appointment.id,
          platformUserId: parsed.data.platformUserId,
        });
        const fresh = await ctx.service.getAppointment(appointment.id);
        if (fresh) appointment = fresh;
        await emitPackageLinkedCalendarSync(syncPort, appointment);
      }
    }
    const bookingRow = deps.patientBooking
      ? await deps.patientBooking.getBookingByCanonicalAppointment(appointment.id)
      : null;
    try {
      await syncPort.emitBookingEvent({
        eventType: "booking.created",
        idempotencyKey: `staff.booking.created:${appointment.id}:${appointment.startAt}`,
        payload: {
          organizationId: appointment.organizationId,
          bookingId: bookingRow?.id ?? appointment.id,
          userId: bookingRow?.userId ?? appointment.platformUserId ?? appointment.id,
          rubitimeId: bookingRow?.rubitimeId ?? null,
          bookingType: bookingRow?.bookingType ?? "in_person",
          city: bookingRow?.city ?? undefined,
          category: bookingRow?.category ?? "general",
          slotStart: appointment.startAt,
          slotEnd: appointment.endAt,
          contactName: bookingRow?.contactName ?? staffBookingContactNameFromAppointment(appointment),
          contactPhone: bookingRow?.contactPhone ?? appointment.phoneNormalized ?? "+70000000000",
          contactEmail: bookingRow?.contactEmail ?? undefined,
          branchServiceId: bookingRow?.branchServiceId ?? null,
          cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
          serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(appointment, bookingRow),
          canonicalAppointmentId: appointment.id,
        },
      });
    } catch {
      // Lifecycle event is best-effort for staff manual create.
    }
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create_failed";
    if (message === "slot_overlap" || (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01")) {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    if (message === "patient_not_available") {
      return NextResponse.json({ ok: false, error: "patient_not_available" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
