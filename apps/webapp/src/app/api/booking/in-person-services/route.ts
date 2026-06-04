import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { listInPersonServicesForBranch } from "@/modules/patient-booking/inPersonServicesCatalog";

const QuerySchema = z.object({
  branchId: z.string().uuid(),
});

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ branchId: url.searchParams.get("branchId") });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "booking_engine_unavailable" }, { status: 503 });
  }

  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const result = await listInPersonServicesForBranch(deps, organizationId, parsed.data.branchId);
  if (!result) {
    return NextResponse.json({ ok: false, error: "branch_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    branch: result.branch,
    services: result.services,
  });
}
