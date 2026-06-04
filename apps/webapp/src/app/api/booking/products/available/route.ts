import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import {
  InPersonBookingResolveError,
  resolveInPersonBranchServiceId,
} from "@/modules/patient-booking/inPersonBookingResolve";

async function resolveServiceIdForBooking(
  deps: ReturnType<typeof buildAppDeps>,
  input: { branchId?: string; serviceId?: string; branchServiceId?: string },
): Promise<string | NextResponse> {
  const branchId = input.branchId?.trim() ?? "";
  const serviceId = input.serviceId?.trim() ?? "";
  const branchServiceId = input.branchServiceId?.trim() ?? "";

  if (branchId && serviceId) {
    try {
      await resolveInPersonBranchServiceId(deps, { branchId, serviceId });
      return serviceId;
    } catch (err) {
      if (err instanceof InPersonBookingResolveError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
      }
      throw err;
    }
  }

  if (branchServiceId) {
    if (!deps.bookingScheduling) {
      return NextResponse.json({ ok: false, error: "service_id_required" }, { status: 400 });
    }
    const ctx = await deps.bookingScheduling.resolveInPersonContext(branchServiceId);
    const resolved = ctx?.serviceId?.trim() ?? "";
    if (!resolved) {
      return NextResponse.json({ ok: false, error: "branch_service_mapping_missing" }, { status: 404 });
    }
    return resolved;
  }

  return NextResponse.json({ ok: false, error: "service_id_required" }, { status: 400 });
}

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  const deps = buildAppDeps();
  if (!deps.products || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }

  const serviceIdOrResponse = await resolveServiceIdForBooking(deps, {
    branchId: params.get("branchId") ?? undefined,
    serviceId: params.get("serviceId") ?? undefined,
    branchServiceId: params.get("branchServiceId") ?? undefined,
  });
  if (serviceIdOrResponse instanceof NextResponse) return serviceIdOrResponse;

  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const purchases = await deps.products.listActivePurchasesForBooking(
    gate.session.user.userId,
    organizationId,
    serviceIdOrResponse,
  );
  return NextResponse.json({ ok: true, purchases });
}
