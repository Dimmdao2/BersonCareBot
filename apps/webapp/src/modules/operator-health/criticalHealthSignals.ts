import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "./adminHealthThresholds";
import { classifyIntegratorPushOutboxSystemHealthStatus } from "./integratorPushOutboxHealth";
import type { IntegratorPushOutboxHealthSnapshot, OutgoingDeliveryQueueHealthSnapshot, WebhookBurstRow } from "./ports";
import { isWebhookBurstCritical, WEBHOOK_BURST_MIN_COUNT } from "./webhookBurst";

export const PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS = 3;

export type DbStatus = "up" | "down";
export type IntegratorApiStatus = "ok" | "unreachable" | "error";
export type ProjectionProbeStatus = "ok" | "degraded" | "unreachable" | "error";

export type CriticalHealthProjectionInput = {
  probeStatus: ProjectionProbeStatus;
  deadCount: number;
  retriesOverThreshold: number;
};

export type VideoTranscodeHealthStatus = "ok" | "degraded" | "error";

export type CriticalHealthSignalsInput = {
  webappDb: DbStatus;
  integratorApi: IntegratorApiStatus;
  projection: CriticalHealthProjectionInput;
  outgoingDelivery: Pick<OutgoingDeliveryQueueHealthSnapshot, "deadTotal" | "dueBacklog">;
  integratorPushOutbox: IntegratorPushOutboxHealthSnapshot;
  backupJobs: Record<string, { lastStatus: string }>;
  /** Из `operator_job_status.meta_json.consecutiveFailRuns` (outbound probe). */
  probeConsecutiveFailRuns: number;
  videoTranscodeStatus: VideoTranscodeHealthStatus;
  /** Burst inbound webhook errors (P8); omit when lightweight collect skips webhook table. */
  webhookBursts?: WebhookBurstRow[];
};

export type OperatorHealthBannerInput = CriticalHealthSignalsInput & {
  operatorIncidentsOpenCount: number;
};

export type CriticalAlertCandidate = {
  topic: string;
  dedupKey: string;
  lines: string[];
  pushTitle: string;
};

export function isProjectionCritical(p: CriticalHealthProjectionInput): boolean {
  if (p.probeStatus === "unreachable" || p.probeStatus === "error") return true;
  if (p.deadCount > 0) return true;
  return false;
}

export function isProjectionBannerWarn(p: CriticalHealthProjectionInput): boolean {
  if (isProjectionCritical(p)) return true;
  if (p.probeStatus === "degraded" || p.retriesOverThreshold > 0) return true;
  return false;
}

export function classifyOperatorHealthBannerSignals(input: OperatorHealthBannerInput): boolean {
  if (input.webappDb === "down") return true;
  if (input.integratorApi !== "ok") return true;
  if (isProjectionBannerWarn(input.projection)) return true;
  if (input.videoTranscodeStatus === "error") return true;
  if (Object.values(input.backupJobs).some((j) => j.lastStatus === "failure")) return true;
  if (input.operatorIncidentsOpenCount > 0) return true;
  if (input.probeConsecutiveFailRuns >= PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS) return true;
  if ((input.webhookBursts ?? []).some(isWebhookBurstCritical)) return true;
  const od = input.outgoingDelivery;
  if (od.deadTotal > 0 || od.dueBacklog >= ADMIN_DELIVERY_DUE_BACKLOG_WARNING) return true;
  if (classifyIntegratorPushOutboxSystemHealthStatus(input.integratorPushOutbox) !== "ok") return true;
  return false;
}

export function classifyCriticalHealthSignals(input: CriticalHealthSignalsInput): CriticalAlertCandidate[] {
  const out: CriticalAlertCandidate[] = [];

  if (input.webappDb === "down") {
    out.push({
      topic: "webapp_db",
      dedupKey: "critical:webapp_db:down",
      pushTitle: "Критичный сбой: БД webapp",
      lines: ["БД webapp: недоступна"],
    });
  }

  if (input.integratorApi !== "ok") {
    out.push({
      topic: "integrator_api",
      dedupKey: `critical:integrator_api:${input.integratorApi}`,
      pushTitle: "Критичный сбой: integrator API",
      lines: [`Integrator API: ${input.integratorApi}`],
    });
  }

  if (isProjectionCritical(input.projection)) {
    const reason =
      input.projection.probeStatus === "unreachable" || input.projection.probeStatus === "error"
        ? input.projection.probeStatus
        : input.projection.deadCount > 0
          ? `dead:${input.projection.deadCount}`
          : "critical";
    out.push({
      topic: "projection",
      dedupKey: `critical:projection:${reason}`,
      pushTitle: "Критичный сбой: projection outbox",
      lines: [
        `Projection: ${input.projection.probeStatus}`,
        ...(input.projection.deadCount > 0 ? [`dead: ${input.projection.deadCount}`] : []),
        ...(input.projection.retriesOverThreshold > 0
          ? [`retriesOverThreshold: ${input.projection.retriesOverThreshold}`]
          : []),
      ],
    });
  }

  if (input.outgoingDelivery.deadTotal > 0) {
    out.push({
      topic: "outgoing_delivery",
      dedupKey: "critical:outgoing_delivery:dead",
      pushTitle: "Критичный сбой: исходящая доставка",
      lines: [`Исходящая доставка: dead=${input.outgoingDelivery.deadTotal}`],
    });
  }

  const ipoStatus = classifyIntegratorPushOutboxSystemHealthStatus(input.integratorPushOutbox);
  if (ipoStatus === "error") {
    const hourKey = new Date().toISOString().slice(0, 13);
    out.push({
      topic: "integrator_push_outbox",
      dedupKey: `ipo:${hourKey}:error`,
      pushTitle: "Критичный сбой: очередь синка integrator",
      lines: [
        `Очередь integrator_push_outbox: ${ipoStatus}`,
        `Ждут (due): ${input.integratorPushOutbox.dueBacklog}, dead: ${input.integratorPushOutbox.deadTotal}`,
      ],
    });
  }

  for (const [jobKey, job] of Object.entries(input.backupJobs)) {
    if (job.lastStatus !== "failure") continue;
    out.push({
      topic: "backup",
      dedupKey: `critical:backup:${jobKey}:failure`,
      pushTitle: "Критичный сбой: бэкап",
      lines: [`Бэкап ${jobKey}: последний прогон failure`],
    });
  }

  if (input.probeConsecutiveFailRuns >= PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS) {
    out.push({
      topic: "probe_outbound",
      dedupKey: "critical:probe_outbound:3strike",
      pushTitle: "Критичный сбой: исходящие пробы",
      lines: [
        `Синтетические пробы интеграций: ${input.probeConsecutiveFailRuns} подряд неуспешных запусков`,
        `Порог critical: ${PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS}`,
      ],
    });
  }

  if (input.videoTranscodeStatus === "error") {
    out.push({
      topic: "video_transcode",
      dedupKey: "critical:video_transcode:error",
      pushTitle: "Критичный сбой: транскод HLS",
      lines: ["Очередь транскода HLS: error"],
    });
  }

  for (const burst of input.webhookBursts ?? []) {
    if (!isWebhookBurstCritical(burst)) continue;
    out.push({
      topic: "webhook_burst",
      dedupKey: `critical:webhook_burst:${burst.source}:${burst.errorClass}`,
      pushTitle: "Критичный сбой: вебхук",
      lines: [
        `Вебхук ${burst.source}: ${burst.errorClass}`,
        `Ошибок за окно: ${burst.count} (порог ${WEBHOOK_BURST_MIN_COUNT})`,
      ],
    });
  }

  return out;
}
