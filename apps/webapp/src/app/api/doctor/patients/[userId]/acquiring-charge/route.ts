/**
 * POST /api/doctor/patients/[userId]/acquiring-charge
 *
 * Doctor-initiated acquiring payment charge for a patient.
 * Requires selected doctor workspace membership.
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

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env } from '@/config/env';
import { routePaths } from '@/app-layer/routes/paths';

const postBodySchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().min(1).max(10).default('RUB'),
  description: z.string().max(1000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { amountMinor, currency, description } = parsed.data;

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'payments');
  if (!entitlement.ok) return entitlement.response;

  const idempotencyHeader = request.headers.get('idempotency-key');
  const idempotencyKey =
    idempotencyHeader === null ? randomUUID() : idempotencyHeader.trim();
  if (!idempotencyKey || idempotencyKey.length > 64) {
    return NextResponse.json(
      { ok: false, error: 'invalid_idempotency_key' },
      { status: 400 },
    );
  }

  // Initiate the charge via the acquiring gateway. This link is handed to the patient (copied or
  // shown as a QR at the counter), so it returns to their own purchases screen, not the doctor's.
  const chargeResult = await deps.acquiringGateway.createCharge({
    patientUserId: identity.userId,
    amountMinor,
    currency,
    idempotencyKey,
    description,
    returnUrl: `${env.APP_BASE_URL}${routePaths.purchases}`,
  });

  if (!chargeResult.ok) {
    return NextResponse.json({ ok: false, reason: chargeResult.reason }, { status: 503 });
  }

  // Determine which provider was used: the default provider from settings.
  // The registryAcquiringGateway always uses defaultProviderId unless overridden via metadata.
  let providerId = 'unknown';
  try {
    if (deps.payments) {
      const settings = await deps.payments.getSettings();
      providerId = settings.defaultProviderId;
    }
  } catch {
    // Non-fatal: record with "unknown" provider; webhook will still match by providerPaymentId.
  }

  // Record the pending payment in the patient ledger.
  const payment = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patients.payments.acquiring.record',
    () =>
      deps.patientPayments.recordAcquiringCharge({
        organizationId: gate.ctx.organizationId,
        patientUserId: identity.userId,
        amountMinor,
        currency,
        description: description ?? null,
        provider: providerId,
        providerPaymentId: chargeResult.providerPaymentId,
        createdBy: gate.ctx.session.user.userId,
      }),
  );

  return NextResponse.json(
    {
      ok: true,
      paymentId: payment.id,
      redirectUrl: chargeResult.redirectUrl ?? null,
    },
    { status: 201 },
  );
}
