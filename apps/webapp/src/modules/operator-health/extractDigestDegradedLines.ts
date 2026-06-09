import type { CronJobsHealthPayload } from "@/app-layer/health/collectCronJobsHealth";
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "./adminHealthThresholds";
import { classifyIntegratorPushOutboxSystemHealthStatus } from "./integratorPushOutboxHealth";
import { isProjectionCritical } from "./criticalHealthSignals";
import type { IntegratorPushOutboxHealthSnapshot } from "./ports";

export type DigestDegradedSnapshot = {
  projection: {
    probeStatus: "ok" | "degraded" | "unreachable" | "error";
    deadCount: number;
    retriesOverThreshold: number;
    oldestPendingAt?: string | null;
  };
  /** W3: debounce retries/stale pending для сводки (только digest, не critical push). */
  projectionDigestDebounce?: {
    includeRetriesLine: boolean;
    includeStalePendingLine: boolean;
  };
  outgoingDelivery: { dueBacklog: number; deadTotal: number };
  integratorPushOutbox: IntegratorPushOutboxHealthSnapshot;
  videoTranscodeStatus: "ok" | "degraded" | "error";
  cronJobs: CronJobsHealthPayload;
  operatorIncidentsOpenCount: number;
};

/**
 * Non-critical degraded сигналы для суточной сводки (матрица §3, не immediate push).
 */
export function extractDigestDegradedLines(snapshot: DigestDegradedSnapshot): string[] {
  const lines: string[] = [];

  const projectionCritical = isProjectionCritical({
    probeStatus: snapshot.projection.probeStatus,
    deadCount: snapshot.projection.deadCount,
    retriesOverThreshold: snapshot.projection.retriesOverThreshold,
  });
  const includeRetries = snapshot.projectionDigestDebounce?.includeRetriesLine === true;
  if (!projectionCritical && includeRetries) {
    if (snapshot.projection.retriesOverThreshold > 0) {
      lines.push(`Projection: ретраи (${snapshot.projection.retriesOverThreshold})`);
    } else if (snapshot.projection.probeStatus === "degraded") {
      lines.push("Projection: деградация");
    }
  }
  const includeStale = snapshot.projectionDigestDebounce?.includeStalePendingLine === true;
  if (!projectionCritical && includeStale && snapshot.projection.oldestPendingAt) {
    const ageMin = Math.floor(
      (Date.now() - Date.parse(snapshot.projection.oldestPendingAt)) / (60 * 1000),
    );
    lines.push(`Projection: stale pending (${ageMin} мин)`);
  }

  if (snapshot.outgoingDelivery.dueBacklog >= ADMIN_DELIVERY_DUE_BACKLOG_WARNING) {
    lines.push(`Очередь доставки: due backlog ${snapshot.outgoingDelivery.dueBacklog}`);
  }

  const ipoStatus = classifyIntegratorPushOutboxSystemHealthStatus(snapshot.integratorPushOutbox);
  if (ipoStatus === "degraded") {
    lines.push("Очередь синка integrator: деградация");
  }

  if (snapshot.videoTranscodeStatus === "degraded") {
    lines.push("Транскод HLS: деградация");
  }

  for (const job of snapshot.cronJobs.jobs) {
    if (job.status === "degraded" || job.status === "error") {
      lines.push(`Cron: ${job.label} — ${job.status}`);
    }
  }

  if (snapshot.operatorIncidentsOpenCount > 0) {
    lines.push(`Открытые инциденты: ${snapshot.operatorIncidentsOpenCount}`);
  }

  return lines;
}
