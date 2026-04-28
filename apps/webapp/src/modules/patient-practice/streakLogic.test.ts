import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import { computePracticeStreak } from "./streakLogic";

describe("computePracticeStreak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(DateTime.fromISO("2026-04-28T12:00:00", { zone: "Europe/Moscow" }).toJSDate());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when no completions anchor", () => {
    const tz = "Europe/Moscow";
    expect(computePracticeStreak(new Set(["2026-04-25"]), tz)).toBe(0);
  });

  it("counts streak ending today", () => {
    const tz = "Europe/Moscow";
    const dates = new Set(["2026-04-28", "2026-04-27", "2026-04-26"]);
    expect(computePracticeStreak(dates, tz)).toBe(3);
  });

  it("allows anchor yesterday when today empty", () => {
    const tz = "Europe/Moscow";
    const dates = new Set(["2026-04-27", "2026-04-26"]);
    expect(computePracticeStreak(dates, tz)).toBe(2);
  });
});
