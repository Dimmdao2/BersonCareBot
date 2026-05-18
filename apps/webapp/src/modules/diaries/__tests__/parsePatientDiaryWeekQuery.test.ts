import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { clampDiaryWeekStartNotAfterCurrent, mondayFromPatientDiaryWeekQuery } from "../parsePatientDiaryWeekQuery";

describe("parsePatientDiaryWeekQuery", () => {
  const iana = "Europe/Moscow";

  it("returns null for invalid week param", () => {
    expect(mondayFromPatientDiaryWeekQuery(undefined, iana)).toBeNull();
    expect(mondayFromPatientDiaryWeekQuery("2026-13-40", iana)).toBeNull();
    expect(mondayFromPatientDiaryWeekQuery("nope", iana)).toBeNull();
  });

  it("normalizes any weekday to Monday of that ISO week", () => {
    const m = mondayFromPatientDiaryWeekQuery("2026-05-07", iana);
    expect(m).not.toBeNull();
    expect(m!.weekday).toBe(1);
    expect(m!.toISODate()).toBe("2026-05-04");
  });

  it("clampDiaryWeekStartNotAfterCurrent caps future weeks", () => {
    const now = DateTime.fromObject({ year: 2026, month: 5, day: 18 }, { zone: iana });
    const futureMon = now.plus({ weeks: 3 }).startOf("week");
    const capped = clampDiaryWeekStartNotAfterCurrent(futureMon, now);
    expect(capped.toMillis()).toBe(now.startOf("week").toMillis());
  });
});
