import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
} from "@/modules/patient-booking/inPersonBookingResolve";

export async function GET(request: Request) {
  stampBootstrapPrincipal("api/booking/public/form-fields:GET", request);
  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.bookingForm) {
    return NextResponse.json({ ok: false, error: "booking_form_unavailable" }, { status: 503 });
  }
  const params = new URL(request.url).searchParams;
  try {
    const ctx = await resolveInPersonBookingContext(deps, {
      branchServiceId: params.get("branchServiceId"),
      branchId: params.get("branchId"),
      serviceId: params.get("serviceId"),
    });
    const fields = await withExplicitOrganizationPrincipal(
      { organizationId: ctx.organizationId, source: "api/booking/public/form-fields:GET" },
      () => deps.bookingForm!.listPatientFields(ctx.organizationId),
    );
    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ambiguous_booking_tenant";
    if (error instanceof InPersonBookingResolveError) {
      const status = message === "branch_service_mapping_missing" ? 404 : 400;
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
