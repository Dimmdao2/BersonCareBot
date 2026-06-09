import { describe, expect, it } from "vitest";
import { readProbeConsecutiveFailRuns, readProbeIntegrationOutcome } from "./probeOutboundMeta";

describe("readProbeConsecutiveFailRuns", () => {
  it("returns 0 for missing or invalid meta", () => {
    expect(readProbeConsecutiveFailRuns(undefined)).toBe(0);
    expect(readProbeConsecutiveFailRuns(null)).toBe(0);
    expect(readProbeConsecutiveFailRuns({})).toBe(0);
    expect(readProbeConsecutiveFailRuns({ consecutiveFailRuns: "3" })).toBe(0);
    expect(readProbeConsecutiveFailRuns({ consecutiveFailRuns: -1 })).toBe(0);
  });

  it("truncates finite non-negative streak", () => {
    expect(readProbeConsecutiveFailRuns({ consecutiveFailRuns: 2.9 })).toBe(2);
    expect(readProbeConsecutiveFailRuns({ consecutiveFailRuns: 3 })).toBe(3);
  });
});

describe("readProbeIntegrationOutcome", () => {
  it("reads per-integration probe status from meta", () => {
    const meta = { max: "ok", rubitime: "fail", telegram: "skipped_not_configured" };
    expect(readProbeIntegrationOutcome(meta, "max")).toBe("ok");
    expect(readProbeIntegrationOutcome(meta, "rubitime")).toBe("fail");
    expect(readProbeIntegrationOutcome(meta, "google_calendar")).toBe("no_data");
  });
});
