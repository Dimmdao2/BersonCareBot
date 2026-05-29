import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const purchaseId = params.get("purchaseId")?.trim();
  const contactPhone = params.get("phone")?.trim();
  if (!purchaseId || !contactPhone) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const phoneNorm = normalizeRuPhoneE164(contactPhone);
  if (!phoneNorm) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }
  const detail = await deps.products.getPurchaseDetail(purchaseId, organizationId);
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
