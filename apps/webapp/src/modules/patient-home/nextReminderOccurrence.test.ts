import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  computeNextOccurrenceUtcForRule,
  formatNextReminderLabel,
  formatPatientHomeNextReminderHeadline,
  formatReminderMuteRemainingRu,
  hasConfiguredHomeLinkedReminders,
  pickNextHomeReminder,
  reminderScheduleEvaluationInstant,
  countPlannedHomeReminderOccurrencesInUtcRange,
  countWarmupReminderSlotsInUtcRange,
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
    quietHoursStartMinute: null,
    quietHoursEndMinute: null,
    notificationTopicCode: "exercise_reminders",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("reminderScheduleEvaluationInstant", () => {
  it("returns now when mute is absent or expired", () => {
    const now = new Date("2026-05-09T12:00:00.000Z");
    expect(reminderScheduleEvaluationInstant(now, null).getTime()).toBe(now.getTime());
    expect(reminderScheduleEvaluationInstant(now, "").getTime()).toBe(now.getTime());
    expect(reminderScheduleEvaluationInstant(now, "2026-05-09T11:00:00.000Z").getTime()).toBe(now.getTime());
  });

  it("returns muted-until when it is after now", () => {
    const now = new Date("2026-05-09T12:00:00.000Z");
    const until = new Date("2026-05-09T18:00:00.000Z");
    expect(reminderScheduleEvaluationInstant(now, until.toISOString()).getTime()).toBe(until.getTime());
  });
});

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

  it("includes custom linked type", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 10, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    ).toJSDate();
    const next = pickNextHomeReminder(
      [
        rule({
          id: "c",
          linkedObjectType: "custom",
          linkedObjectId: null,
          customTitle: "T",
          windowStartMinute: 12 * 60,
          windowEndMinute: 12 * 60,
          intervalMinutes: 1440,
        }),
      ],
      now,
      "Europe/Moscow",
    );
    expect(next?.rule.id).toBe("c");
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

describe("formatPatientHomeNextReminderHeadline", () => {
  const zone = "Europe/Moscow";

  it("uses minutes when same day under one hour", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 10, minute: 0, second: 0 },
      { zone },
    ).toJSDate();
    const next = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 10, minute: 25, second: 0 },
      { zone },
    ).toJSDate();
    expect(formatPatientHomeNextReminderHeadline(next, now, zone)).toBe("Через 25 минут");
  });

  it("uses hours when same day one hour or more", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 8, minute: 0, second: 0 },
      { zone },
    ).toJSDate();
    const next = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 11, minute: 10, second: 0 },
      { zone },
    ).toJSDate();
    expect(formatPatientHomeNextReminderHeadline(next, now, zone)).toBe("Через 4 часа");
  });

  it("returns Завтра for next calendar day", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 22, minute: 0, second: 0 },
      { zone },
    ).toJSDate();
    const next = DateTime.fromObject(
      { year: 2026, month: 5, day: 10, hour: 9, minute: 15, second: 0 },
      { zone },
    ).toJSDate();
    expect(formatPatientHomeNextReminderHeadline(next, now, zone)).toBe("Завтра в 09:15");
  });

  it("uses accusative weekday after tomorrow", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 10, minute: 0, second: 0 },
      { zone },
    ).toJSDate(); // Sat
    const next = DateTime.fromObject(
      { year: 2026, month: 5, day: 11, hour: 12, minute: 0, second: 0 },
      { zone },
    ).toJSDate(); // Mon
    expect(formatPatientHomeNextReminderHeadline(next, now, zone)).toBe("В понедельник в 12:00");
  });

  it("uses Во вторник", () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 9, hour: 10, minute: 0, second: 0 },
      { zone },
    ).toJSDate();
    const next = DateTime.fromObject(
      { year: 2026, month: 5, day: 12, hour: 8, minute: 0, second: 0 },
      { zone },
    ).toJSDate(); // Tue
    expect(formatPatientHomeNextReminderHeadline(next, now, zone)).toBe("Во вторник в 08:00");
  });
});

