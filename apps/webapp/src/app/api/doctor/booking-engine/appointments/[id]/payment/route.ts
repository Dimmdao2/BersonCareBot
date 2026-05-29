import { NextResponse } from "next/server";
import { loadStaffAppointmentPaymentSummary } from "@/app-layer/booking/staffAppointmentPaymentSummary";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }
  const summary = await loadStaffAppointmentPaymentSummary(
    deps,
    appointmentId,
    gate.ctx.organizationId,
  );
  if (!summary) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, summary });
}
