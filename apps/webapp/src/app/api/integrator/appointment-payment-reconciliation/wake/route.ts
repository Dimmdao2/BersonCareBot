import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { z } from 'zod';
import { isKeyValid } from '@/app-layer/idempotency/idempotencyStore';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const bodySchema = z.object({ wakeId: z.string().min(1).max(64) }).strict();

/** Resident scheduler wake: materializes work only, never reaches a payment provider itself. */
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
  const parsed = bodySchema.safeParse(JSON.parse(rawBody) as unknown);
  if (!parsed.success || idempotencyKey !== `appointment-payment-reconciliation-wake:${parsed.data.wakeId}`) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
  enterWithDbInfraPrincipal({ source: 'api/integrator/appointment-payment-reconciliation/wake:POST' });
  try {
    const payments = buildAppDeps().payments;
    if (!payments) throw new Error('payments_unavailable');
    const result = await payments.materializeAppointmentPaymentReconciliation({
      wakeId: parsed.data.wakeId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
