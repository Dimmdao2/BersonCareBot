import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import {
  PRODUCT_ANALYTICS_HOURLY_RETENTION_DAYS,
  PRODUCT_ANALYTICS_PUSH_RETENTION_DAYS,
  PRODUCT_ANALYTICS_RECENT_RETENTION_DAYS,
  PRODUCT_ANALYTICS_USER_HOURLY_RETENTION_DAYS,
} from '@/modules/product-analytics/productAnalyticsRetention';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_ANALYTICS_JOB_FAMILY,
  OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

function parsePositiveDaysParam(raw: string | null, fallback: number): number | 'invalid' {
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 'invalid';
  return parsed;
}

function parseDryRun(url: URL): boolean {
  return (
    url.searchParams.get('dryRun') === '1' ||
    url.searchParams.get('dry_run') === '1' ||
    url.searchParams.get('dry_run') === 'true'
  );
}

/**
 * HOUSEKEEPING: trims product analytics tables by retention windows.
 *
 * Bearer `INTERNAL_JOB_SECRET`. Query: `recentDays`, `userHourlyDays`, `hourlyDays`, `pushDays`
 * (defaults 90 / 180 / 730 / 730), `dryRun=1` for counts only.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  // INFRA pending owner confirmation: retention deletes old analytics rows across all organizations.
  enterWithDbInfraPrincipal({ source: 'api/internal/product-analytics/retention:POST' });

  const url = new URL(request.url);
  const dryRun = parseDryRun(url);

  const recentDays = parsePositiveDaysParam(
    url.searchParams.get('recentDays'),
    PRODUCT_ANALYTICS_RECENT_RETENTION_DAYS,
  );
  const userHourlyDays = parsePositiveDaysParam(
    url.searchParams.get('userHourlyDays'),
    PRODUCT_ANALYTICS_USER_HOURLY_RETENTION_DAYS,
  );
  const hourlyDays = parsePositiveDaysParam(
    url.searchParams.get('hourlyDays'),
    PRODUCT_ANALYTICS_HOURLY_RETENTION_DAYS,
  );
  const pushDays = parsePositiveDaysParam(
    url.searchParams.get('pushDays'),
    PRODUCT_ANALYTICS_PUSH_RETENTION_DAYS,
  );

  if (
    recentDays === 'invalid' ||
    userHourlyDays === 'invalid' ||
    hourlyDays === 'invalid' ||
    pushDays === 'invalid'
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_days' }, { status: 400 });
  }

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const deps = buildAppDeps();
    const result = await deps.productAnalytics.runRetention({
      dryRun,
      recentDays,
      userHourlyDays,
      hourlyDays,
      pushDays,
    });

    logger.info(
      {
        dryRun: result.dryRun,
        recentDays: result.recentDays,
        userHourlyDays: result.userHourlyDays,
        hourlyDays: result.hourlyDays,
        pushDays: result.pushDays,
        deletedRecent: result.deletedRecent,
        deletedUserHourly: result.deletedUserHourly,
        deletedHourly: result.deletedHourly,
        deletedPushNotifications: result.deletedPushNotifications,
      },
      'product_analytics_retention_job',
    );

    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_ANALYTICS_JOB_FAMILY,
      jobKey: OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: {
        dryRun: result.dryRun,
        deletedRecent: result.deletedRecent,
        deletedUserHourly: result.deletedUserHourly,
        deletedHourly: result.deletedHourly,
        deletedPushNotifications: result.deletedPushNotifications,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_ANALYTICS_JOB_FAMILY,
      jobKey: OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/product-analytics/retention] failed');
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 });
  }
}
