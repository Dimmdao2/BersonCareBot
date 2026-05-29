import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const detail = await deps.memberships.getPatientPackageDetail(id, organizationId);
  if (!detail || detail.package.platformUserId !== gate.session.user.userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
