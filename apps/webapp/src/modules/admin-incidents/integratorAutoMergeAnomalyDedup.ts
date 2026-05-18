import { createHash } from "node:crypto";

/**
 * Stable dedup key for integrator projection `auto_merge_conflict_anomaly` relay (order-independent ids).
 */
export function integratorAutoMergeAnomalyDedupKey(input: {
  eventType: string;
  reason: unknown;
  conflictClass: unknown;
  integratorUserIds: unknown;
}): string {
  const ids = Array.isArray(input.integratorUserIds)
    ? [...new Set(input.integratorUserIds.map((x) => String(x).trim()).filter(Boolean))].sort()
    : [];
  const payload = {
    t: input.eventType,
    r: input.reason,
    c: input.conflictClass,
    i: ids,
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex").slice(0, 48);
}
