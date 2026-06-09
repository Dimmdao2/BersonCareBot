import type { OperatorHealthReadPort, OperatorHealthWritePort } from "./ports";
import { loadOperatorHealthProjectionThresholds } from "./operatorHealthProjectionThresholds";
import {
  advanceProjectionDigestDebounce,
  parseProjectionDigestDebounceState,
  type ProjectionDigestSignalInput,
} from "./projectionDigestDebounce";
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY,
} from "./reconcileJobKeys";

export type ProjectionDigestDebounceFlags = {
  includeRetriesLine: boolean;
  includeStalePendingLine: boolean;
};

export async function runProjectionDigestDebounceTick(params: {
  operatorHealthRead: OperatorHealthReadPort;
  operatorHealthWrite: OperatorHealthWritePort;
  getConfigValue: (key: string, fallback: string) => Promise<string>;
  fetchSignal: () => Promise<ProjectionDigestSignalInput>;
  nowMs?: number;
}): Promise<ProjectionDigestDebounceFlags> {
  const nowMs = params.nowMs ?? Date.now();
  const [signal, thresholds, debounceRow] = await Promise.all([
    params.fetchSignal(),
    loadOperatorHealthProjectionThresholds(params.getConfigValue),
    params.operatorHealthRead.getOperatorJobStatus(
      OPERATOR_HEALTH_JOB_FAMILY,
      OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY,
    ),
  ]);

  const debounce = advanceProjectionDigestDebounce(
    signal,
    thresholds,
    parseProjectionDigestDebounceState(debounceRow?.metaJson),
    nowMs,
  );

  await params.operatorHealthWrite.recordOperatorJobTickSuccess({
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY,
    startedAtIso: new Date(nowMs).toISOString(),
    durationMs: 0,
    metaJson: debounce.state,
  });

  return {
    includeRetriesLine: debounce.includeRetriesInDigest,
    includeStalePendingLine: debounce.includeStalePendingInDigest,
  };
}
