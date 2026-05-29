import { NextResponse } from "next/server";
import { z } from "zod";
import { applyStaffRescheduleSideEffects } from "@/app-layer/booking/staffAppointmentLifecycleEffects";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

const bodySchema = z.object({
  newStartAt: z.string().min(1),
  newEndAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  reason: z.string().trim().max(400).optional(),
  staffComment: z.string().trim().max(1000).optional(),
  branchId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingAppointmentLifecycle) {
    return NextResponse.json({ ok: false, error: "lifecycle_unavailable" }, { status: 503 });
  }
  const actorType = gate.ctx.session.user.role === "admin" ? "admin" : "specialist";
  const result = await deps.bookingAppointmentLifecycle.staffReschedule({
    appointmentId,
    organizationId: gate.ctx.organizationId,
    actorType,
    actorId: gate.ctx.session.user.userId,
    newStartAt: parsed.data.newStartAt,
    newEndAt: parsed.data.newEndAt,
    durationMinutes: parsed.data.durationMinutes,
    reason: parsed.data.reason,
    staffComment: parsed.data.staffComment,
    branchId: parsed.data.branchId,
    specialistId: parsed.data.specialistId,
    serviceId: parsed.data.serviceId,
    manualOverride: true,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  await applyStaffRescheduleSideEffects({
    projection: deps.appointmentProjection,
    lifecycle: deps.bookingAppointmentLifecycle,
    organizationId: gate.ctx.organizationId,
    appointment: result.appointment,
    reschedulePolicy: result.reschedulePolicy,
  });
  if (deps.payments) {
    await deps.payments.recordReschedulePaymentCarryOver({
      appointmentId,
      organizationId: gate.ctx.organizationId,
      platformUserId: result.appointment.platformUserId,
      newStartAt: parsed.data.newStartAt,
    });
  }
  return NextResponse.json({ ok: true, appointment: result.appointment });
}
