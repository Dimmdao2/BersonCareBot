import { describe, expect, it } from "vitest";
import { patientHomeLocalDayUtcWindow } from "./patientHomeTodayProgress";

describe("patientHomeLocalDayUtcWindow", () => {
  it("returns utc window for local ymd", () => {
    const { start, end } = patientHomeLocalDayUtcWindow("2026-05-20", "Europe/Moscow");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
