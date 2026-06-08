import { describe, expect, it } from "vitest";
import { estimateWatchMinutes } from "./estimateWatchMinutes";

describe("estimateWatchMinutes", () => {
  it("uses summed seconds when present", () => {
    expect(estimateWatchMinutes({ totalSeconds: 185, eventCount: 3, avgSecondsFallback: 0 })).toBe(3);
  });

  it("falls back to avg seconds per event", () => {
    expect(
      estimateWatchMinutes({ totalSeconds: 0, eventCount: 4, avgSecondsFallback: 90 }),
    ).toBe(6);
  });

  it("uses default per event when avg is zero", () => {
    expect(
      estimateWatchMinutes({ totalSeconds: 0, eventCount: 2, avgSecondsFallback: 0, defaultSecondsPerEvent: 120 }),
    ).toBe(4);
  });

  it("returns 0 without events", () => {
    expect(estimateWatchMinutes({ totalSeconds: 0, eventCount: 0, avgSecondsFallback: 60 })).toBe(0);
  });
});
