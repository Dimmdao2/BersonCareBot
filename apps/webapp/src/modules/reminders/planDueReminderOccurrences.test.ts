import { describe, expect, it } from "vitest";
import { planDueReminderOccurrences } from "./planDueReminderOccurrences";

describe("planDueReminderOccurrences", () => {
  it("returns empty for disabled rule", () => {
    const drafts = planDueReminderOccurrences(
      {
        id: "r1",
        isEnabled: false,
        scheduleType: "interval_window",
        timezone: "UTC",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1439,
        daysMask: "1111111",
      },
      "2026-05-19T12:00:00.000Z",
    );
    expect(drafts).toEqual([]);
  });

  it("plans only future interval_window slots for today (UTC)", () => {
    const drafts = planDueReminderOccurrences(
      {
        id: "r1",
        isEnabled: true,
        scheduleType: "interval_window",
        timezone: "UTC",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1439,
        daysMask: "1111111",
      },
      "2026-05-19T12:00:00.000Z",
    );
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((d) => d.plannedAt > "2026-05-19T12:00:00.000Z")).toBe(true);
    expect(drafts[0]?.plannedAt).toBe("2026-05-19T13:00:00.000Z");
  });

  it("does not plan past interval_window slots on current day", () => {
    const drafts = planDueReminderOccurrences(
      {
        id: "r1",
        isEnabled: true,
        scheduleType: "interval_window",
        timezone: "UTC",
        intervalMinutes: 30,
        windowStartMinute: 8 * 60,
        windowEndMinute: 18 * 60,
        daysMask: "1111111",
      },
      "2026-05-19T15:00:00.000Z",
    );
    expect(drafts.every((d) => d.plannedAt > "2026-05-19T15:00:00.000Z")).toBe(true);
    expect(drafts.some((d) => d.plannedAt === "2026-05-19T14:30:00.000Z")).toBe(false);
    expect(drafts[0]?.plannedAt).toBe("2026-05-19T15:30:00.000Z");
  });

  it("skips slots_v1 time when local slot is already in the past (Europe/Moscow)", () => {
    const drafts = planDueReminderOccurrences(
      {
        id: "wp-rule-1",
        isEnabled: true,
        scheduleType: "slots_v1",
        timezone: "Europe/Moscow",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1439,
        daysMask: "1111100",
        scheduleData: {
          dayFilter: "weekdays",
          timesLocal: ["17:42"],
        },
      },
      "2026-05-20T14:43:00.000Z",
    );
    expect(drafts).toEqual([]);
  });

  it("plans slots_v1 when local time is still ahead (Europe/Moscow)", () => {
    const drafts = planDueReminderOccurrences(
      {
        id: "wp-rule-1",
        isEnabled: true,
        scheduleType: "slots_v1",
        timezone: "Europe/Moscow",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1439,
        daysMask: "1111100",
        scheduleData: {
          dayFilter: "weekdays",
          timesLocal: ["18:00"],
        },
      },
      "2026-05-20T14:43:00.000Z",
    );
    expect(drafts.length).toBe(1);
    expect(drafts[0]?.occurrenceKey).toContain(":slot:1080");
    expect(drafts[0]?.plannedAt).toBe("2026-05-20T15:00:00.000Z");
  });

  it("returns empty for slots_v1 on weekend when dayFilter is weekdays", () => {
    const drafts = planDueReminderOccurrences(
      {
        id: "wp-rule-1",
        isEnabled: true,
        scheduleType: "slots_v1",
        timezone: "Europe/Moscow",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1439,
        daysMask: "1111100",
        scheduleData: {
          dayFilter: "weekdays",
          timesLocal: ["17:42"],
        },
      },
      "2026-05-23T14:43:00.000Z",
    );
    expect(drafts).toEqual([]);
  });
});
