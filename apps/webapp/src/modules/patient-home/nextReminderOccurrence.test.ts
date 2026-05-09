import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  computeNextOccurrenceUtcForRule,
  formatNextReminderLabel,
  pickNextHomeReminder,
  countPlannedHomeReminderOccurrencesInUtcRange,
} from "./nextReminderOccurrence";
import type { ReminderRule } from "@/modules/reminders/types";

function rule(partial: Partial<ReminderRule> & Pick<ReminderRule, "id">): ReminderRule {
  return {
    integratorUserId: "i1",
    category: "lfk",
    enabled: true,
    timezone: "Europe/Moscow",
    intervalMinutes: 60,
    windowStartMinute: 9 * 60,
    windowEndMinute: 18 * 60,
    daysMask: "1111111",
    fallbackEnabled: true,
    linkedObjectType: "content_page",
    linkedObjectId: "slug-a",
    customTitle: null,
    customText: null,
    scheduleType: "interval_window",
    scheduleData: null,
    reminderIntent: "generic",
    displayTitle: null,
    displayDescription: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("pickNextHomeReminder", () => {
  it("returns null when no eligible rules", () => {
    expect(pickNextHomeReminder([], new Date(), "Europe/Moscow")).toBeNull();
    expect(
      pickNextHomeReminder(
        [
          rule({
            id: "1",
            enabled: false,
            linkedObjectType: "content_page",
            linkedObjectId: "x",
          }),
        ],
        new Date(),
        "Europe/Moscow",
      ),
    ).toBeNull();
  });

  it("ignores custom linked type", () => {
    expect(
      pickNextHomeReminder(
        [
          rule({
            id: "c",
            linkedObjectType: "custom",
            linkedObjectId: null,
            customTitle: "T",
          }),
        ],
        new Date(),
        "Europe/Moscow",
      ),
    ).toBeNull();
  });

  it("picks the earliest next occurrence among rules", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 10, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    ).toJSDate();
    const a = rule({
      id: "a",
      windowStartMinute: 12 * 60,
      windowEndMinute: 12 * 60,
      intervalMinutes: 1440,
    });
    const b = rule({
      id: "b",
      windowStartMinute: 11 * 60,
      windowEndMinute: 11 * 60,
      intervalMinutes: 1440,
    });
    expect(pickNextHomeReminder([a, b], now, "Europe/Moscow")?.rule.id).toBe("b");
  });

  it("includes rehab_program with slots_v1", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 10, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    ).toJSDate();
    const r = rule({
      id: "rehab",
      linkedObjectType: "rehab_program",
      linkedObjectId: "p1",
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["12:00", "15:00", "17:00"], dayFilter: "weekdays" },
    });
    const next = pickNextHomeReminder([r], now, "Europe/Moscow");
    expect(next?.rule.id).toBe("rehab");
    expect(formatNextReminderLabel(next!.nextAt, "Europe/Moscow")).toMatch(/12:00/);
  });
});

describe("computeNextOccurrenceUtcForRule", () => {
  it("returns next slot today before window", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 8, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    ).toJSDate();
    const r = rule({
      id: "x",
      windowStartMinute: 9 * 60,
      windowEndMinute: 10 * 60,
      intervalMinutes: 60,
      daysMask: "1111111",
    });
    const next = computeNextOccurrenceUtcForRule(r, now, "Europe/Moscow");
    expect(next).not.toBeNull();
    const label = formatNextReminderLabel(next!, "Europe/Moscow");
    expect(label).toMatch(/09:00/);
  });

  it("returns next interval today when now is inside window", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 9, minute: 10, second: 0 },
      { zone: "Europe/Moscow" },
    ).toJSDate();
    const r = rule({
      id: "inside-window",
      windowStartMinute: 9 * 60,
      windowEndMinute: 11 * 60,
      intervalMinutes: 30,
      daysMask: "1111111",
    });
    const next = computeNextOccurrenceUtcForRule(r, now, "Europe/Moscow");
    expect(next).not.toBeNull();
    expect(formatNextReminderLabel(next!, "Europe/Moscow")).toMatch(/09:30/);
  });

  it("returns first slot on next allowed day when today's window is over", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 23, minute: 0, second: 0 }, // Tue
      { zone: "Europe/Moscow" },
    ).toJSDate();
    const r = rule({
      id: "next-day",
      windowStartMinute: 9 * 60,
      windowEndMinute: 10 * 60,
      intervalMinutes: 60,
      // Mon + Wed only; Tue should skip to Wed
      daysMask: "1010000",
    });
    const next = computeNextOccurrenceUtcForRule(r, now, "Europe/Moscow");
    expect(next).not.toBeNull();
    const dt = DateTime.fromJSDate(next!, { zone: "Europe/Moscow" });
    expect(dt.weekday).toBe(3);
    expect(dt.hour).toBe(9);
    expect(dt.minute).toBe(0);
  });

  it("uses rule timezone and can shift weekday vs app fallback timezone", () => {
    const nowUtc = DateTime.fromObject(
      { year: 2026, month: 4, day: 27, hour: 22, minute: 30, second: 0 },
      { zone: "UTC" },
    ).toJSDate();
    const r = rule({
      id: "tz-boundary",
      timezone: "Asia/Vladivostok", // UTC+10, already next local day
      windowStartMinute: 9 * 60,
      windowEndMinute: 9 * 60,
      intervalMinutes: 60,
      daysMask: "0100000", // Tue only
    });
    const next = computeNextOccurrenceUtcForRule(r, nowUtc, "Europe/Moscow");
    expect(next).not.toBeNull();
    const local = DateTime.fromJSDate(next!, { zone: "Asia/Vladivostok" });
    expect(local.weekday).toBe(2);
    expect(local.hour).toBe(9);
    expect(local.minute).toBe(0);
  });
});

describe("countPlannedHomeReminderOccurrencesInUtcRange", () => {
  it("counts slots_v1 times on a weekday within app-day range", () => {
    const dayStart = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 0, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    );
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();
    const r = rule({
      id: "s",
      linkedObjectType: "rehab_program",
      linkedObjectId: "p1",
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["09:00", "12:00", "15:00"], dayFilter: "weekdays" },
    });
    expect(countPlannedHomeReminderOccurrencesInUtcRange([r], rangeStart, rangeEnd)).toBe(3);
  });
});
