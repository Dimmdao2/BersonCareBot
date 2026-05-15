import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { sendAdminIncidentRelayAlert } from "@/modules/admin-incidents/sendAdminIncidentAlerts";
import { classifyIntegratorPushOutboxSystemHealthStatus } from "@/modules/operator-health/integratorPushOutboxHealth";

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
  return { status, alerted: true };
}
