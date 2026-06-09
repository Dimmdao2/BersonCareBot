import { describe, expect, it } from "vitest";
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "./adminHealthThresholds";
import {
  classifyCriticalHealthSignals,
  classifyOperatorHealthBannerSignals,
  PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS,
  type CriticalHealthSignalsInput,
  type OperatorHealthBannerInput,
} from "./criticalHealthSignals";
import type { IntegratorPushOutboxHealthSnapshot } from "./ports";

function emptyIpo(): IntegratorPushOutboxHealthSnapshot {
  return {
    dueBacklog: 0,
    deadTotal: 0,
    oldestDueAgeSeconds: null,
    dueByKind: {},
    deadByKind: {},
    processingCount: 0,
    oldestProcessingAgeSeconds: null,
    lastQueueActivityAt: null,
  };
}

function healthyInput(overrides: Partial<CriticalHealthSignalsInput> = {}): CriticalHealthSignalsInput {
  return {
    webappDb: "up",
    integratorApi: "ok",
    projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 0 },
    outgoingDelivery: { deadTotal: 0, dueBacklog: 0 },
    integratorPushOutbox: emptyIpo(),
    backupJobs: {},
    probeConsecutiveFailRuns: 0,
    videoTranscodeStatus: "ok",
    webhookBursts: [],
    ...overrides,
  };
}

function healthyBanner(overrides: Partial<OperatorHealthBannerInput> = {}): OperatorHealthBannerInput {
  return { ...healthyInput(), operatorIncidentsOpenCount: 0, ...overrides };
}

describe("classifyCriticalHealthSignals", () => {
  it("flags webapp db down", () => {
    const c = classifyCriticalHealthSignals(healthyInput({ webappDb: "down" }));
    expect(c.some((x) => x.topic === "webapp_db")).toBe(true);
  });

  it("flags integrator api unreachable", () => {
    const c = classifyCriticalHealthSignals(healthyInput({ integratorApi: "unreachable" }));
    expect(c.some((x) => x.topic === "integrator_api")).toBe(true);
  });

  it("flags projection deadCount but not retries only", () => {
    const dead = classifyCriticalHealthSignals(
      healthyInput({ projection: { probeStatus: "degraded", deadCount: 2, retriesOverThreshold: 0 } }),
    );
    expect(dead.some((x) => x.topic === "projection")).toBe(true);

    const retriesOnly = classifyCriticalHealthSignals(
      healthyInput({ projection: { probeStatus: "degraded", deadCount: 0, retriesOverThreshold: 5 } }),
    );
    expect(retriesOnly.some((x) => x.topic === "projection")).toBe(false);
  });

  it("flags outgoing dead but not due backlog alone", () => {
    const dead = classifyCriticalHealthSignals(healthyInput({ outgoingDelivery: { deadTotal: 1, dueBacklog: 0 } }));
    expect(dead.some((x) => x.topic === "outgoing_delivery")).toBe(true);

    const dueOnly = classifyCriticalHealthSignals(
      healthyInput({
        outgoingDelivery: { deadTotal: 0, dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING },
      }),
    );
    expect(dueOnly.some((x) => x.topic === "outgoing_delivery")).toBe(false);
  });

  it("flags ipo error but not degraded", () => {
    const error = classifyCriticalHealthSignals(
      healthyInput({
        integratorPushOutbox: { ...emptyIpo(), dueBacklog: 100, oldestDueAgeSeconds: 4000 },
      }),
    );
    expect(error.some((x) => x.topic === "integrator_push_outbox")).toBe(true);

    const degraded = classifyCriticalHealthSignals(
      healthyInput({
        integratorPushOutbox: { ...emptyIpo(), dueBacklog: 60, oldestDueAgeSeconds: 1000 },
      }),
    );
    expect(degraded.some((x) => x.topic === "integrator_push_outbox")).toBe(false);
  });

  it("flags projection unreachable and error probe status", () => {
    expect(
      classifyCriticalHealthSignals(
        healthyInput({ projection: { probeStatus: "unreachable", deadCount: 0, retriesOverThreshold: 0 } }),
      ).some((x) => x.topic === "projection"),
    ).toBe(true);
    expect(
      classifyCriticalHealthSignals(
        healthyInput({ projection: { probeStatus: "error", deadCount: 0, retriesOverThreshold: 0 } }),
      ).some((x) => x.topic === "projection"),
    ).toBe(true);
  });

  it("flags backup failure", () => {
    const c = classifyCriticalHealthSignals(
      healthyInput({ backupJobs: { "backup.hourly": { lastStatus: "failure" } } }),
    );
    expect(c.some((x) => x.topic === "backup")).toBe(true);
  });

  it("flags video transcode error but not degraded", () => {
    expect(
      classifyCriticalHealthSignals(healthyInput({ videoTranscodeStatus: "error" })).some(
        (x) => x.topic === "video_transcode",
      ),
    ).toBe(true);
    expect(
      classifyCriticalHealthSignals(healthyInput({ videoTranscodeStatus: "degraded" })).some(
        (x) => x.topic === "video_transcode",
      ),
    ).toBe(false);
  });

  it("webhook burst P8 at threshold", () => {
    expect(
      classifyCriticalHealthSignals(
        healthyInput({ webhookBursts: [{ source: "telegram", errorClass: "webhook_parse_failed", count: 4 }] }),
      ).some((x) => x.topic === "webhook_burst"),
    ).toBe(false);
    expect(
      classifyCriticalHealthSignals(
        healthyInput({ webhookBursts: [{ source: "telegram", errorClass: "webhook_parse_failed", count: 5 }] }),
      ).some((x) => x.topic === "webhook_burst"),
    ).toBe(true);
  });

  it("probe 3-strike only at threshold", () => {
    expect(
      classifyCriticalHealthSignals(healthyInput({ probeConsecutiveFailRuns: 2 })).some(
        (x) => x.topic === "probe_outbound",
      ),
    ).toBe(false);
    expect(
      classifyCriticalHealthSignals(
        healthyInput({ probeConsecutiveFailRuns: PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS }),
      ).some((x) => x.topic === "probe_outbound"),
    ).toBe(true);
  });
});

