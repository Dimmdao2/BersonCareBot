import { describe, expect, it } from "vitest";
import { formatPatientHomeWarmupCooldownCaption } from "./dailyWarmupHeroCooldown";

describe("formatPatientHomeWarmupCooldownCaption", () => {
  it("uses correct minute forms after «через»", () => {
    expect(formatPatientHomeWarmupCooldownCaption(1)).toBe("Разминка будет доступна через 1 минуту.");
    expect(formatPatientHomeWarmupCooldownCaption(2)).toBe("Разминка будет доступна через 2 минуты.");
    expect(formatPatientHomeWarmupCooldownCaption(5)).toBe("Разминка будет доступна через 5 минут.");
    expect(formatPatientHomeWarmupCooldownCaption(12)).toBe("Разминка будет доступна через 12 минут.");
    expect(formatPatientHomeWarmupCooldownCaption(21)).toBe("Разминка будет доступна через 21 минуту.");
  });
});
