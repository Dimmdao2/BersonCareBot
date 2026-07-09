/**
 * GET/POST /api/doctor/booking-engine/appointments/:id/comments
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

const postBodySchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: appointmentId } = await context.params;
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return NextResponse.json({ ok: false, error: "invalid_appointment" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 503 });
  }

  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const comments = await deps.clientHistory.listAppointmentComments(orgId, appointmentId);
  return NextResponse.json({ ok: true, comments });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const { id: appointmentId } = await context.params;
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return NextResponse.json({ ok: false, error: "invalid_appointment" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const appt = await ctx.service.getAppointment(appointmentId);
  if (!appt || appt.organizationId !== ctx.organizationId || !appt.platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const platformUserId = appt.platformUserId;
  const authorId = ctx.session.user.userId;
  if (!authorId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const comment = await withDoctorWorkspacePrincipal(ctx, "doctor.booking.appointment-comment.create", () =>
      deps.clientHistory.createAppointmentComment({
        organizationId: ctx.organizationId,
        appointmentId,
        platformUserId,
        authorId,
        body: parsed.data.body,
      }),
    );
    return NextResponse.json({ ok: true, comment });
  } catch (e) {
    if (e instanceof Error && e.message === "empty_comment") {
      return NextResponse.json({ ok: false, error: "empty_comment" }, { status: 400 });
    }
    throw e;
  }
}
