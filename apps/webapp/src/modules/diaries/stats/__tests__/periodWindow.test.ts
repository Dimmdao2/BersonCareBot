import { describe, expect, it } from "vitest";
import { enumerateUtcDayKeysInWindow, statsPeriodWindowUtc, utcNextMidnight } from "../periodWindow";

describe("statsPeriodWindowUtc", () => {
  it("week window has 7 days span", () => {
    const w = statsPeriodWindowUtc("week", 0);
    const from = new Date(w.fromIso).getTime();
    const to = new Date(w.toExclusiveIso).getTime();
    const days = (to - from) / 86400000;
    expect(days).toBe(7);
  });

  it("month window has 30 days span", () => {
    const w = statsPeriodWindowUtc("month", 0);
    const from = new Date(w.fromIso).getTime();
    const to = new Date(w.toExclusiveIso).getTime();
    const days = (to - from) / 86400000;
    expect(days).toBe(30);
  });

  it("offset shifts week window back", () => {
    const w0 = statsPeriodWindowUtc("week", 0);
    const w1 = statsPeriodWindowUtc("week", 1);
    expect(new Date(w0.toExclusiveIso).getTime()).toBeGreaterThan(new Date(w1.toExclusiveIso).getTime());
  });

  it("all period uses earliestIso as left bound when valid", () => {
    const w = statsPeriodWindowUtc("all", 0, { earliestIso: "2024-06-15T14:00:00.000Z" });
    expect(w.fromIso).toBe("2024-06-15T00:00:00.000Z");
  });
});

describe("enumerateUtcDayKeysInWindow", () => {
  it("lists inclusive days before exclusive end", () => {
    const keys = enumerateUtcDayKeysInWindow("2025-03-01T00:00:00.000Z", "2025-03-04T00:00:00.000Z");
    expect(keys).toEqual(["2025-03-01", "2025-03-02", "2025-03-03"]);
  });
});

describe("utcNextMidnight", () => {
  it("returns next calendar day UTC", () => {
    const d = new Date("2025-06-15T22:00:00.000Z");
    expect(utcNextMidnight(d).toISOString()).toBe("2025-06-16T00:00:00.000Z");
  });
});
