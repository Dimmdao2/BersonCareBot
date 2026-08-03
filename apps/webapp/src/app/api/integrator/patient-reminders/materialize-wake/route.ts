import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isKeyValid } from '@/app-layer/idempotency/idempotencyStore';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { runPatientReminderMaterializationWake } from '@/app-layer/reminders/runPatientReminderMaterializationWake';

const bodySchema = z
  .object({ wakeId: z.string().min(1).max(64), organizationId: z.string().uuid() })
  .strict();

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
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  if (
    !parsed.success ||
    idempotencyKey !==
      `patient-reminder-materialize:${parsed.data.organizationId}:${parsed.data.wakeId}`
  ) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
  if (
    !enterVerifiedIntegratorOrganizationPrincipal(
      parsed.data.organizationId,
      'api/integrator/patient-reminders/materialize-wake:POST',
    )
  ) {
    return NextResponse.json({ ok: false, error: 'invalid organization' }, { status: 400 });
  }
  try {
    const result = await runPatientReminderMaterializationWake(parsed.data.organizationId);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
