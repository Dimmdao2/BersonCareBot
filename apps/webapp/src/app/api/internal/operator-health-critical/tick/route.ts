import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { runOperatorHealthCriticalTick } from '@/app-layer/health/runOperatorHealthCriticalTick';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * POST — critical health tick (матрица §3 → dispatchOperatorAlert).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/operator-health-critical/tick:POST' });

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const { alerted, keys, integratorApiFailRuns } = await runOperatorHealthCriticalTick();
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      // `integratorApiFailRuns` — память между тиками: один тик видит отказ, письмо уходит только
      // когда следующий видит его снова. Без записи сюда счётчик обнулялся бы каждый раз.
      metaJson: { alerted, keys, integratorApiFailRuns },
    });
    return NextResponse.json({ ok: true, alerted, keys });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ operatorErrorDetail: e }, '[internal/operator-health-critical/tick] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
