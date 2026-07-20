import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientEnrollmentOrganizationId } from "../../bookingTenant";

const bodySchema = z.object({
  productId: z.string().uuid(),
  payLinkToken: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.purchases });
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const organizationId = resolvedOrg.organizationId;
  const productOrganizationId = await deps.products.resolveProductOrganizationId(parsed.data.productId);
  if (!productOrganizationId) {
    return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
  }
  if (productOrganizationId !== organizationId) {
    return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
  }
  const userId = gate.session.user.userId;
  const phone = gate.session.user.phone ?? null;
  try {
    const result = await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/products/purchase:POST" },
      async () => {
        if (phone) {
          await deps.products!.linkPurchasesForUser(userId, phone, organizationId);
        }
        return deps.products!.startPurchase({
          organizationId,
          productId: parsed.data.productId,
          platformUserId: userId,
          buyerPhone: phone,
          payLinkToken: parsed.data.payLinkToken ?? null,
        });
      },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "purchase_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
