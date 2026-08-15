import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { classifyIntegratorPushOutboxSystemHealthStatus } from '@/modules/operator-health/integratorPushOutboxHealth';
import { WEBHOOK_ERROR_EVENTS_RETENTION_HOURS } from '@/modules/operator-health/webhookBurst';
import { loadCuratedSystemHealthSnapshot } from '@/infra/repos/pgCuratedSystemHealthDiagnostics';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';

async function purgeIntegrationWebhookErrorEventsBestEffort(): Promise<void> {
  try {
    const purge =
      await buildAppDeps().operatorHealthWrite.purgeIntegrationWebhookErrorEventsOlderThanHours(
        WEBHOOK_ERROR_EVENTS_RETENTION_HOURS,
      );
    if (purge.deleted > 0) {
      logger.info(
        { deleted: purge.deleted, retentionHours: WEBHOOK_ERROR_EVENTS_RETENTION_HOURS },
        '[system-health-guard] integration_webhook_error_events ttl purge',
      );
    }
  } catch (e) {
    logger.warn({ err: e }, '[system-health-guard] integration_webhook_error_events_purge_failed');
  }
}

async function purgeHealthFailureArchiveTtlBestEffort(): Promise<void> {
  try {
    const purge = await runWithDbInfraPrincipal(
      { source: 'operator-health-failure-archive:prune' },
      () => buildAppDeps().healthFailureArchive.purgeExpired(),
    );
    if (purge.deleted > 0) {
      logger.info(
        { deleted: purge.deleted },
        '[system-health-guard] health_failure_archive ttl purge',
      );
    }
  } catch (e) {
    logger.warn({ err: e }, '[system-health-guard] health_failure_archive_purge_failed');
  }
}

/**
 * Проактивная проверка `integrator_push_outbox` для cron (`POST /api/internal/system-health-guard/tick`).
 * Critical push по ipo error — в `operator-health-critical/tick` (каждые 5 мин); guard только классифицирует и чистит архив.
 */
export async function runIntegratorPushOutboxHealthClassificationTick(): Promise<{
  status: 'ok' | 'degraded' | 'error';
  alerted: boolean;
}> {
  const curated = (await loadCuratedSystemHealthSnapshot()).integratorPushOutbox;
  const snapshot = {
    dueBacklog: curated.dueBacklog,
    deadTotal: curated.deadTotal,
    oldestDueAgeSeconds: curated.oldestDueAgeSeconds,
    dueByKind: curated.dueByKind,
    deadByKind: curated.deadByKind,
    processingCount: curated.processingCount,
    oldestProcessingAgeSeconds: curated.oldestProcessingAgeSeconds ?? null,
    lastQueueActivityAt: curated.lastQueueActivityAt,
  };
  const status = classifyIntegratorPushOutboxSystemHealthStatus(snapshot);
  return { status, alerted: false };
}

/** Maintenance remains periodic work; it is never converted into a delivery row. */
export async function runOperatorHealthMaintenanceTick(): Promise<void> {
  await purgeHealthFailureArchiveTtlBestEffort();
  await purgeIntegrationWebhookErrorEventsBestEffort();
}

export async function runIntegratorPushOutboxHealthGuardTick(): Promise<{
  status: 'ok' | 'degraded' | 'error';
  alerted: boolean;
}> {
  const result = await runIntegratorPushOutboxHealthClassificationTick();
  await runOperatorHealthMaintenanceTick();
  return result;
}