describe("formatReminderMuteRemainingRu", () => {
  it("formats minutes under one hour", () => {
    const now = new Date("2026-05-09T10:00:00.000Z");
    const until = new Date("2026-05-09T10:44:00.000Z");
    expect(formatReminderMuteRemainingRu(until.toISOString(), now)).toBe("44 минуты");
  });

  it("formats hours under one day", () => {
    const now = new Date("2026-05-09T10:00:00.000Z");
    const until = new Date("2026-05-09T15:00:00.000Z");
    expect(formatReminderMuteRemainingRu(until.toISOString(), now)).toBe("5 часов");
  });

  it("formats days when 24h or more", () => {
    const now = new Date("2026-05-09T10:00:00.000Z");
    const until = new Date("2026-05-11T10:00:00.000Z");
    expect(formatReminderMuteRemainingRu(until.toISOString(), now)).toBe("2 дня");
  });
});

describe("hasConfiguredHomeLinkedReminders", () => {
  it("is false without linked enabled rules", () => {
    expect(hasConfiguredHomeLinkedReminders([])).toBe(false);
    expect(
      hasConfiguredHomeLinkedReminders([
        rule({
          id: "x",
          enabled: false,
          linkedObjectType: "content_page",
          linkedObjectId: "a",
        }),
      ]),
    ).toBe(false);
  });

  it("is true with enabled home-linked rule", () => {
    expect(
      hasConfiguredHomeLinkedReminders([
        rule({ id: "x", linkedObjectType: "content_page", linkedObjectId: "a" }),
      ]),
    ).toBe(true);
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

  it("counts custom reminders in planned total", () => {
    const dayStart = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 0, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    );
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();
    const r = rule({
      id: "custom-day",
      linkedObjectType: "custom",
      linkedObjectId: null,
      customTitle: "Свой текст",
      windowStartMinute: 9 * 60,
      windowEndMinute: 11 * 60,
      intervalMinutes: 60,
      scheduleType: "interval_window",
      scheduleData: null,
    });
    expect(countPlannedHomeReminderOccurrencesInUtcRange([r], rangeStart, rangeEnd)).toBe(3);
  });
});

describe("countWarmupReminderSlotsInUtcRange", () => {
  it("returns 3 when no warmup rules match", () => {
    const dayStart = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 0, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    );
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();
    expect(countWarmupReminderSlotsInUtcRange([], rangeStart, rangeEnd)).toBe(3);
    expect(
      countWarmupReminderSlotsInUtcRange(
        [rule({ id: "g", reminderIntent: "generic", scheduleType: "slots_v1", scheduleData: { timesLocal: ["09:00"], dayFilter: "weekdays" } })],
        rangeStart,
        rangeEnd,
      ),
    ).toBe(3);
  });

  it("counts warmup slots_v1 on a weekday (no linkedObject required)", () => {
    const dayStart = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 0, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    );
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();
    const r = rule({
      id: "w",
      linkedObjectType: null,
      linkedObjectId: null,
      reminderIntent: "warmup",
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["09:00", "12:00", "15:00"], dayFilter: "weekdays" },
    });
    expect(countWarmupReminderSlotsInUtcRange([r], rangeStart, rangeEnd)).toBe(3);
  });

  it("counts warmup interval_window fires in range", () => {
    const dayStart = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 0, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    );
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();
    const r = rule({
      id: "wi",
      linkedObjectType: null,
      linkedObjectId: null,
      reminderIntent: "warmup",
      scheduleType: "interval_window",
      scheduleData: null,
      windowStartMinute: 9 * 60,
      windowEndMinute: 11 * 60,
      intervalMinutes: 60,
    });
    expect(countWarmupReminderSlotsInUtcRange([r], rangeStart, rangeEnd)).toBe(3);
  });

  it("ignores disabled warmup rules", () => {
    const dayStart = DateTime.fromObject(
      { year: 2026, month: 4, day: 28, hour: 0, minute: 0, second: 0 },
      { zone: "Europe/Moscow" },
    );
    const rangeStart = dayStart.toUTC().toJSDate();
    const rangeEnd = dayStart.plus({ days: 1 }).toUTC().toJSDate();
    const r = rule({
      id: "off",
      enabled: false,
      reminderIntent: "warmup",
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["09:00", "12:00"], dayFilter: "weekdays" },
    });
    expect(countWarmupReminderSlotsInUtcRange([r], rangeStart, rangeEnd)).toBe(3);
  });
});
