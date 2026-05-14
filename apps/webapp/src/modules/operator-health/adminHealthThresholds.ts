/** Порог due-backlog очереди доставки для admin health-баннера и деградации system-health. */
export const ADMIN_DELIVERY_DUE_BACKLOG_WARNING = 50;

/** Возраст самой долгой pending-задачи HLS-транскода (сек) — нижняя граница «degraded». */
export const ADMIN_TRANSCODE_OLDEST_PENDING_DEGRADED_SEC = 15 * 60;
/** Возраст самой долгой pending-задачи (сек) — «error», если в очереди есть работа. */
export const ADMIN_TRANSCODE_OLDEST_PENDING_ERROR_SEC = 60 * 60;

/** Ошибки за последний час UTC — «degraded» от порога включительно. */
export const ADMIN_TRANSCODE_FAILED_LAST_HOUR_DEGRADED = 3;
/** Ошибки за последний час UTC — «error» от порога включительно. */
export const ADMIN_TRANSCODE_FAILED_LAST_HOUR_ERROR = 10;

/** Ошибки за 24 ч UTC — «degraded» от порога включительно (при включённом пайплайне). */
export const ADMIN_TRANSCODE_FAILED_LAST24H_DEGRADED = 5;

export type VideoTranscodeSystemHealthSignals = {
  pipelineEnabled: boolean;
  reconcileEnabled: boolean;
  pendingCount: number;
  oldestPendingAgeSeconds: number | null;
  failedLastHour: number;
  failedLast24h: number;
  /** `lastStatus` из тика сверки (`operator_job_status`), если строка есть. */
  reconcileLastStatus: string | null;
};

/**
 * Агрегированный статус карточки «Транскод HLS» для `GET /api/admin/system-health`.
 * Пороги намеренно компактные; при выключенном пайплайне очередь в метриках не интерпретируется.
 */
export function classifyVideoTranscodeSystemHealthStatus(
  s: VideoTranscodeSystemHealthSignals,
): "ok" | "degraded" | "error" {
  let rank = 0;
  const bump = (to: number) => {
    if (to > rank) rank = to;
  };

  if (s.pipelineEnabled && s.pendingCount > 0) {
    const age = s.oldestPendingAgeSeconds ?? 0;
    if (age >= ADMIN_TRANSCODE_OLDEST_PENDING_ERROR_SEC) bump(2);
    else if (age >= ADMIN_TRANSCODE_OLDEST_PENDING_DEGRADED_SEC) bump(1);
  }

  if (s.pipelineEnabled) {
    if (s.failedLastHour >= ADMIN_TRANSCODE_FAILED_LAST_HOUR_ERROR) bump(2);
    else if (s.failedLastHour >= ADMIN_TRANSCODE_FAILED_LAST_HOUR_DEGRADED) bump(1);
    if (s.failedLast24h >= ADMIN_TRANSCODE_FAILED_LAST24H_DEGRADED) bump(1);
  }

  if (s.reconcileEnabled && s.reconcileLastStatus === "failure") {
    bump(1);
  }

  if (rank >= 2) return "error";
  if (rank >= 1) return "degraded";
  return "ok";
}
