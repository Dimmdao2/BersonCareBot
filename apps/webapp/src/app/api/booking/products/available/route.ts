import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
} from "@/modules/patient-booking/inPersonBookingResolve";

async function resolveServiceIdForBooking(
  deps: ReturnType<typeof buildAppDeps>,
  input: { branchId?: string; serviceId?: string; branchServiceId?: string },
): Promise<{ organizationId: string; serviceId: string } | NextResponse> {
  const branchId = input.branchId?.trim() ?? "";
  const serviceId = input.serviceId?.trim() ?? "";
  const branchServiceId = input.branchServiceId?.trim() ?? "";

  if (branchId && serviceId) {
    try {
      const ctx = await resolveInPersonBookingContext(deps, { branchId, serviceId });
      return { organizationId: ctx.organizationId, serviceId };
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
    if (!ctx || !resolved) {
      return NextResponse.json({ ok: false, error: "branch_service_mapping_missing" }, { status: 404 });
    }
    return { organizationId: ctx.organizationId, serviceId: resolved };
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
  const { products } = deps;

  const resolvedOrResponse = await resolveServiceIdForBooking(deps, {
    branchId: params.get("branchId") ?? undefined,
    serviceId: params.get("serviceId") ?? undefined,
    branchServiceId: params.get("branchServiceId") ?? undefined,
  });
  if (resolvedOrResponse instanceof NextResponse) return resolvedOrResponse;

  const purchases = await withExplicitOrganizationPrincipal(
    { organizationId: resolvedOrResponse.organizationId, source: "api/booking/products/available:GET" },
    () =>
      products.listActivePurchasesForBooking(
        gate.session.user.userId,
        resolvedOrResponse.organizationId,
        resolvedOrResponse.serviceId,
      ),
  );
  return NextResponse.json({ ok: true, purchases });
}
