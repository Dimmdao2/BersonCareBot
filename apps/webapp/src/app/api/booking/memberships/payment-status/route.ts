import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const patientPackageId = new URL(request.url).searchParams.get("patientPackageId")?.trim();
  if (!patientPackageId) {
    return NextResponse.json({ ok: false, error: "patient_package_id_required" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const pkg = await deps.memberships.getPatientPackageDetail(patientPackageId, organizationId);
  if (!pkg || pkg.package.platformUserId !== gate.session.user.userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    patientPackageId,
    status: pkg.package.status,
    intentId: pkg.package.paymentIntentId,
    priceMinor: pkg.package.priceMinor,
    currency: pkg.package.currency,
    package: pkg.package,
  });
}
