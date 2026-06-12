import { describe, expect, it } from "vitest";
import {
  generateSlotsFromFree,
  isChainFree,
  pickWorkingHours,
  splitByBreak,
  subtractBusy,
  workingIntervalsForDate,
  type WorkingDayRow,
} from "./computeSlots";

describe("booking-scheduling computeSlots", () => {
  it("uses default working hours when none configured", () => {
    expect(pickWorkingHours([])).toHaveLength(5);
  });

  it("subtracts busy intervals from working time", () => {
    const free = subtractBusy(
      [{ startMs: 0, endMs: 4 * 60 * 60_000 }],
      [{ startMs: 60 * 60_000, endMs: 2 * 60 * 60_000 }],
    );
    expect(free).toEqual([
      { startMs: 0, endMs: 60 * 60_000 },
      { startMs: 2 * 60 * 60_000, endMs: 4 * 60 * 60_000 },
    ]);
  });

  it("generates slots of requested duration", () => {
    const slots = generateSlotsFromFree([{ startMs: 0, endMs: 3 * 60 * 60_000 }], 60, 60);
    expect(slots).toHaveLength(3);
    expect(new Date(slots[0]!.endAt).getTime() - new Date(slots[0]!.startAt).getTime()).toBe(60 * 60_000);
  });

  it("validates multi-slot chain is free", () => {
    const busy = [{ startAt: "2026-06-01T11:00:00.000Z", endAt: "2026-06-01T12:00:00.000Z" }];
    expect(isChainFree("2026-06-01T09:00:00.000Z", 2, 60, busy)).toBe(true);
    expect(isChainFree("2026-06-01T10:00:00.000Z", 2, 60, busy)).toBe(false);
  });

  it("builds working intervals for a weekday", () => {
    const intervals = workingIntervalsForDate(
      "2026-06-01",
      "UTC",
      [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
      0,
    );
    expect(intervals.length).toBeGreaterThan(0);
  });

  describe("per-date overrides", () => {
    const weekday = [{ weekday: 1, startMinute: 9 * 60, endMinute: 18 * 60 }];

    function perDay(partial: Partial<WorkingDayRow>): WorkingDayRow {
      return {
        workDate: "2026-06-01",
        startMinute: 11 * 60,
        endMinute: 19 * 60,
        breakStartMinute: null,
        breakEndMinute: null,
        isClosed: false,
        ...partial,
      };
    }

    it("per-date row overrides weekday hours for that date", () => {
      const intervals = workingIntervalsForDate("2026-06-01", "UTC", weekday, 0, perDay({}));
      // 11:00–19:00 (override), not 09:00–18:00 (weekday)
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(11);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(19);
    });

    it("closed per-date day yields no working intervals", () => {
      const intervals = workingIntervalsForDate(
        "2026-06-01",
        "UTC",
        weekday,
        0,
        perDay({ isClosed: true, startMinute: null, endMinute: null }),
      );
      expect(intervals).toHaveLength(0);
    });

    it("break splits the day into two intervals", () => {
      const intervals = splitByBreak(
        perDay({ startMinute: 11 * 60, endMinute: 19 * 60, breakStartMinute: 14 * 60, breakEndMinute: 15 * 60 }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(2);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(14);
      expect(new Date(intervals[1]!.startMs).getUTCHours()).toBe(15);
    });

    it("falls back to weekday hours when no per-date row (backward-compatible)", () => {
      const intervals = workingIntervalsForDate("2026-06-01", "UTC", weekday, 0, undefined);
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(9);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(18);
    });
  });
});
