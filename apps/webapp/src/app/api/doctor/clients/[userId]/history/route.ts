/**
 * GET /api/doctor/clients/:userId/history — booking timeline, payments, visits.
 * PATCH не используется; профиль репутации — /booking-profile.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 503 });
  }

  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const [timeline, payments, visits] = await Promise.all([
    deps.clientHistory.listTimeline(orgId, userId),
    deps.clientHistory.listPaymentHistory(orgId, userId),
    deps.clientHistory.listVisitHistory(orgId, userId),
  ]);

  return NextResponse.json({ ok: true, timeline, payments, visits });
}
