import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/app-layer/logging/logger";
import { listInPersonCitiesForOrganization } from "@/modules/patient-booking/inPersonServicesCatalog";
import { resolvePatientEnrollmentOrganizationId } from "../../bookingTenant";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const organizationId = resolvedOrg.organizationId;
  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
  try {
    const cities = await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/catalog/cities:GET" },
      () => listInPersonCitiesForOrganization(deps, organizationId),
    );
    if (!cities) {
      return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, cities }, { status: 200 });
  } catch (err) {
    logger.error({ err }, "[booking/catalog/cities] failed");
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
}
