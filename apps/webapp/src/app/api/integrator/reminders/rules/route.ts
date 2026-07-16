import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { enterVerifiedIntegratorOrganizationPrincipal } from "@/app-layer/principal/integratorOrganizationPrincipal";

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const integratorUserId = url.searchParams.get("integratorUserId")?.trim();
  const organizationId = url.searchParams.get("organizationId")?.trim();
  if (!integratorUserId) {
    return NextResponse.json({ ok: false, error: "integratorUserId required" }, { status: 400 });
  }
  if (!organizationId || !enterVerifiedIntegratorOrganizationPrincipal(organizationId, "integrator-reminder-rules")) {
    return NextResponse.json({ ok: false, error: "valid organizationId required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.patientOrganization) {
    return NextResponse.json({ ok: false, error: "patient organization service unavailable" }, { status: 503 });
  }
  const platformUser = await deps.userProjection.findByIntegratorId(integratorUserId);
  if (
    !platformUser ||
    !(await deps.patientOrganization.hasActiveEnrollment(platformUser.platformUserId, organizationId))
  ) {
    return NextResponse.json({ ok: false, error: "integrator user is outside organization" }, { status: 403 });
  }
  if (!deps.reminderProjection) {
    return NextResponse.json({ ok: false, error: "reminder projection not available" }, { status: 503 });
  }
  const rules = await deps.reminderProjection.listRulesByIntegratorUserId(integratorUserId);
  return NextResponse.json({ ok: true, rules }, { status: 200 });
}