describe("classifyOperatorHealthBannerSignals", () => {
  it("shows banner for due backlog without critical", () => {
    const banner = classifyOperatorHealthBannerSignals(
      healthyBanner({
        outgoingDelivery: { deadTotal: 0, dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING },
      }),
    );
    expect(banner).toBe(true);
    const critical = classifyCriticalHealthSignals(
      healthyInput({
        outgoingDelivery: { deadTotal: 0, dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING },
      }),
    );
    expect(critical.some((x) => x.topic === "outgoing_delivery")).toBe(false);
  });

  it("shows banner for open operator incidents", () => {
    expect(classifyOperatorHealthBannerSignals(healthyBanner({ operatorIncidentsOpenCount: 2 }))).toBe(true);
  });

  it("shows banner for webhook burst P8", () => {
    expect(
      classifyOperatorHealthBannerSignals(
        healthyBanner({
          webhookBursts: [{ source: "telegram", errorClass: "webhook_parse_failed", count: 5 }],
        }),
      ),
    ).toBe(true);
    expect(
      classifyOperatorHealthBannerSignals(
        healthyBanner({
          webhookBursts: [{ source: "telegram", errorClass: "webhook_parse_failed", count: 4 }],
        }),
      ),
    ).toBe(false);
  });

  it("shows banner for probe 3-strike and video transcode error", () => {
    expect(
      classifyOperatorHealthBannerSignals(
        healthyBanner({ probeConsecutiveFailRuns: PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS }),
      ),
    ).toBe(true);
    expect(classifyOperatorHealthBannerSignals(healthyBanner({ videoTranscodeStatus: "error" }))).toBe(true);
    expect(classifyOperatorHealthBannerSignals(healthyBanner({ videoTranscodeStatus: "degraded" }))).toBe(false);
  });
});
