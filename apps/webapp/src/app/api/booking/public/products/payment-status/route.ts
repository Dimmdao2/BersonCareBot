import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

export async function GET(request: Request) {
  stampBootstrapPrincipal("api/booking/public/products/payment-status:GET");
  const params = new URL(request.url).searchParams;
  const purchaseId = params.get("purchaseId")?.trim();
  const contactPhone = params.get("phone")?.trim();
  if (!purchaseId || !contactPhone) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.products.resolvePurchaseOrganizationId(purchaseId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "purchase_not_found" }, { status: 404 });
  }
  const phoneNorm = normalizeRuPhoneE164(contactPhone);
  if (!phoneNorm) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }
  const detail = await withExplicitOrganizationPrincipal(
    { organizationId, source: "api/booking/public/products/payment-status:GET" },
    () => deps.products!.getPurchaseDetail(purchaseId, organizationId),
  );
  if (!detail) {
    return NextResponse.json({ ok: false, error: "purchase_not_found" }, { status: 404 });
  }
  const buyerPhone = detail.purchase.buyerPhoneNormalized;
  if (buyerPhone) {
    if (buyerPhone !== phoneNorm) {
      return NextResponse.json({ ok: false, error: "phone_mismatch" }, { status: 403 });
    }
  } else if (!detail.purchase.paymentIntentId) {
    return NextResponse.json({ ok: false, error: "purchase_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    intentId: detail.purchase.paymentIntentId,
    amountMinor: detail.purchase.priceMinor,
    title: detail.purchase.title,
    status: detail.purchase.status,
  });
}
