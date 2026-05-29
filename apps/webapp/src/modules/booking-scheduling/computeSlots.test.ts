import { describe, expect, it } from "vitest";
import {
  generateSlotsFromFree,
  isChainFree,
  pickWorkingHours,
  subtractBusy,
  workingIntervalsForDate,
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
});
