import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.bookingAppointmentLifecycle) {
    return NextResponse.json({ ok: false, error: "lifecycle_unavailable" }, { status: 503 });
  }
  const [reschedules, cancellations] = await Promise.all([
    deps.bookingAppointmentLifecycle.listReschedules(appointmentId, gate.ctx.organizationId),
    deps.bookingAppointmentLifecycle.listCancellations(appointmentId, gate.ctx.organizationId),
  ]);
  return NextResponse.json({ ok: true, reschedules, cancellations });
}
