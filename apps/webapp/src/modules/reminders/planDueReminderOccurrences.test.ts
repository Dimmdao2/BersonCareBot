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

  it("plans at least one slot for enabled interval_window in UTC", () => {
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
    expect(drafts[0]?.occurrenceKey).toBeTruthy();
    expect(drafts[0]?.plannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("plans slots_v1 weekday time when local slot is in the past (Europe/Moscow)", () => {
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
    expect(drafts.length).toBe(1);
    expect(drafts[0]?.occurrenceKey).toContain(":slot:1062");
    expect(drafts[0]?.plannedAt).toBe("2026-05-20T14:42:00.000Z");
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
