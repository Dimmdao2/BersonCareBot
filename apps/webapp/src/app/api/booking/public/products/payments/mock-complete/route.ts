import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { resolveOrCreateUserByPhone } from "@/app-layer/platform-user/resolveOrCreateUserByPhone";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

const bodySchema = z.object({
  intentId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  contactPhone: z.string().min(5),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const phoneNorm = normalizeRuPhoneE164(parsed.data.contactPhone);
  if (!phoneNorm) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }
  const detail = await deps.products.getPurchaseDetail(parsed.data.purchaseId, organizationId);
  if (!detail?.purchase.paymentIntentId || detail.purchase.paymentIntentId !== parsed.data.intentId) {
    return NextResponse.json({ ok: false, error: "purchase_not_found" }, { status: 404 });
  }
  if (detail.purchase.buyerPhoneNormalized && detail.purchase.buyerPhoneNormalized !== phoneNorm) {
    return NextResponse.json({ ok: false, error: "phone_mismatch" }, { status: 403 });
  }
  const resolved = await resolveOrCreateUserByPhone(parsed.data.contactPhone, parsed.data.contactPhone);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
  }
  try {
    await deps.products.captureProductPayment(
      parsed.data.intentId,
      organizationId,
      resolved.userId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
