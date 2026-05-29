import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  intentId: z.string().uuid(),
});

export async function POST(request: Request) {
  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.payments || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }

  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  try {
    await deps.payments.captureIntentForPatient(
      parsed.data.intentId,
      organizationId,
      gate.session.user.userId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
