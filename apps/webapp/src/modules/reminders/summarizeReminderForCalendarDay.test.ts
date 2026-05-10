import { describe, expect, it } from "vitest";
import { summarizeReminderForCalendarDay, isSlotsV1DayActive } from "./summarizeReminderForCalendarDay";
import type { ReminderRule } from "./types";
import { DateTime } from "luxon";

const baseRule = (): ReminderRule => ({
  id: "r1",
  integratorUserId: "u1",
  category: "lfk",
  enabled: true,
  intervalMinutes: 60,
  windowStartMinute: 9 * 60,
  windowEndMinute: 21 * 60,
  daysMask: "1111111",
  timezone: "Europe/Moscow",
  fallbackEnabled: true,
  linkedObjectType: "rehab_program",
  linkedObjectId: "inst-1",
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
});

describe("isSlotsV1DayActive", () => {
  const rule = baseRule();
  it("weekdays: Mon active, Sun inactive", () => {
    const data = { timesLocal: ["10:00"], dayFilter: "weekdays" as const };
    const mon = DateTime.fromISO("2026-05-11T12:00:00", { zone: "Europe/Moscow" }); // Monday
    const sun = DateTime.fromISO("2026-05-10T12:00:00", { zone: "Europe/Moscow" });
    expect(isSlotsV1DayActive(data, rule, mon, "Europe/Moscow")).toBe(true);
    expect(isSlotsV1DayActive(data, rule, sun, "Europe/Moscow")).toBe(false);
  });
});

describe("summarizeReminderForCalendarDay", () => {
  it("returns Выключено when disabled", () => {
    const r = { ...baseRule(), enabled: false };
    expect(summarizeReminderForCalendarDay(r, "2026-05-11", "Europe/Moscow")).toBe("Выключено");
  });

  it("slots_v1 weekdays: Monday shows times", () => {
    const r: ReminderRule = {
      ...baseRule(),
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["09:00", "18:00"], dayFilter: "weekdays" },
    };
    expect(summarizeReminderForCalendarDay(r, "2026-05-11", "Europe/Moscow")).toBe("09:00, 18:00");
  });

  it("slots_v1 weekdays: Sunday says no reminders today", () => {
    const r: ReminderRule = {
      ...baseRule(),
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["09:00"], dayFilter: "weekdays" },
    };
    expect(summarizeReminderForCalendarDay(r, "2026-05-10", "Europe/Moscow")).toBe("Сегодня без напоминаний");
  });

  it("interval_window: inactive day", () => {
    const r: ReminderRule = {
      ...baseRule(),
      daysMask: "0111110",
      intervalMinutes: 90,
    };
    expect(summarizeReminderForCalendarDay(r, "2026-05-10", "Europe/Moscow")).toBe("Сегодня выходной по расписанию");
  });

  it("interval_window: active day", () => {
    const r: ReminderRule = {
      ...baseRule(),
      daysMask: "1111111",
      intervalMinutes: 120,
      windowStartMinute: 480,
      windowEndMinute: 1200,
    };
    expect(summarizeReminderForCalendarDay(r, "2026-05-11", "Europe/Moscow")).toBe(
      "08:00–20:00, каждые 120 мин.",
    );
  });

  it("every_n_days: on schedule shows times", () => {
    const r: ReminderRule = {
      ...baseRule(),
      scheduleType: "slots_v1",
      scheduleData: {
        timesLocal: ["08:00", "20:00"],
        dayFilter: "every_n_days",
        everyNDays: 2,
        anchorDate: "2026-05-09",
      },
    };
    expect(summarizeReminderForCalendarDay(r, "2026-05-11", "Europe/Moscow")).toBe("08:00, 20:00");
  });

  it("slots_v1 weekly_mask: respects mask for weekday", () => {
    const r: ReminderRule = {
      ...baseRule(),
      scheduleType: "slots_v1",
      daysMask: "1111111",
      scheduleData: {
        timesLocal: ["12:00"],
        dayFilter: "weekly_mask",
        daysMask: "1011111",
      },
    };
    const tue = "2026-05-12";
    expect(summarizeReminderForCalendarDay(r, tue, "Europe/Moscow")).toBe("Сегодня без напоминаний");
    const wed = "2026-05-13";
    expect(summarizeReminderForCalendarDay(r, wed, "Europe/Moscow")).toBe("12:00");
  });
});
