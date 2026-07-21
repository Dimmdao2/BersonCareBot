import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  stampBootstrapPrincipal("api/booking/public/catalog/cities:GET", request);
  return NextResponse.json(
    { ok: false, error: "organization_selection_required" },
    { status: 409 },
  );
}
