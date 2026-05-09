import { describe, expect, it } from "vitest";
import { normalizeSlotsV1ScheduleData } from "./scheduleSlots";

describe("normalizeSlotsV1ScheduleData", () => {
  it("dedupes and sorts times by minute-of-day", () => {
    const res = normalizeSlotsV1ScheduleData({
      timesLocal: ["17:00", "09:00", "09:00"],
      dayFilter: "weekdays",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.timesLocal).toEqual(["09:00", "17:00"]);
  });

  it("rejects empty times list", () => {
    const res = normalizeSlotsV1ScheduleData({ timesLocal: [], dayFilter: "weekdays" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("at least one");
  });

  it("rejects invalid time token", () => {
    const res = normalizeSlotsV1ScheduleData({
      timesLocal: ["25:99"],
      dayFilter: "weekdays",
    });
    expect(res.ok).toBe(false);
  });

  it("requires valid daysMask for weekly_mask", () => {
    expect(
      normalizeSlotsV1ScheduleData({
        timesLocal: ["09:00"],
        dayFilter: "weekly_mask",
        daysMask: "xxx",
      }).ok,
    ).toBe(false);
    const ok = normalizeSlotsV1ScheduleData({
      timesLocal: ["09:00"],
      dayFilter: "weekly_mask",
      daysMask: "1111111",
    });
    expect(ok.ok).toBe(true);
  });
});
