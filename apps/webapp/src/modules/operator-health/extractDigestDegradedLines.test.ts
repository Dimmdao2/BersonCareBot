import { describe, expect, it } from "vitest";
import { extractDigestDegradedLines } from "./extractDigestDegradedLines";
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "./adminHealthThresholds";

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

describe("extractDigestDegradedLines", () => {
  it("includes projection retries when not critical", () => {
    const lines = extractDigestDegradedLines({
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 4 },
      outgoingDelivery: { dueBacklog: 0, deadTotal: 0 },
      integratorPushOutbox: emptyIpo,
      videoTranscodeStatus: "ok",
      cronJobs: emptyCronJobs,
      operatorIncidentsOpenCount: 0,
    });
    expect(lines).toContain("Projection: ретраи (4)");
  });

  it("includes due backlog at warning threshold", () => {
    const lines = extractDigestDegradedLines({
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 0 },
      outgoingDelivery: { dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING, deadTotal: 0 },
      integratorPushOutbox: emptyIpo,
      videoTranscodeStatus: "ok",
      cronJobs: emptyCronJobs,
      operatorIncidentsOpenCount: 0,
    });
    expect(lines.some((l) => l.includes("due backlog"))).toBe(true);
  });

  it("includes ipo degraded without error", () => {
    const lines = extractDigestDegradedLines({
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 0 },
      outgoingDelivery: { dueBacklog: 0, deadTotal: 0 },
      integratorPushOutbox: {
        ...emptyIpo,
        dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING,
        oldestDueAgeSeconds: 20 * 60,
      },
      videoTranscodeStatus: "ok",
      cronJobs: emptyCronJobs,
      operatorIncidentsOpenCount: 0,
    });
    expect(lines).toContain("Очередь синка integrator: деградация");
  });

  it("includes video transcode degraded and cron error jobs", () => {
    const lines = extractDigestDegradedLines({
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 0 },
      outgoingDelivery: { dueBacklog: 0, deadTotal: 0 },
      integratorPushOutbox: emptyIpo,
      videoTranscodeStatus: "degraded",
      cronJobs: {
        status: "error",
        jobs: [
          {
            id: "x",
            jobFamily: "health",
            jobKey: "k",
            label: "Critical health tick",
            scheduleHint: "5m",
            kind: "internal_http",
            status: "error",
            lastTick: null,
          },
        ],
      },
      operatorIncidentsOpenCount: 2,
    });
    expect(lines).toContain("Транскод HLS: деградация");
    expect(lines).toContain("Cron: Critical health tick — error");
    expect(lines).toContain("Открытые инциденты: 2");
  });
});
