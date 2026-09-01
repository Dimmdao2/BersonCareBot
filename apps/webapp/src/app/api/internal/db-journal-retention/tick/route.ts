import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_DB_JOURNAL_RETENTION_JOB_KEY,
  OPERATOR_MAINTENANCE_JOB_FAMILY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * HOUSEKEEPING: sweeps the still-live journal targets recorded in
 * docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md through the existing
 * `app.prune_retention_target` / `app.prune_context_nonce_ledger` chokepoints — one target list, no
 * dynamic SQL, no per-table prune service.
 *
 * Bearer `INTERNAL_JOB_SECRET`, optional `dryRun=1`. Per-target windows are fixed to the recorded
 * defaults; this route does not expose an override (unlike single-target retention routes) because a
 * tick sweeps every target in one call.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/db-journal-retention/tick:POST' });

  let dryRun = false;
  try {
    const url = new URL(request.url);
    dryRun =
      url.searchParams.get('dryRun') === '1' ||
      url.searchParams.get('dry_run') === '1' ||
      url.searchParams.get('dry_run') === 'true';
  } catch {
    /* ignore */
  }

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const deps = buildAppDeps();
    const result = await deps.dbJournalRetention.runRetention({ dryRun });

    logger.info(
      { dryRun: result.dryRun, results: result.results },
      'db_journal_retention_job',
    );

    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY,
      jobKey: OPERATOR_DB_JOURNAL_RETENTION_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: { dryRun: result.dryRun, results: result.results },
    });

    return NextResponse.json({ ok: true, dryRun: result.dryRun, results: result.results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY,
      jobKey: OPERATOR_DB_JOURNAL_RETENTION_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/db-journal-retention/tick] failed');
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 });
  }
}
