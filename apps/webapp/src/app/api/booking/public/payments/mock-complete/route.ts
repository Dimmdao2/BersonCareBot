import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

const bodySchema = z.object({
  intentId: z.string().uuid(),
  bookingId: z.string().uuid(),
  contactPhone: z.string().min(5),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/booking/public/payments/mock-complete:POST");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }

  const organizationId = await deps.payments.resolveIntentOrganizationId(parsed.data.intentId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });
  }
  try {
    const statusResult = await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/public/payments/mock-complete:POST" },
      () => deps.patientBooking.getBookingPaymentStatusForContact(parsed.data.bookingId, parsed.data.contactPhone),
    );
    if (!statusResult.ok) {
      return NextResponse.json({ ok: false, error: statusResult.error }, { status: 403 });
    }
    const row = statusResult.booking;
    if (!row.userId) {
      return NextResponse.json({ ok: false, error: "booking_user_missing" }, { status: 400 });
    }
    await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/public/payments/mock-complete:POST" },
      () =>
        deps.payments!.captureIntentForBooking({
          intentId: parsed.data.intentId,
          organizationId,
          bookingId: parsed.data.bookingId,
          verifyPhone: parsed.data.contactPhone,
          bookingUserId: row.userId,
          bookingContactPhone: row.contactPhone,
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
