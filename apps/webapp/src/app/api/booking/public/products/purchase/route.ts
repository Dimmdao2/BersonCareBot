import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

const bodySchema = z.object({
  productId: z.string().uuid(),
  payLinkToken: z.string().trim().min(1),
  buyerPhone: z.string().trim().min(5),
  buyerName: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/booking/public/products/purchase:POST", request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const link = await deps.products.resolvePayLink(parsed.data.payLinkToken);
  if (!link || link.product.id !== parsed.data.productId) {
    return NextResponse.json({ ok: false, error: "invalid_pay_link" }, { status: 404 });
  }
  const organizationId = link.organizationId;
  try {
    const result = await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/public/products/purchase:POST" },
      () =>
        deps.products!.startPurchase({
          organizationId,
          productId: parsed.data.productId,
          platformUserId: null,
          buyerPhone: parsed.data.buyerPhone,
          buyerName: parsed.data.buyerName ?? parsed.data.buyerPhone,
          payLinkToken: parsed.data.payLinkToken,
        }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "purchase_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
