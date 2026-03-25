import { describe, expect, it } from "vitest";
import { getQuoteForDay, quoteDayKeyUtc, quoteIndexForDaySeed } from "./newsMotivation";

describe("newsMotivation getQuoteForDay", () => {
  it("returns null when DATABASE_URL empty (test env)", async () => {
    const q = await getQuoteForDay("user-1");
    expect(q).toBeNull();
  });
});

describe("quoteIndexForDaySeed (QA-03 stability)", () => {
  const day = new Date("2025-06-15T08:00:00.000Z");

  it("same seed and same UTC day yield same index for a fixed total", () => {
    const dayKey = quoteDayKeyUtc(day);
    const a = quoteIndexForDaySeed("patient-seed-1", dayKey, 17);
    const b = quoteIndexForDaySeed("patient-seed-1", dayKey, 17);
    expect(a).toBe(b);
  });

  it("index is within range for given total", () => {
    const dayKey = quoteDayKeyUtc(day);
    const idx = quoteIndexForDaySeed("patient-seed-1", dayKey, 17);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(17);
  });
});
