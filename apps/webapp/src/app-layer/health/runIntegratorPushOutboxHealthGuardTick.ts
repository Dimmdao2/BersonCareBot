import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { sendAdminIncidentRelayAlert } from "@/modules/admin-incidents/sendAdminIncidentAlerts";
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
 */
export async function runIntegratorPushOutboxHealthGuardTick(): Promise<{
  status: "ok" | "degraded" | "error";
  alerted: boolean;
}> {
  const snapshot = await buildAppDeps().operatorHealthRead.getIntegratorPushOutboxHealth();
  const status = classifyIntegratorPushOutboxSystemHealthStatus(snapshot);

  if (status === "ok") {
    await purgeHealthFailureArchiveTtlBestEffort();
    return { status, alerted: false };
  }

  const hourKey = new Date().toISOString().slice(0, 13);
  await sendAdminIncidentRelayAlert({
    topic: "system_health_db_guard",
    dedupKey: `ipo:${hourKey}:${status}`,
    lines: [
      `Очередь integrator_push_outbox: ${status}`,
      `Ждут (due): ${snapshot.dueBacklog}, dead: ${snapshot.deadTotal}, processing: ${snapshot.processingCount}`,
      snapshot.oldestDueAgeSeconds != null ? `Старейший due (с): ${snapshot.oldestDueAgeSeconds}` : "",
      snapshot.oldestProcessingAgeSeconds != null
        ? `Старейший processing (с): ${snapshot.oldestProcessingAgeSeconds}`
        : "",
    ].filter((l) => l.length > 0),
  });

  await purgeHealthFailureArchiveTtlBestEffort();
  return { status, alerted: true };
}
