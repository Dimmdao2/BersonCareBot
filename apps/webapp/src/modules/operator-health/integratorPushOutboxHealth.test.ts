import { describe, expect, it } from "vitest";
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "./adminHealthThresholds";
import { classifyIntegratorPushOutboxSystemHealthStatus } from "./integratorPushOutboxHealth";
import type { IntegratorPushOutboxHealthSnapshot } from "./ports";

function snap(partial: Partial<IntegratorPushOutboxHealthSnapshot>): IntegratorPushOutboxHealthSnapshot {
  return {
    dueBacklog: 0,
    deadTotal: 0,
    oldestDueAgeSeconds: null,
    dueByKind: {},
    deadByKind: {},
    processingCount: 0,
    oldestProcessingAgeSeconds: null,
    lastQueueActivityAt: null,
    ...partial,
  };
}

describe("classifyIntegratorPushOutboxSystemHealthStatus", () => {
  it("returns ok for empty queue", () => {
    expect(classifyIntegratorPushOutboxSystemHealthStatus(snap({}))).toBe("ok");
  });

  it("returns error when dead rows exist", () => {
    expect(classifyIntegratorPushOutboxSystemHealthStatus(snap({ deadTotal: 1 }))).toBe("error");
  });

  it("returns degraded when due backlog crosses warning", () => {
    expect(
      classifyIntegratorPushOutboxSystemHealthStatus(
        snap({ dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING }),
      ),
    ).toBe("degraded");
  });

  it("returns error when due backlog is old enough", () => {
    expect(
      classifyIntegratorPushOutboxSystemHealthStatus(
        snap({ dueBacklog: 1, oldestDueAgeSeconds: 60 * 60 + 1 }),
      ),
    ).toBe("error");
  });

  it("returns degraded when processing is stale", () => {
    expect(
      classifyIntegratorPushOutboxSystemHealthStatus(
        snap({ processingCount: 1, oldestProcessingAgeSeconds: 11 * 60 }),
      ),
    ).toBe("degraded");
  });
});
