import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { runDomainHealthTick } from '@/app-layer/health/runDomainHealthTick';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_DOMAIN_HEALTH_TICK_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * POST — daily domain/certificate health tick (C5, IMPLEMENTATION_PLAN.md `W5`).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  enterWithDbInfraPrincipal({ source: 'api/internal/domain-health/tick:POST' });

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const result = await runDomainHealthTick();
    const success = !result.canonicalResolutionFailed && result.unhealthy === 0;
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_DOMAIN_HEALTH_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success,
      ...(success ? {} : { error: 'domain_health_failed' }),
      metaJson: { ...result },
    });
    return NextResponse.json(
      { ok: success, ...result },
      success ? undefined : { status: 500 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_DOMAIN_HEALTH_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/domain-health/tick] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
