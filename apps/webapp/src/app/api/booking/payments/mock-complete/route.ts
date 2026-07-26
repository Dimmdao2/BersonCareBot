import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { env, isTestEnv } from "@/config/env";
import { isMockPaymentConfirmEnabled } from "@/modules/payments/mockPaymentGatePolicy";

const bodySchema = z.object({
  intentId: z.string().uuid(),
});

export async function POST(request: Request) {
  // H-4 (#818): no-bank test path — dev/test only, fails closed everywhere else.
  if (!isMockPaymentConfirmEnabled({ nodeEnv: env.NODE_ENV, isTestEnv })) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

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
    await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/payments/mock-complete:POST" },
      () =>
        deps.payments!.captureIntentForPatient(
          parsed.data.intentId,
          organizationId,
          gate.session.user.userId,
        ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
