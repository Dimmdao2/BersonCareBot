import { proxyIntegratorProjectionHealth } from "@/app-layer/health/proxyIntegratorProjectionHealth";
import type { ProjectionProbeStatus } from "@/modules/operator-health/criticalHealthSignals";
import type { ProjectionDigestSignalInput } from "@/modules/operator-health/projectionDigestDebounce";

type ProjectionSnapshot = {
  deadCount?: number;
  retriesOverThreshold?: number;
  oldestPendingAt?: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function snapshotToOkDegraded(snapshot: ProjectionSnapshot): ProjectionProbeStatus {
  const deadCount = typeof snapshot.deadCount === "number" ? snapshot.deadCount : 0;
  const retriesOverThreshold =
    typeof snapshot.retriesOverThreshold === "number" ? snapshot.retriesOverThreshold : 0;
  return deadCount > 0 || retriesOverThreshold > 0 ? "degraded" : "ok";
}

/** Лёгкий probe projection для debounce сводки (без полного `collectAdminSystemHealthData`). */
export async function probeProjectionDigestSignal(): Promise<ProjectionDigestSignalInput> {
  try {
    const response = await proxyIntegratorProjectionHealth();
    const payload = asObject(await response.json().catch(() => null));
    if (payload == null) {
      return { probeStatus: "error", deadCount: 0, retriesOverThreshold: 0, oldestPendingAt: null };
    }
    if (!response.ok) {
      const code = typeof payload.error === "string" ? payload.error : "projection_probe_failed";
      return {
        probeStatus: code.includes("unreachable") ? "unreachable" : "error",
        deadCount: 0,
        retriesOverThreshold: 0,
        oldestPendingAt: null,
      };
    }
    const snapshot = payload as ProjectionSnapshot;
    const deadCount = typeof snapshot.deadCount === "number" ? snapshot.deadCount : 0;
    const retriesOverThreshold =
      typeof snapshot.retriesOverThreshold === "number" ? snapshot.retriesOverThreshold : 0;
    const oldestPendingAt =
      typeof snapshot.oldestPendingAt === "string" ? snapshot.oldestPendingAt : null;
    return {
      probeStatus: snapshotToOkDegraded(snapshot),
      deadCount,
      retriesOverThreshold,
      oldestPendingAt,
    };
  } catch {
    return { probeStatus: "error", deadCount: 0, retriesOverThreshold: 0, oldestPendingAt: null };
  }
}
