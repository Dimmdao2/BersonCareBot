import { describe, expect, it } from "vitest";
import {
  buildExerciseVideoSplit,
  loadContentEngagementStats,
  mergePushOpenBuckets,
  parseReminderStatsWindowHours,
  summarizePushOpens,
} from "./loadAdminReminderStats";

describe("buildExerciseVideoSplit (AN-11)", () => {
  it("buckets promo vs assigned, no double counting, top-15 per bucket", () => {
    const rows = [
      { media_id: "m1", title: "Promo A", in_promo: true, n: "30" },
      { media_id: "m2", title: "Assigned B", in_promo: false, n: "20" },
      { media_id: "m3", title: "Promo C", in_promo: true, n: "5" },
    ];
    const out = buildExerciseVideoSplit(rows);
    expect(out.promoExerciseVideoCount).toBe(35);
    expect(out.assignedExerciseVideoCount).toBe(20);
    expect(out.promoExerciseVideoTopItems.map((r) => r.mediaId)).toEqual(["m1", "m3"]);
    expect(out.assignedExerciseVideoTopItems.map((r) => r.mediaId)).toEqual(["m2"]);
  });

  it("handles empty input", () => {
    const out = buildExerciseVideoSplit([]);
    expect(out.promoExerciseVideoCount).toBe(0);
    expect(out.assignedExerciseVideoCount).toBe(0);
    expect(out.promoExerciseVideoTopItems).toEqual([]);
    expect(out.assignedExerciseVideoTopItems).toEqual([]);
  });
});

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
