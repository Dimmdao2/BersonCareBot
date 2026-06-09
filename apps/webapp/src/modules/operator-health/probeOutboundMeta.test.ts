import { describe, expect, it } from "vitest";
import { readProbeConsecutiveFailRuns } from "./probeOutboundMeta";

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
