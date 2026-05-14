import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATIENT_HOME_DAILY_WARMUP_REPEAT_COOLDOWN_MINUTES,
  DEFAULT_PATIENT_HOME_WARMUP_SKIP_TO_NEXT_AVAILABLE_ENABLED,
  DEFAULT_PATIENT_TREATMENT_PLAN_ITEM_DONE_REPEAT_COOLDOWN_MINUTES,
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
  parsePatientHomeWarmupSkipToNextAvailableEnabled,
  parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes,
} from "./patientHomeRepeatCooldownSettings";

describe("patientHomeRepeatCooldownSettings", () => {
  it("parsePatientHomeDailyWarmupRepeatCooldownMinutes clamps and unwraps value", () => {
    expect(parsePatientHomeDailyWarmupRepeatCooldownMinutes({ value: 10 })).toBe(10);
    expect(parsePatientHomeDailyWarmupRepeatCooldownMinutes({ value: 3 })).toBe(5);
    expect(parsePatientHomeDailyWarmupRepeatCooldownMinutes({ value: 999 })).toBe(180);
  });

  it("parsePatientHomeDailyWarmupRepeatCooldownMinutes defaults on garbage", () => {
    expect(parsePatientHomeDailyWarmupRepeatCooldownMinutes(null)).toBe(
      DEFAULT_PATIENT_HOME_DAILY_WARMUP_REPEAT_COOLDOWN_MINUTES,
    );
    expect(parsePatientHomeDailyWarmupRepeatCooldownMinutes({ value: null })).toBe(
      DEFAULT_PATIENT_HOME_DAILY_WARMUP_REPEAT_COOLDOWN_MINUTES,
    );
    expect(parsePatientHomeDailyWarmupRepeatCooldownMinutes({ value: "x" })).toBe(
      DEFAULT_PATIENT_HOME_DAILY_WARMUP_REPEAT_COOLDOWN_MINUTES,
    );
  });

  it("parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes matches warmup parser shape", () => {
    expect(parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes({ value: 30 })).toBe(30);
    expect(parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes(undefined)).toBe(
      DEFAULT_PATIENT_TREATMENT_PLAN_ITEM_DONE_REPEAT_COOLDOWN_MINUTES,
    );
  });

  it("parsePatientHomeWarmupSkipToNextAvailableEnabled", () => {
    expect(parsePatientHomeWarmupSkipToNextAvailableEnabled({ value: false })).toBe(false);
    expect(parsePatientHomeWarmupSkipToNextAvailableEnabled({ value: "false" })).toBe(false);
    expect(parsePatientHomeWarmupSkipToNextAvailableEnabled({ value: true })).toBe(true);
    expect(parsePatientHomeWarmupSkipToNextAvailableEnabled({ value: "true" })).toBe(true);
    expect(parsePatientHomeWarmupSkipToNextAvailableEnabled({ value: null })).toBe(
      DEFAULT_PATIENT_HOME_WARMUP_SKIP_TO_NEXT_AVAILABLE_ENABLED,
    );
  });
});
