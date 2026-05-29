import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET() {
  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 503 });
  }

  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const userId = gate.session.user.userId;
  const [timeline, payments, visits] = await Promise.all([
    deps.clientHistory.listTimeline(orgId, userId, 50),
    deps.clientHistory.listPaymentHistory(orgId, userId, 50),
    deps.clientHistory.listVisitHistory(orgId, userId, 50),
  ]);

  return NextResponse.json({ ok: true, timeline, payments, visits });
}
