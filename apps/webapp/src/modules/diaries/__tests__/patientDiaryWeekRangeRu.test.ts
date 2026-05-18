import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatPatientDiaryWeekRangeRu } from "../patientDiaryWeekRangeRu";

describe("formatPatientDiaryWeekRangeRu", () => {
  it("formats same-year week", () => {
    const mon = DateTime.fromObject({ year: 2026, month: 5, day: 4 }, { zone: "Europe/Moscow" }).startOf("week");
    expect(formatPatientDiaryWeekRangeRu(mon, "Europe/Moscow")).toMatch(/2026/);
    expect(formatPatientDiaryWeekRangeRu(mon, "Europe/Moscow")).toMatch(/—/);
  });

  it("includes both years when week crosses year boundary", () => {
    const mon = DateTime.fromObject({ year: 2025, month: 12, day: 29 }, { zone: "UTC" }).startOf("week");
    const s = formatPatientDiaryWeekRangeRu(mon, "UTC");
    expect(s).toMatch(/2025/);
    expect(s).toMatch(/2026/);
  });
});
