import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.purchases });
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.products || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const products = await deps.products.listCatalog(organizationId);
  const visible = products.filter((p) => p.showInPatientCatalog);
  return NextResponse.json({ ok: true, products: visible });
}
