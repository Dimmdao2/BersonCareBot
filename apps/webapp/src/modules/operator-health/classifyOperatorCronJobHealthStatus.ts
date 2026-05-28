export type OperatorCronJobHealthSignals = {
  lastStatus: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  staleAfterSec: number;
  /** For tests; defaults to `Date.now()`. */
  nowMs?: number;
};

/**
 * Универсальный статус periodic job по `operator_job_status` и SLA свежести.
 */
export function classifyOperatorCronJobHealthStatus(
  s: OperatorCronJobHealthSignals,
): "ok" | "degraded" | "error" | "no_data" {
  if (s.lastStatus == null && s.lastSuccessAt == null && s.lastFailureAt == null) {
    return "no_data";
  }

  let rank = 0;
  const bump = (to: number) => {
    if (to > rank) rank = to;
  };

  if (s.lastStatus === "failure") {
    bump(2);
  }

  const successMs = s.lastSuccessAt ? new Date(s.lastSuccessAt).getTime() : NaN;
  const failureMs = s.lastFailureAt ? new Date(s.lastFailureAt).getTime() : NaN;
  if (Number.isFinite(failureMs)) {
    if (!Number.isFinite(successMs) || failureMs > successMs) {
      bump(2);
    }
  }

  const nowMs = s.nowMs ?? Date.now();
  if (Number.isFinite(successMs)) {
    const ageSec = (nowMs - successMs) / 1000;
    if (ageSec > s.staleAfterSec) {
      bump(1);
    }
  } else if (s.lastStatus !== "success") {
    bump(1);
  }

  if (rank >= 2) return "error";
  if (rank >= 1) return "degraded";
  return "ok";
}
