import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { classifyIntegratorPushOutboxSystemHealthStatus } from "@/modules/operator-health/integratorPushOutboxHealth";

async function purgeHealthFailureArchiveTtlBestEffort(): Promise<void> {
  try {
    const purge = await buildAppDeps().healthFailureArchive.purgeExpired();
    if (purge.deleted > 0) {
      logger.info({ deleted: purge.deleted }, "[system-health-guard] health_failure_archive ttl purge");
    }
  } catch (e) {
    logger.warn({ err: e }, "[system-health-guard] health_failure_archive_purge_failed");
  }
}

/**
 * Проактивная проверка `integrator_push_outbox` для cron (`POST /api/internal/system-health-guard/tick`).
 * Critical push по ipo error — в `operator-health-critical/tick` (каждые 5 мин); guard только классифицирует и чистит архив.
 */
export async function runIntegratorPushOutboxHealthGuardTick(): Promise<{
  status: "ok" | "degraded" | "error";
  alerted: boolean;
}> {
  const snapshot = await buildAppDeps().operatorHealthRead.getIntegratorPushOutboxHealth();
  const status = classifyIntegratorPushOutboxSystemHealthStatus(snapshot);
  await purgeHealthFailureArchiveTtlBestEffort();
  return { status, alerted: false };
}
