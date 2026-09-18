import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { CapturedBookingPaymentBindingError } from '@/app-layer/booking/appointmentPaymentConfirmedHandler';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import {
  getCachedResponse,
  isKeyValid,
  setCachedResponse,
} from '@/app-layer/idempotency/idempotencyStore';

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    paymentId: z.string().uuid(),
    appointmentIds: z.array(z.string().uuid()).min(1),
    platformUserId: z.string().uuid().nullable(),
  })
  .strict();

/**
 * The queue contains only the immutable payment fact. Canonical rows, current notification settings,
 * projection repair, and the multi-slot message contract are rebuilt by the existing webapp handler.
 */
export async function POST(request: Request) {
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const idempotencyKey = request.headers.get('x-bersoncare-idempotency-key');
  const rawBody = await request.text();
  if (!timestamp || !signature || !idempotencyKey || !isKeyValid(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: 'invalid_webhook_headers' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || idempotencyKey !== `booking.payment_captured:${parsed.data.paymentId}`) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (
    !enterVerifiedIntegratorOrganizationPrincipal(
      parsed.data.organizationId,
      'integrator-payment-captured',
    )
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_organization' }, { status: 400 });
  }
  const deps = buildAppDeps();
  const handler = deps.appointmentPaymentConfirmed;
  const binding = deps.capturedBookingPaymentBinding;
  if (!handler || !binding) {
    return NextResponse.json(
      { ok: false, error: 'payment_lifecycle_unavailable' },
      { status: 503 },
    );
  }
  try {
    await binding(parsed.data);
  } catch (error) {
    if (error instanceof CapturedBookingPaymentBindingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'payment_lifecycle_failed' }, { status: 503 });
  }
  const requestHash = createHash('sha256').update(rawBody).digest('hex');
  const cached = await getCachedResponse(idempotencyKey, requestHash);
  if (cached.hit && 'mismatch' in cached && cached.mismatch) {
    return NextResponse.json({ ok: false, error: 'idempotency_mismatch' }, { status: 409 });
  }
  if (cached.hit && 'status' in cached)
    return NextResponse.json(cached.body, { status: cached.status });
  try {
    await handler(parsed.data);
    const response = { ok: true };
    await setCachedResponse(idempotencyKey, requestHash, 200, response);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ ok: false, error: 'payment_lifecycle_failed' }, { status: 503 });
  }
}
