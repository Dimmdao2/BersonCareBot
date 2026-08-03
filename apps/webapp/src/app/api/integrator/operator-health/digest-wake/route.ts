import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { z } from 'zod';
import { isKeyValid } from '@/app-layer/idempotency/idempotencyStore';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { runOperatorHealthDigestTick } from '@/app-layer/health/runOperatorHealthDigestTick';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY,
  OPERATOR_HEALTH_JOB_FAMILY,
} from '@/modules/operator-health/reconcileJobKeys';

const bodySchema = z.object({ wakeId: z.string().min(1).max(64) }).strict();

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
  if (!parsed.success || idempotencyKey !== `operator-health-digest-wake:${parsed.data.wakeId}`) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
  enterWithDbInfraPrincipal({ source: 'api/integrator/operator-health/digest-wake:POST' });
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  try {
    const result = await runOperatorHealthDigestTick();
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: result,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
