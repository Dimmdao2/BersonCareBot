import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isKeyValid } from '@/app-layer/idempotency/idempotencyStore';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('intent'), organizationId: z.string().uuid(), intentId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('sweep'), organizationId: z.string().uuid(), providerId: z.string().min(1).max(100) }).strict(),
]);

const reconciliationErrorCodes = new Set([
  'appointment_payment_reconciliation_provider_list_truncated',
  'appointment_payment_reconciliation_appointment_unbound',
  'appointment_payment_reconciliation_binding_mismatch',
  'appointment_payment_reconciliation_provider_unavailable',
]);

function safeReconciliationErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return reconciliationErrorCodes.has(message)
    ? message
    : 'appointment_payment_reconciliation_provider_failed';
}

/** Every claimed queue row enters its own tenant before config read or canonical settlement. */
export async function POST(request: Request) {
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const idempotencyKey = request.headers.get('x-bersoncare-idempotency-key');
  const rawBody = await request.text();
  if (!timestamp || !signature || !idempotencyKey || !isKeyValid(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: 'invalid webhook headers' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(rawBody) as unknown; } catch { body = null; }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || idempotencyKey !== `appointment-payment-reconciliation:${parsed.data.kind}:${parsed.data.organizationId}:${parsed.data.kind === 'intent' ? parsed.data.intentId : parsed.data.providerId}`) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
  if (!enterVerifiedIntegratorOrganizationPrincipal(parsed.data.organizationId, 'api/integrator/appointment-payment-reconciliation/process:POST')) {
    return NextResponse.json({ ok: false, error: 'invalid organization' }, { status: 400 });
  }
  try {
    const payments = buildAppDeps().payments;
    if (!payments) throw new Error('payments_unavailable');
    const result = parsed.data.kind === 'intent'
      ? await payments.reconcileAppointmentPaymentIntent({ organizationId: parsed.data.organizationId, intentId: parsed.data.intentId })
      : await payments.reconcileAppointmentPaymentSweep({ organizationId: parsed.data.organizationId, providerId: parsed.data.providerId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeReconciliationErrorCode(error) }, { status: 500 });
  }
}
