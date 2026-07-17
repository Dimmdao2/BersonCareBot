import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { withPatientOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientEnrollmentOrganizationId } from "../bookingTenant";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const orgId = resolvedOrg.organizationId;
  const [timeline, payments, visits] = await withPatientOrganizationPrincipal(
    { organizationId: orgId, platformUserId: userId, source: "api/booking/history:GET" },
    () =>
      Promise.all([
        deps.clientHistory.listPatientTimeline(orgId, userId, 50),
        deps.clientHistory.listPatientPaymentHistory(orgId, userId, 50),
        deps.clientHistory.listPatientVisitHistory(orgId, userId, 50),
      ]),
  );

  return NextResponse.json({ ok: true, timeline, payments, visits });
}
