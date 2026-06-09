import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { loadAdminTranscodeHealthMetricsSafe } from "@/app-layer/media/adminTranscodeHealthMetrics";
import { env } from "@/config/env";
import { proxyIntegratorProjectionHealth } from "@/app-layer/health/proxyIntegratorProjectionHealth";
import { classifyVideoTranscodeSystemHealthStatus } from "@/modules/operator-health/adminHealthThresholds";
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  OPERATOR_OUTBOUND_PROBE_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";
import type {
  CriticalHealthProjectionInput,
  CriticalHealthSignalsInput,
  DbStatus,
  IntegratorApiStatus,
  OperatorHealthBannerInput,
  ProjectionProbeStatus,
  VideoTranscodeHealthStatus,
} from "@/modules/operator-health/criticalHealthSignals";
import { readProbeConsecutiveFailRuns } from "@/modules/operator-health/probeOutboundMeta";
import { WEBHOOK_BURST_MIN_COUNT, WEBHOOK_BURST_WINDOW_MINUTES } from "@/modules/operator-health/webhookBurst";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

const INTEGRATOR_TIMEOUT_MS = 8_000;

type ProjectionSnapshot = {
  deadCount?: number;
  retriesOverThreshold?: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toProjectionProbeStatus(snapshot: ProjectionSnapshot): ProjectionProbeStatus {
  const deadCount = typeof snapshot.deadCount === "number" ? snapshot.deadCount : 0;
  const retriesOverThreshold =
    typeof snapshot.retriesOverThreshold === "number" ? snapshot.retriesOverThreshold : 0;
  if (deadCount > 0 || retriesOverThreshold > 0) return "degraded";
  return "ok";
}

async function probeWebappDb(): Promise<DbStatus> {
  try {
    const dbOk = await buildAppDeps().health.checkDbHealth();
    return dbOk ? "up" : "down";
  } catch {
    return "down";
  }
}

async function probeIntegratorApi(): Promise<IntegratorApiStatus> {
  const base = (env.INTEGRATOR_API_URL ?? "").replace(/\/$/, "");
  if (!base) return "error";
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(INTEGRATOR_TIMEOUT_MS),
    });
    const body = asObject(await res.json().catch(() => null));
    if (res.ok && body?.ok === true) return "ok";
    return "error";
  } catch {
    return "unreachable";
  }
}

async function probeProjection(): Promise<CriticalHealthProjectionInput> {
  try {
    const response = await proxyIntegratorProjectionHealth();
    const payload = asObject(await response.json().catch(() => null));
    if (!response.ok || payload == null) {
      const code = typeof payload?.error === "string" ? payload.error : "projection_probe_failed";
      return {
        probeStatus: code.includes("unreachable") ? "unreachable" : "error",
        deadCount: 0,
        retriesOverThreshold: 0,
      };
    }
    const snapshot = payload as ProjectionSnapshot;
    const deadCount = typeof snapshot.deadCount === "number" ? snapshot.deadCount : 0;
    const retriesOverThreshold =
      typeof snapshot.retriesOverThreshold === "number" ? snapshot.retriesOverThreshold : 0;
    return {
      probeStatus: toProjectionProbeStatus(snapshot),
      deadCount,
      retriesOverThreshold,
    };
  } catch {
    return { probeStatus: "error", deadCount: 0, retriesOverThreshold: 0 };
  }
}

async function probeVideoTranscodeStatus(): Promise<VideoTranscodeHealthStatus> {
  try {
    const [pipelineEnabled, reconcileEnabled] = await Promise.all([
      getConfigBool("video_hls_pipeline_enabled", false),
      getConfigBool("video_hls_reconcile_enabled", false),
    ]);
    const read = buildAppDeps().operatorHealthRead;
    const [metrics, tickRow] = await Promise.all([
      loadAdminTranscodeHealthMetricsSafe(),
      read.getOperatorJobStatus(OPERATOR_MEDIA_JOB_FAMILY, OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY),
    ]);
    if (!metrics) return pipelineEnabled ? "error" : "ok";
    return classifyVideoTranscodeSystemHealthStatus({
      pipelineEnabled,
      reconcileEnabled,
      pendingCount: metrics.pendingCount,
      oldestPendingAgeSeconds: metrics.oldestPendingAgeSeconds,
      failedLastHour: metrics.failedLastHour,
      failedLast24h: metrics.failedLast24h,
      reconcileLastStatus: tickRow?.lastStatus ?? null,
    });
  } catch {
    return "error";
  }
}

async function loadBackupJobsMap(): Promise<Record<string, { lastStatus: string }>> {
  const rows = await buildAppDeps().operatorHealthRead.listBackupJobStatus();
  const backupJobs: Record<string, { lastStatus: string }> = {};
  for (const row of rows) {
    backupJobs[row.jobKey] = { lastStatus: row.lastStatus };
  }
  return backupJobs;
}

/**
 * Облегчённый сбор сигналов для critical tick (без media/playback/engagement).
 */
export async function collectCriticalHealthSignals(): Promise<CriticalHealthSignalsInput> {
  const read = buildAppDeps().operatorHealthRead;

  const [
    webappDb,
    integratorApi,
    projection,
    outgoingDelivery,
    integratorPushOutbox,
    backupJobs,
    probeJob,
    videoTranscodeStatus,
    webhookBursts,
  ] = await Promise.all([
    probeWebappDb(),
    probeIntegratorApi(),
    probeProjection(),
    read.getOutgoingDeliveryQueueHealth(),
    read.getIntegratorPushOutboxHealth(),
    loadBackupJobsMap(),
    read.getOperatorJobStatus(OPERATOR_HEALTH_JOB_FAMILY, OPERATOR_OUTBOUND_PROBE_JOB_KEY),
    probeVideoTranscodeStatus(),
    read.listWebhookBurstSignals(WEBHOOK_BURST_WINDOW_MINUTES, WEBHOOK_BURST_MIN_COUNT),
  ]);

  return {
    webappDb,
    integratorApi,
    projection,
    outgoingDelivery: {
      deadTotal: outgoingDelivery.deadTotal,
      dueBacklog: outgoingDelivery.dueBacklog,
    },
    integratorPushOutbox,
    backupJobs,
    probeConsecutiveFailRuns: readProbeConsecutiveFailRuns(probeJob?.metaJson),
    videoTranscodeStatus,
    webhookBursts,
  };
}

/** Снимок для баннера «Сегодня». */
export async function collectOperatorHealthBannerInput(): Promise<OperatorHealthBannerInput> {
  const read = buildAppDeps().operatorHealthRead;
  const [base, incidents] = await Promise.all([collectCriticalHealthSignals(), read.listOpenIncidents(100)]);
  return {
    ...base,
    operatorIncidentsOpenCount: incidents.length,
  };
}
