/**
 * POST /api/doctor/patients/[userId]/acquiring-charge
 *
 * Doctor-initiated acquiring payment charge for a patient.
 * Requires an active doctor session.
 *
 * Body: { amountMinor: int>0, currency?: string, description?: string }
 *
 * Flow:
 * 1. Require doctor session.
 * 2. Validate userId (UUID) and request body.
 * 3. Initiate charge via AcquiringGatewayPort.
 * 4. On success, record a pending patient_payment row.
 * 5. Return 201 { ok: true, paymentId, redirectUrl }.
 *
 * The payment status transitions from 'pending' → 'paid'/'failed' via the
 * patient-acquiring-webhook route (FIN-02) when the provider sends a callback.
 *
 * FIN-04
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const postBodySchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().min(1).max(10).default("RUB"),
  description: z.string().max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { amountMinor, currency, description } = parsed.data;

  const deps = buildAppDeps();

  // Initiate the charge via the acquiring gateway.
  const chargeResult = await deps.acquiringGateway.createCharge({
    patientUserId: userId,
    amountMinor,
    currency,
    description,
    metadata: {
      // Provide a generic return URL; front-end can pass a specific one via metadata if needed.
      // Using string concatenation to avoid process.env reference (typed separately per route env).
      returnUrl: undefined,
    },
  });

  if (!chargeResult.ok) {
    return NextResponse.json(
      { ok: false, reason: chargeResult.reason },
      { status: 503 },
    );
  }

  // Determine which provider was used: the default provider from settings.
  // The registryAcquiringGateway always uses defaultProviderId unless overridden via metadata.
  let providerId = "unknown";
  try {
    if (deps.payments) {
      const settings = await deps.payments.getSettings();
      providerId = settings.defaultProviderId;
    }
  } catch {
    // Non-fatal: record with "unknown" provider; webhook will still match by providerPaymentId.
  }

  // Record the pending payment in the patient ledger.
  const payment = await deps.patientPayments.recordAcquiringCharge({
    patientUserId: userId,
    amountMinor,
    currency,
    description: description ?? null,
    provider: providerId,
    providerPaymentId: chargeResult.providerPaymentId,
    createdBy: auth.session.user.userId,
  });

  return NextResponse.json(
    {
      ok: true,
      paymentId: payment.id,
      redirectUrl: chargeResult.redirectUrl ?? null,
    },
    { status: 201 },
  );
}
