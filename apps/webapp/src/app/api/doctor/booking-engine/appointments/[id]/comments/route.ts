/**
 * GET/POST /api/doctor/booking-engine/appointments/:id/comments
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

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

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 503 });
  }

  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const appt = await deps.bookingEngine.getAppointment(appointmentId);
  if (!appt || appt.organizationId !== orgId || !appt.platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const comment = await deps.clientHistory.createAppointmentComment({
      organizationId: orgId,
      appointmentId,
      platformUserId: appt.platformUserId,
      authorId: session.user.userId,
      body: parsed.data.body,
    });
    return NextResponse.json({ ok: true, comment });
  } catch (e) {
    if (e instanceof Error && e.message === "empty_comment") {
      return NextResponse.json({ ok: false, error: "empty_comment" }, { status: 400 });
    }
    throw e;
  }
}
