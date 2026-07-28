import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { resolveOrCreateUserByPhone } from "@/app-layer/platform-user/resolveOrCreateUserByPhone";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import { env, isTestEnv } from "@/config/env";
import { isMockPaymentConfirmEnabled } from "@/modules/payments/mockPaymentGatePolicy";

const bodySchema = z.object({
  intentId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  contactPhone: z.string().min(5),
});

export async function POST(request: Request) {
  // H-4 (#818): no-bank test path, unauthenticated route — dev/test only, fails closed elsewhere.
  if (!isMockPaymentConfirmEnabled({ nodeEnv: env.NODE_ENV, isTestEnv })) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  stampBootstrapPrincipal("api/booking/public/products/payments/mock-complete:POST", request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.products.resolvePurchaseOrganizationId(parsed.data.purchaseId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "purchase_not_found" }, { status: 404 });
  }
  const phoneNorm = normalizeRuPhoneE164(parsed.data.contactPhone);
  if (!phoneNorm) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }
  const detail = await withExplicitOrganizationPrincipal(
    { organizationId, source: "api/booking/public/products/payments/mock-complete:read" },
    () => deps.products!.getPurchaseDetail(parsed.data.purchaseId, organizationId),
  );
  if (!detail?.purchase.paymentIntentId || detail.purchase.paymentIntentId !== parsed.data.intentId) {
    return NextResponse.json({ ok: false, error: "purchase_not_found" }, { status: 404 });
  }
  if (detail.purchase.buyerPhoneNormalized && detail.purchase.buyerPhoneNormalized !== phoneNorm) {
    return NextResponse.json({ ok: false, error: "phone_mismatch" }, { status: 403 });
  }
  // Behaviour deliberately UNCHANGED by A-3 (which scopes to `/api/booking/public/create`): this
  // path still mints phone trust from an unauthenticated request. It is the same class of defect
  // and is raised for the owner rather than silently altered here — changing it is a product
  // decision about the public product-purchase flow, not part of this item.
  const resolved = await withExplicitOrganizationPrincipal(
    { organizationId, source: "api/booking/public/products/payments/mock-complete:resolve-user" },
    () =>
      resolveOrCreateUserByPhone(
        parsed.data.contactPhone,
        parsed.data.contactPhone,
        true,
      ),
  );
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
  }
  try {
    await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/public/products/payments/mock-complete:capture" },
      () =>
        deps.products!.captureProductPayment(
          parsed.data.intentId,
          organizationId,
          resolved.userId,
        ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
