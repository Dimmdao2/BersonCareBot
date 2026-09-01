import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { runDomainHealthTick } from '@/app-layer/health/runDomainHealthTick';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_DOMAIN_HEALTH_TICK_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * POST — daily domain/certificate health tick (C5, IMPLEMENTATION_PLAN.md `W5`).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
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
