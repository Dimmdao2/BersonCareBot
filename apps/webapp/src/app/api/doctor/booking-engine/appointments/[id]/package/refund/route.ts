import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { emitPackageCalendarSync } from "@/app-layer/booking/emitPackageCalendarSync";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { requireDoctorBookingEngine } from "../../../../_requireDoctorBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  try {
    const usage = await deps.memberships.refundConsumedAppointmentPackage({
      organizationId: gate.ctx.organizationId,
      appointmentId,
      createdByPlatformUserId: gate.ctx.session.user.userId,
    });
    const appointment = await gate.ctx.service.getAppointment(appointmentId);
    if (appointment) {
      await emitPackageCalendarSync({
        syncPort: createBookingSyncPort(),
        appointment,
        eventType: "booking.package_unlinked",
      });
    }
    return NextResponse.json({ ok: true, usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "refund_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
