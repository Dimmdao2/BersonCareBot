/**
 * Report shaping and threshold logic for person-domain reconciliation.
 * Used by reconcile-person-domain script and tests.
 */

export type LegacyUser = {
  integratorUserId: string;
  phone: string | null;
  displayName: string;
  bindings: { channelCode: string; externalId: string }[];
  topics: Record<string, boolean>;
};

export type TargetUser = {
  platformUserId: string;
  integratorUserId: string;
  phone: string | null;
  displayName: string;
  bindings: { channelCode: string; externalId: string }[];
  topics: Record<string, boolean>;
};

export type ReconciliationReport = {
  totalLegacyUsers: number;
  totalProjectedWithIntegratorId: number;
  missingInWebappCount: number;
  missingInWebappIds: string[];
  extraInWebappCount: number;
  extraInWebappIds: string[];
  fieldDriftCount: number;
  fieldDriftSample: { integratorUserId: string; phoneMatch: boolean; displayNameMatch: boolean; bindingsMatch: boolean; topicsMatch: boolean }[];
  sampledComparison: {
    integratorUserId: string;
    legacy: { phone: string | null; displayName: string; bindingsCount: number; topics: Record<string, boolean> };
    webapp: { phone: string | null; displayName: string; bindingsCount: number; topics: Record<string, boolean> };
  }[];
};

function compareBindings(
  a: { channelCode: string; externalId: string }[],
  b: { channelCode: string; externalId: string }[],
): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((x) => `${x.channelCode}:${x.externalId}`).sort());
  const sb = new Set(b.map((x) => `${x.channelCode}:${x.externalId}`).sort());
  if (sa.size !== sb.size) return false;
  for (const k of sa) if (!sb.has(k)) return false;
  return true;
}

function compareTopics(a: Record<string, boolean> | undefined, b: Record<string, boolean> | undefined): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if (!!(a ?? {})[k] !== !!(b ?? {})[k]) return false;
  }
  return true;
}

export function buildReport(
  legacyMap: Map<string, LegacyUser>,
  targetMap: Map<string, TargetUser>,
  sampleSize: number,
): ReconciliationReport {
  const legacyIds = new Set(legacyMap.keys());
  const targetIds = new Set(targetMap.keys());
  const missingInWebapp = [...legacyIds].filter((id) => !targetIds.has(id));
  const extraInWebapp = [...targetIds].filter((id) => !legacyIds.has(id));
  const commonIds = [...legacyIds].filter((id) => targetIds.has(id));
  const fieldDrift: ReconciliationReport["fieldDriftSample"] = [];
  for (const id of commonIds) {
    const L = legacyMap.get(id)!;
    const T = targetMap.get(id)!;
    const phoneOk = (L.phone || "") === (T.phone || "");
    const displayOk = (L.displayName || "") === (T.displayName || "");
    const bindingsOk = compareBindings(L.bindings ?? [], T.bindings ?? []);
    const topicsOk = compareTopics(L.topics, T.topics);
    if (!phoneOk || !displayOk || !bindingsOk || !topicsOk) {
      fieldDrift.push({
        integratorUserId: id,
        phoneMatch: phoneOk,
        displayNameMatch: displayOk,
        bindingsMatch: bindingsOk,
        topicsMatch: topicsOk,
      });
    }
  }
  const sample = commonIds.slice(0, sampleSize).map((id) => {
    const L = legacyMap.get(id)!;
    const T = targetMap.get(id)!;
    return {
      integratorUserId: id,
      legacy: {
        phone: L.phone,
        displayName: L.displayName,
        bindingsCount: (L.bindings ?? []).length,
        topics: L.topics ?? {},
      },
      webapp: {
        phone: T.phone,
        displayName: T.displayName,
        bindingsCount: (T.bindings ?? []).length,
        topics: T.topics ?? {},
      },
    };
  });
  return {
    totalLegacyUsers: legacyMap.size,
    totalProjectedWithIntegratorId: targetMap.size,
    missingInWebappCount: missingInWebapp.length,
    missingInWebappIds: missingInWebapp.slice(0, 100),
    extraInWebappCount: extraInWebapp.length,
    extraInWebappIds: extraInWebapp.slice(0, 100),
    fieldDriftCount: fieldDrift.length,
    fieldDriftSample: fieldDrift.slice(0, 20),
    sampledComparison: sample,
  };
}

/** Returns true when report is within threshold (go); false when violated (no-go). */
export function isWithinThreshold(report: ReconciliationReport, maxMismatchPercent: number): boolean {
  const totalLegacy = report.totalLegacyUsers || 0;
  const missing = report.missingInWebappCount || 0;
  if (missing > 0 && maxMismatchPercent === 0) return false;
  if (totalLegacy === 0) return true;
  const mismatchPercent = (100 * missing) / totalLegacy;
  return mismatchPercent <= maxMismatchPercent;
}
