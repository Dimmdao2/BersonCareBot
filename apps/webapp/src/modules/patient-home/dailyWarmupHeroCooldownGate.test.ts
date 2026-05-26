import { describe, expect, it } from "vitest";
import { shouldActivateDailyWarmupHeroCooldown } from "./dailyWarmupHeroCooldownGate";

describe("shouldActivateDailyWarmupHeroCooldown", () => {
  it("activates only when cooldown active and exactly one warmup", () => {
    expect(shouldActivateDailyWarmupHeroCooldown({ dailyWarmupCount: 1, cooldownActive: true })).toBe(true);
    expect(shouldActivateDailyWarmupHeroCooldown({ dailyWarmupCount: 1, cooldownActive: false })).toBe(false);
    expect(shouldActivateDailyWarmupHeroCooldown({ dailyWarmupCount: 2, cooldownActive: true })).toBe(false);
    expect(shouldActivateDailyWarmupHeroCooldown({ dailyWarmupCount: 0, cooldownActive: true })).toBe(false);
  });
});
