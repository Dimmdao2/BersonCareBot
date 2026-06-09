import { isProjectionCritical, type ProjectionProbeStatus } from "./criticalHealthSignals";
import type { OperatorHealthProjectionThresholds } from "./operatorHealthProjectionThresholds";

import { OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY } from "./reconcileJobKeys";

export { OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY };

export type ProjectionDigestDebounceState = {
  retriesFirstSeenAt: string | null;
  stalePendingFirstSeenAt: string | null;
};

export type ProjectionDigestSignalInput = {
  probeStatus: ProjectionProbeStatus;
  deadCount: number;
  retriesOverThreshold: number;
  oldestPendingAt: string | null;
};

export type ProjectionDigestDebounceResult = {
  state: ProjectionDigestDebounceState;
  includeRetriesInDigest: boolean;
  includeStalePendingInDigest: boolean;
};

export function parseProjectionDigestDebounceState(
  metaJson: Record<string, unknown> | null | undefined,
): ProjectionDigestDebounceState {
  const retries =
    typeof metaJson?.retriesFirstSeenAt === "string" ? metaJson.retriesFirstSeenAt : null;
  const stale =
    typeof metaJson?.stalePendingFirstSeenAt === "string" ? metaJson.stalePendingFirstSeenAt : null;
  return { retriesFirstSeenAt: retries, stalePendingFirstSeenAt: stale };
}

export function isProjectionOldestPendingStale(
  oldestPendingAt: string | null,
  staleMinutes: number,
  nowMs: number,
): boolean {
  if (!oldestPendingAt) return false;
  const parsed = Date.parse(oldestPendingAt);
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed >= staleMinutes * 60 * 1000;
}

function sustainedSince(firstSeenAt: string | null, debounceMinutes: number, nowMs: number): boolean {
  if (!firstSeenAt) return false;
  const parsed = Date.parse(firstSeenAt);
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed >= debounceMinutes * 60 * 1000;
}

/**
 * Debounce projection retries / stale pending для суточной сводки (W3, матрица §3).
 * Critical projection сбрасывает debounce и не даёт debounced строк.
 */
export function advanceProjectionDigestDebounce(
  input: ProjectionDigestSignalInput,
  thresholds: OperatorHealthProjectionThresholds,
  prev: ProjectionDigestDebounceState,
  nowMs = Date.now(),
): ProjectionDigestDebounceResult {
  const nowIso = new Date(nowMs).toISOString();
  const critical = isProjectionCritical({
    probeStatus: input.probeStatus,
    deadCount: input.deadCount,
    retriesOverThreshold: input.retriesOverThreshold,
  });
  if (critical) {
    return {
      state: { retriesFirstSeenAt: null, stalePendingFirstSeenAt: null },
      includeRetriesInDigest: false,
      includeStalePendingInDigest: false,
    };
  }

  const retriesActive = input.retriesOverThreshold > 0;
  let retriesFirstSeenAt = prev.retriesFirstSeenAt;
  if (retriesActive) {
    if (!retriesFirstSeenAt) retriesFirstSeenAt = nowIso;
  } else {
    retriesFirstSeenAt = null;
  }

  const staleActive = isProjectionOldestPendingStale(
    input.oldestPendingAt,
    thresholds.oldestPendingStaleMinutes,
    nowMs,
  );
  let stalePendingFirstSeenAt = prev.stalePendingFirstSeenAt;
  if (staleActive) {
    if (!stalePendingFirstSeenAt) stalePendingFirstSeenAt = nowIso;
  } else {
    stalePendingFirstSeenAt = null;
  }

  return {
    state: { retriesFirstSeenAt, stalePendingFirstSeenAt },
    includeRetriesInDigest: sustainedSince(
      retriesFirstSeenAt,
      thresholds.retriesDebounceMinutes,
      nowMs,
    ),
    includeStalePendingInDigest: sustainedSince(
      stalePendingFirstSeenAt,
      thresholds.stalePendingDebounceMinutes,
      nowMs,
    ),
  };
}

/** Read-only оценка flags для строк сводки по сохранённому state и текущему snapshot (без advance). */
export function evaluateProjectionDigestDebounceFlags(
  input: ProjectionDigestSignalInput,
  thresholds: OperatorHealthProjectionThresholds,
  state: ProjectionDigestDebounceState,
  nowMs = Date.now(),
): Pick<ProjectionDigestDebounceResult, "includeRetriesInDigest" | "includeStalePendingInDigest"> {
  const critical = isProjectionCritical({
    probeStatus: input.probeStatus,
    deadCount: input.deadCount,
    retriesOverThreshold: input.retriesOverThreshold,
  });
  if (critical) {
    return { includeRetriesInDigest: false, includeStalePendingInDigest: false };
  }

  const retriesActive = input.retriesOverThreshold > 0;
  const staleActive = isProjectionOldestPendingStale(
    input.oldestPendingAt,
    thresholds.oldestPendingStaleMinutes,
    nowMs,
  );

  return {
    includeRetriesInDigest:
      retriesActive &&
      sustainedSince(state.retriesFirstSeenAt, thresholds.retriesDebounceMinutes, nowMs),
    includeStalePendingInDigest:
      staleActive &&
      sustainedSince(state.stalePendingFirstSeenAt, thresholds.stalePendingDebounceMinutes, nowMs),
  };
}
