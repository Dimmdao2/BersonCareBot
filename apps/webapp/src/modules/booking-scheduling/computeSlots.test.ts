import { describe, expect, it } from "vitest";
import {
  computeNearestFreeWindowFromData,
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
        breaks: [],
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

    it("zero breaks: single working interval", () => {
      const intervals = splitByBreak(
        perDay({ startMinute: 9 * 60, endMinute: 18 * 60, breaks: [] }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(9);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(18);
    });

    it("single break (breaks[]) splits the day into two intervals", () => {
      const intervals = splitByBreak(
        perDay({ startMinute: 11 * 60, endMinute: 19 * 60, breaks: [{ startMinute: 14 * 60, endMinute: 15 * 60 }] }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(2);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(14);
      expect(new Date(intervals[1]!.startMs).getUTCHours()).toBe(15);
    });

    it("legacy single break (breakStartMinute/breakEndMinute) still works", () => {
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

    it("two breaks produce three working intervals", () => {
      // 9:00–18:00 with breaks at 12–13 and 15–16 → three windows: 9–12, 13–15, 16–18
      const intervals = splitByBreak(
        perDay({
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          breaks: [
            { startMinute: 12 * 60, endMinute: 13 * 60 },
            { startMinute: 15 * 60, endMinute: 16 * 60 },
          ],
        }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(3);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(9);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(12);
      expect(new Date(intervals[1]!.startMs).getUTCHours()).toBe(13);
      expect(new Date(intervals[1]!.endMs).getUTCHours()).toBe(15);
      expect(new Date(intervals[2]!.startMs).getUTCHours()).toBe(16);
      expect(new Date(intervals[2]!.endMs).getUTCHours()).toBe(18);
    });

    it("three breaks produce four working intervals", () => {
      // 8:00–20:00, breaks at 10–11, 13–14, 16–17
      const intervals = splitByBreak(
        perDay({
          startMinute: 8 * 60,
          endMinute: 20 * 60,
          breaks: [
            { startMinute: 10 * 60, endMinute: 11 * 60 },
            { startMinute: 13 * 60, endMinute: 14 * 60 },
            { startMinute: 16 * 60, endMinute: 17 * 60 },
          ],
        }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(4);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(8);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(10);
      expect(new Date(intervals[3]!.startMs).getUTCHours()).toBe(17);
      expect(new Date(intervals[3]!.endMs).getUTCHours()).toBe(20);
    });

    it("break flush at day start leaves only the tail interval", () => {
      // 9:00–18:00, break starts exactly at dayStart (9:00–10:00) → only 10–18
      const intervals = splitByBreak(
        perDay({
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          breaks: [{ startMinute: 9 * 60, endMinute: 10 * 60 }],
        }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(10);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(18);
    });

    it("break flush at day end leaves only the head interval", () => {
      // 9:00–18:00, break at 17:00–18:00 → only 9–17
      const intervals = splitByBreak(
        perDay({
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          breaks: [{ startMinute: 17 * 60, endMinute: 18 * 60 }],
        }),
        "2026-06-01",
        "UTC",
        0,
      );
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(9);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(17);
    });

    it("breaks[] takes priority over legacy breakStartMinute/breakEndMinute", () => {
      // breaks[] has two breaks; legacy scalar says different single break — breaks[] wins
      const intervals = splitByBreak(
        perDay({
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          breakStartMinute: 14 * 60,
          breakEndMinute: 15 * 60,
          breaks: [
            { startMinute: 12 * 60, endMinute: 13 * 60 },
            { startMinute: 16 * 60, endMinute: 17 * 60 },
          ],
        }),
        "2026-06-01",
        "UTC",
        0,
      );
      // breaks[] controls: 3 intervals (9–12, 13–16, 17–18)
      expect(intervals).toHaveLength(3);
    });

    it("falls back to weekday hours when no per-date row (backward-compatible)", () => {
      const intervals = workingIntervalsForDate("2026-06-01", "UTC", weekday, 0, undefined);
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0]!.startMs).getUTCHours()).toBe(9);
      expect(new Date(intervals[0]!.endMs).getUTCHours()).toBe(18);
    });
  });
});

describe("computeNearestFreeWindowFromData (C3 — ближайшее свободное окно)", () => {
  const TZ = "Europe/Moscow";
  const DAY = "2026-06-01"; // 09:00 MSK = 06:00Z, 18:00 MSK = 15:00Z

  function workDay(partial: Partial<WorkingDayRow> = {}): WorkingDayRow {
    return {
      workDate: DAY,
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      breakStartMinute: null,
      breakEndMinute: null,
      breaks: [],
      isClosed: false,
      ...partial,
    };
  }

  it("clamps window start to now and ends at the next busy block", () => {
    const busy = [{ startAt: "2026-06-01T08:00:00.000Z", endAt: "2026-06-01T09:00:00.000Z" }];
    const nowMs = Date.parse("2026-06-01T07:30:00.000Z");
    expect(computeNearestFreeWindowFromData(DAY, TZ, [], workDay(), busy, nowMs)).toEqual({
      from: "2026-06-01T07:30:00.000Z",
      to: "2026-06-01T08:00:00.000Z",
    });
  });

  it("returns the free interval after a busy block when now is inside busy", () => {
    const busy = [{ startAt: "2026-06-01T07:00:00.000Z", endAt: "2026-06-01T09:00:00.000Z" }];
    const nowMs = Date.parse("2026-06-01T08:00:00.000Z");
    expect(computeNearestFreeWindowFromData(DAY, TZ, [], workDay(), busy, nowMs)).toEqual({
      from: "2026-06-01T09:00:00.000Z",
      to: "2026-06-01T15:00:00.000Z",
    });
  });

  it("returns null when the day is fully busy", () => {
    const busy = [{ startAt: "2026-06-01T06:00:00.000Z", endAt: "2026-06-01T15:00:00.000Z" }];
    const nowMs = Date.parse("2026-06-01T06:00:00.000Z");
    expect(computeNearestFreeWindowFromData(DAY, TZ, [], workDay(), busy, nowMs)).toBeNull();
  });

  it("returns null when the day is closed", () => {
    const nowMs = Date.parse("2026-06-01T06:00:00.000Z");
    expect(
      computeNearestFreeWindowFromData(
        DAY,
        TZ,
        [],
        workDay({ isClosed: true, startMinute: null, endMinute: null }),
        [],
        nowMs,
      ),
    ).toBeNull();
  });

  it("returns null when now is past working hours", () => {
    const nowMs = Date.parse("2026-06-01T16:00:00.000Z"); // 19:00 MSK
    expect(computeNearestFreeWindowFromData(DAY, TZ, [], workDay(), [], nowMs)).toBeNull();
  });
});
