import { logger } from "@/app-layer/logging/logger";
import {
  loadAdminTranscodeJobQueueMetrics,
  loadAdminTranscodeMediaFileCounts,
} from "@/infra/repos/pgAdminTranscodeHealthMetrics";

export type AdminTranscodeHealthMetrics = {
  pendingCount: number;
  processingCount: number;
  doneLastHour: number;
  failedLastHour: number;
  /** `done` with non-null `finished_at`, rolling **24 h** UTC window. */
  doneLast24h: number;
  /** `failed` with non-null `finished_at`, rolling **24 h** UTC window. */
  failedLast24h: number;
  /** Lifetime total terminal `done` (non-null `finished_at`). */
  doneLifetime: number;
  /** Lifetime total terminal `failed` (non-null `finished_at`). */
  failedLifetime: number;
  /** Average wall time for successfully finished jobs in the last UTC hour; null if none or timestamps missing. */
  avgProcessingMsDoneLastHour: number | null;
  /** Age of oldest pending job by `created_at`, seconds; null if no pending. */
  oldestPendingAgeSeconds: number | null;
  /** Legacy reconcile candidate pool semantics (`includeFailed: false` + enqueue size cap); matches health vs cron batch. */
  legacyReconcileCandidateCountWithinSizeCap: number;
  /** Readable catalog videos marked ready with non-empty HLS master key (successful streaming variant present). */
  readableVideoReadyWithHlsCount: number;
};

/**
 * Aggregates transcode queue metrics for `/api/admin/system-health` (best-effort; throws on DB errors).
 */
export async function loadAdminTranscodeHealthMetrics(): Promise<AdminTranscodeHealthMetrics> {
  const [jobMetrics, mediaExtras] = await Promise.all([
    loadAdminTranscodeJobQueueMetrics(),
    loadAdminTranscodeMediaFileCounts(),
  ]);

  return {
    ...jobMetrics,
    legacyReconcileCandidateCountWithinSizeCap: mediaExtras.legacyReconcileCandidateCountWithinSizeCap,
    readableVideoReadyWithHlsCount: mediaExtras.readableVideoReadyWithHlsCount,
  };
}

export async function loadAdminTranscodeHealthMetricsSafe(): Promise<AdminTranscodeHealthMetrics | null> {
  try {
    return await loadAdminTranscodeHealthMetrics();
  } catch (e) {
    logger.error({ err: e }, "admin_transcode_health_metrics_failed");
    return null;
  }
}
