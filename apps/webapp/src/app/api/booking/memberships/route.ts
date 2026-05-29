import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const packages = await deps.memberships.listPatientPackagesForUser(
    gate.session.user.userId,
    organizationId,
  );
  return NextResponse.json({ ok: true, packages });
}
