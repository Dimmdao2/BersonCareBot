import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  emitPackageLinkedCalendarSync,
  emitStaffCanonicalBookingEvent,
} from "@/app-layer/booking/emitPackageCalendarSync";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { requireDoctorBookingEngine } from "../../_requireDoctorBookingEngine";

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
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const { ctx } = gate;
  const deps = buildAppDeps();
  try {
    if (deps.bookingScheduling) {
      await deps.bookingScheduling.assertSlotAvailable({
        organizationId: ctx.organizationId,
        specialistId: parsed.data.specialistId ?? null,
        roomId: parsed.data.roomId ?? null,
        slotStart: parsed.data.startAt,
        slotEnd: parsed.data.endAt,
        durationMinutes: parsed.data.durationMinutes,
      });
    }
    let appointment = await ctx.service.createAppointment({
      organizationId: ctx.organizationId,
      branchId: parsed.data.branchId ?? null,
      roomId: parsed.data.roomId ?? null,
      specialistId: parsed.data.specialistId ?? null,
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
    const syncPort = createBookingSyncPort();
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
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: "booking.created",
      appointment,
    });
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create_failed";
    if (message === "slot_overlap" || (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01")) {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
