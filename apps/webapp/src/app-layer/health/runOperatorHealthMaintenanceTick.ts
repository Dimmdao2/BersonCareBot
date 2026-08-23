import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { WEBHOOK_ERROR_EVENTS_RETENTION_HOURS } from '@/modules/operator-health/webhookBurst';

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
    // Same shape as the webhook-error purge below: the tick route's infra principal selects the
    // declared named root by its function identity. No separate relation source is involved.
    const purge = await buildAppDeps().healthFailureArchive.purgeExpired();
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

/** Maintenance remains periodic work; it is never converted into a delivery row. */
export async function runOperatorHealthMaintenanceTick(): Promise<void> {
  await purgeHealthFailureArchiveTtlBestEffort();
  await purgeIntegrationWebhookErrorEventsBestEffort();
}
