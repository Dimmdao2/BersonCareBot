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
  const phone = gate.session.user.phone ?? null;
  if (phone) {
    await deps.products.linkPurchasesForUser(
      gate.session.user.userId,
      phone,
      organizationId,
    );
  }
  const purchases = await deps.products.listPatientPurchases(
    gate.session.user.userId,
    organizationId,
  );
  return NextResponse.json({ ok: true, purchases });
}
