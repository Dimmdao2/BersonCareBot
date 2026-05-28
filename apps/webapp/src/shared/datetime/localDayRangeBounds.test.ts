import { DateTime } from "luxon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDayRangeBoundsIso } from "./localDayRangeBounds";

describe("localDayRangeBoundsIso", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(DateTime.fromISO("2026-05-28T12:00:00", { zone: "Europe/Moscow" }).toJSDate());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("week spans 7 local calendar days in Europe/Moscow", () => {
    const { from, to } = localDayRangeBoundsIso("week", "Europe/Moscow");
    expect(from).toBe("2026-05-27T21:00:00.000Z");
    expect(to).toBe("2026-06-03T20:59:59.999Z");
  });
});
