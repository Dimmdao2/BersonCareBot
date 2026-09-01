import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import {
  MEDIA_HLS_PROXY_ERROR_RETENTION_DAYS_DEFAULT,
  purgeStaleMediaHlsProxyErrorEvents,
} from '@/app-layer/media/hlsProxyErrorEvents';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY,
  OPERATOR_MEDIA_JOB_FAMILY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * HOUSEKEEPING: trims `media_hls_proxy_error_events` older than retention window.
 *
 * Bearer `INTERNAL_JOB_SECRET`, optional `dryRun=1`, `days=` (default **90**, minimum **1**).
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/media-hls-proxy-errors/retention:POST' });

  let dryRun = false;
  let retentionDays = MEDIA_HLS_PROXY_ERROR_RETENTION_DAYS_DEFAULT;
  try {
    const url = new URL(request.url);
    dryRun =
      url.searchParams.get('dryRun') === '1' ||
      url.searchParams.get('dry_run') === '1' ||
      url.searchParams.get('dry_run') === 'true';
    const daysRaw = url.searchParams.get('days');
    if (daysRaw != null && daysRaw.trim() !== '') {
      const parsed = Number.parseInt(daysRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json({ ok: false, error: 'invalid_days' }, { status: 400 });
      }
      retentionDays = parsed;
    }
  } catch {
    /* ignore */
  }

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const result = await purgeStaleMediaHlsProxyErrorEvents({
      dryRun,
      retentionDays,
    });

    logger.info(
      { dryRun: result.dryRun, deleted: result.deleted, retentionDays: result.retentionDays },
      'media_hls_proxy_error_events_retention_job',
    );

    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: {
        dryRun: result.dryRun,
        deleted: result.deleted,
        retentionDays: result.retentionDays,
      },
    });

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      dryRun: result.dryRun,
      retentionDays: result.retentionDays,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/media-hls-proxy-errors/retention] failed');
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 });
  }
}
