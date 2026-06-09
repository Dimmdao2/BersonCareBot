import { describe, expect, it } from "vitest";
import { buildDigestHealthSnapshotLines } from "./digestHealthSnapshotLines";
import { PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS } from "./criticalHealthSignals";

const emptyCronJobs = { status: "ok" as const, jobs: [] };

const emptyIpo = {
  dueBacklog: 0,
  deadTotal: 0,
  oldestDueAgeSeconds: null,
  dueByKind: {},
  deadByKind: {},
  processingCount: 0,
  oldestProcessingAgeSeconds: null,
  lastQueueActivityAt: null,
};

const base = {
  integratorApi: "ok" as const,
  projection: { probeStatus: "ok" as const, deadCount: 0, retriesOverThreshold: 0 },
  outgoingDelivery: { dueBacklog: 0, deadTotal: 0 },
  integratorPushOutbox: emptyIpo,
  backupJobs: {},
  probeConsecutiveFailRuns: 0,
  videoTranscodeStatus: "ok" as const,
  cronJobs: emptyCronJobs,
  operatorIncidentsOpenCount: 0,
};

describe("buildDigestHealthSnapshotLines", () => {
  it("includes ongoing critical webapp db down", () => {
    const lines = buildDigestHealthSnapshotLines({ ...base, webappDb: "down" });
    expect(lines).toContain("БД webapp: недоступна");
  });

  it("includes ongoing critical projection dead", () => {
    const lines = buildDigestHealthSnapshotLines({
      ...base,
      webappDb: "up",
      projection: { probeStatus: "ok", deadCount: 2, retriesOverThreshold: 0 },
    });
    expect(lines.some((l) => l.includes("Projection:"))).toBe(true);
    expect(lines.some((l) => l.includes("dead: 2"))).toBe(true);
  });

  it("includes probe 3-strike critical line", () => {
    const lines = buildDigestHealthSnapshotLines({
      ...base,
      webappDb: "up",
      probeConsecutiveFailRuns: PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS,
    });
    expect(lines.some((l) => l.includes("Синтетические пробы"))).toBe(true);
  });

  it("includes projection retries only when debounce allows", () => {
    const withDebounce = buildDigestHealthSnapshotLines({
      ...base,
      webappDb: "up",
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 3 },
      projectionDigestDebounce: { includeRetriesLine: true, includeStalePendingLine: false },
    });
    expect(withDebounce).toContain("Projection: ретраи (3)");

    const withoutDebounce = buildDigestHealthSnapshotLines({
      ...base,
      webappDb: "up",
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 3 },
    });
    expect(withoutDebounce.some((l) => l.includes("ретраи"))).toBe(false);
  });

  it("omits open incidents line when probe already critical", () => {
    const lines = buildDigestHealthSnapshotLines({
      ...base,
      webappDb: "up",
      probeConsecutiveFailRuns: PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS,
      operatorIncidentsOpenCount: 2,
    });
    expect(lines.some((l) => l.startsWith("Открытые инциденты:"))).toBe(false);
    expect(lines.some((l) => l.includes("Синтетические пробы"))).toBe(true);
  });
});
