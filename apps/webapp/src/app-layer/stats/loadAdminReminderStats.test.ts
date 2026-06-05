import { describe, expect, it } from "vitest";
import { loadContentEngagementStats, parseReminderStatsWindowHours } from "./loadAdminReminderStats";

describe("parseReminderStatsWindowHours", () => {
  it("defaults to 168 when param is missing or empty", () => {
    expect(parseReminderStatsWindowHours(null)).toBe(168);
    expect(parseReminderStatsWindowHours("")).toBe(168);
    expect(parseReminderStatsWindowHours("   ")).toBe(168);
  });

  it("clamps to 1..720", () => {
    expect(parseReminderStatsWindowHours("0")).toBe(168);
    expect(parseReminderStatsWindowHours("1")).toBe(1);
    expect(parseReminderStatsWindowHours("720")).toBe(720);
    expect(parseReminderStatsWindowHours("9999")).toBe(720);
  });

  it("returns default for non-numeric input", () => {
    expect(parseReminderStatsWindowHours("abc")).toBe(168);
  });
});

describe("loadContentEngagementStats audience exclusion", () => {
  it.runIf(process.env.USE_REAL_DATABASE === "1")(
    "loads stats when test users are excluded",
    async () => {
      const stats = await loadContentEngagementStats({
        windowHours: 168,
        excludedUserIds: ["00000000-0000-4000-8000-000000000001"],
      });
      expect(stats.peopleWithNotifications.currentPeopleCount).toBeGreaterThanOrEqual(0);
      expect(stats.occurrenceHistoryHourly).toBeInstanceOf(Array);
      expect(stats.videoPlayback.totalResolutions).toBeGreaterThanOrEqual(0);
    },
  );
});
