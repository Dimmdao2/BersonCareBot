import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET() {
  stampBootstrapPrincipal("api/booking/public/form-fields:GET");
  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.bookingForm) {
    return NextResponse.json({ ok: false, error: "booking_form_unavailable" }, { status: 503 });
  }
  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const fields = await deps.bookingForm.listPatientFields(orgId);
  return NextResponse.json({ ok: true, fields });
}
