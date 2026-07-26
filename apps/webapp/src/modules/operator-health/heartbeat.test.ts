import { describe, expect, it } from "vitest";
import { INTERNAL_BEARER_CSRF_EXEMPT_PATHS } from "@/middleware/csrfOrigin";
import {
  OPERATOR_HEARTBEATS,
  classifyOperatorHeartbeat,
  isHeartbeatFailing,
  parseOperatorHeartbeatStaleOverrides,
  resolveHeartbeatStaleAfterSec,
} from "./heartbeat";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

describe("classifyOperatorHeartbeat", () => {
  it("is alive while pings arrive inside the window", () => {
    const verdict = classifyOperatorHeartbeat(
      {
        name: "pipeline_delivery",
        lastPingAt: "2026-07-26T11:55:00.000Z",
        staleAfterSec: 900,
      },
      NOW,
    );
    expect(verdict.status).toBe("alive");
    expect(isHeartbeatFailing(verdict)).toBe(false);
    expect(verdict.ageSeconds).toBe(300);
  });

  it("raises as soon as a ping does not arrive on time — the alert IS the absence", () => {
    const verdict = classifyOperatorHeartbeat(
      {
        name: "pipeline_delivery",
        lastPingAt: "2026-07-26T11:00:00.000Z",
        staleAfterSec: 900,
      },
      NOW,
    );
    expect(verdict.status).toBe("absent");
    expect(isHeartbeatFailing(verdict)).toBe(true);
  });

  it("treats a heartbeat that never arrived as failing, not as 'no data yet'", () => {
    const verdict = classifyOperatorHeartbeat(
      { name: "digest", lastPingAt: null, staleAfterSec: 900 },
      NOW,
    );
    expect(verdict.status).toBe("never");
    expect(isHeartbeatFailing(verdict)).toBe(true);
  });

  it("treats an unparseable timestamp as failing rather than silently alive", () => {
    const verdict = classifyOperatorHeartbeat(
      { name: "digest", lastPingAt: "not-a-date", staleAfterSec: 900 },
      NOW,
    );
    expect(isHeartbeatFailing(verdict)).toBe(true);
  });
});

describe("parseOperatorHeartbeatStaleOverrides", () => {
  it("narrows the window when configured", () => {
    const overrides = parseOperatorHeartbeatStaleOverrides('{"pipeline_delivery": 900}');
    const pipeline = OPERATOR_HEARTBEATS.find((h) => h.name === "pipeline_delivery")!;
    expect(resolveHeartbeatStaleAfterSec(pipeline, overrides)).toBe(900);
  });

  it("keeps defaults for garbage, unknown names and non-positive values", () => {
    const digest = OPERATOR_HEARTBEATS.find((h) => h.name === "digest")!;
    for (const raw of ["", "not json", '{"nope": 10}', '{"digest": 0}', '{"digest": -5}', "[]"]) {
      const overrides = parseOperatorHeartbeatStaleOverrides(raw);
      expect(resolveHeartbeatStaleAfterSec(digest, overrides)).toBe(digest.defaultStaleAfterSec);
    }
  });
});

describe("heartbeat receiver wiring", () => {
  it("every heartbeat has a CSRF-exempt receiver path so a cron POST is not rejected", () => {
    // Дрейф между реестром пульсов и allowlist'ом означал бы 403 на приёме пульса —
    // то есть механизм, который молча не работает. Ровно тот класс, против которого он и строится.
    for (const heartbeat of OPERATOR_HEARTBEATS) {
      expect(INTERNAL_BEARER_CSRF_EXEMPT_PATHS as readonly string[]).toContain(
        `/api/internal/heartbeat/${heartbeat.name}`,
      );
    }
  });
});
