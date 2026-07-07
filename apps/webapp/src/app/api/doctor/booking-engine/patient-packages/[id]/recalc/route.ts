import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { emitPackageLinkedCalendarSync } from "@/app-layer/booking/emitPackageCalendarSync";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: patientPackageId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  try {
    const summary = await deps.memberships.recalcPastSessionsForPackage({
      organizationId: gate.ctx.organizationId,
      patientPackageId,
      createdByPlatformUserId: gate.ctx.session.user.userId,
    });
    // Best-effort calendar sync for each newly debited appointment
    for (const entry of summary.debited) {
      const appointment = await gate.ctx.service.getAppointment(entry.appointmentId);
      if (appointment) {
        await emitPackageLinkedCalendarSync(createBookingSyncPort(), appointment);
      }
    }
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "recalc_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
