import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  let serviceId = params.get("serviceId")?.trim() ?? "";
  const branchServiceId = params.get("branchServiceId")?.trim() ?? "";
  const deps = buildAppDeps();
  if (!deps.products || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  if (!serviceId && branchServiceId) {
    if (!deps.bookingScheduling) {
      return NextResponse.json({ ok: false, error: "service_id_required" }, { status: 400 });
    }
    const ctx = await deps.bookingScheduling.resolveInPersonContext(branchServiceId);
    serviceId = ctx?.serviceId ?? "";
  }
  if (!serviceId) {
    return NextResponse.json({ ok: false, error: "service_id_required" }, { status: 400 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const purchases = await deps.products.listActivePurchasesForBooking(
    gate.session.user.userId,
    organizationId,
    serviceId,
  );
  return NextResponse.json({ ok: true, purchases });
}
