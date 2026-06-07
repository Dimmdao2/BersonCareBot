import { describe, expect, it } from "vitest";
import {
  loadContentEngagementStats,
  mergePushOpenBuckets,
  parseReminderStatsWindowHours,
  summarizePushOpens,
} from "./loadAdminReminderStats";

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

describe("mergePushOpenBuckets + summarizePushOpens", () => {
  it("merges push_open and push_sent into the same bucket", () => {
    const hourly = mergePushOpenBuckets([
      { bucket: "2026-06-07T10:00:00", eventType: "push_open", n: 18 },
      { bucket: "2026-06-07T10:00:00", eventType: "push_sent", n: 142 },
      { bucket: "2026-06-07T11:00:00", eventType: "push_open", n: 3 },
    ]);
    expect(hourly).toEqual([
      { bucket: "2026-06-07T10:00:00", opened: 18, sent: 142 },
      { bucket: "2026-06-07T11:00:00", opened: 3, sent: 0 },
    ]);
  });

  it("summarizes sent from push_sent buckets, not only push_open", () => {
    const summary = summarizePushOpens([
      { bucket: "a", opened: 18, sent: 142 },
      { bucket: "b", opened: 3, sent: 58 },
    ]);
    expect(summary).toEqual({ opened: 21, sent: 200, openRate: 21 / 200 });
  });

  it("returns openRate 0 when sent is 0", () => {
    expect(summarizePushOpens([{ bucket: "a", opened: 5, sent: 0 }])).toEqual({
      opened: 5,
      sent: 0,
      openRate: 0,
    });
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
