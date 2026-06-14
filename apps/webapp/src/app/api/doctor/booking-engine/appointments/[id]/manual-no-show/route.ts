import { NextResponse } from "next/server";
import { z } from "zod";
import { runStaffManualNoShowAfterCanonical } from "@/app-layer/booking/staffManualNoShow";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

const bodySchema = z.object({
  reason: z.string().trim().max(400).optional(),
  staffComment: z.string().trim().max(1000).optional(),
  /** R21 suppression pattern: false → do not notify patient. Default: true (notify). */
  notifyPatient: z.boolean().optional(),
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
  const result = await deps.bookingAppointmentLifecycle.staffMarkNoShow({
    appointmentId,
    organizationId: gate.ctx.organizationId,
    actorType,
    actorId: gate.ctx.session.user.userId,
    reason: parsed.data.reason,
    staffComment: parsed.data.staffComment,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  const flags = await runStaffManualNoShowAfterCanonical({
    deps,
    organizationId: gate.ctx.organizationId,
    appointmentId,
    appointment: result.appointment,
    notifyPatient: parsed.data.notifyPatient,
  });
  return NextResponse.json({ ok: true, appointment: result.appointment, ...flags });
}
