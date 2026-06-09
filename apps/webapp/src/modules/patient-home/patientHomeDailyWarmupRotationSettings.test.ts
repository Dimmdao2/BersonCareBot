import { describe, expect, it } from "vitest";
import {
  isValidPatientHomeDailyWarmupRotationTimesPayload,
  parsePatientHomeDailyWarmupRotationEnabled,
  parsePatientHomeDailyWarmupRotationTimes,
} from "./patientHomeDailyWarmupRotationSettings";

describe("patientHomeDailyWarmupRotationSettings", () => {
  it("parsePatientHomeDailyWarmupRotationEnabled defaults false", () => {
    expect(parsePatientHomeDailyWarmupRotationEnabled(null)).toBe(false);
    expect(parsePatientHomeDailyWarmupRotationEnabled({ value: true })).toBe(true);
  });

  it("parsePatientHomeDailyWarmupRotationTimes sorts and dedupes", () => {
    expect(parsePatientHomeDailyWarmupRotationTimes({ value: ["14:00", "8:00", "14:00"] })).toEqual([
      "08:00",
      "14:00",
    ]);
  });

  it("isValidPatientHomeDailyWarmupRotationTimesPayload", () => {
    expect(isValidPatientHomeDailyWarmupRotationTimesPayload(["08:00"])).toBe(true);
    expect(isValidPatientHomeDailyWarmupRotationTimesPayload([])).toBe(false);
    expect(isValidPatientHomeDailyWarmupRotationTimesPayload(["08:00", "08:00"])).toBe(false);
    expect(isValidPatientHomeDailyWarmupRotationTimesPayload(["08:00", "14:00", "20:00", "21:00"])).toBe(false);
  });
});
