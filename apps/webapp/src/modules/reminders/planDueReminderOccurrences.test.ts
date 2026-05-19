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
});
