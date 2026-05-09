import { describe, expect, it } from "vitest";
import { streakFlameOpacity } from "./patientHomeStreakFlameOpacity";

describe("streakFlameOpacity", () => {
  it("returns minimum for zero streak", () => {
    expect(streakFlameOpacity(0)).toBe(0.26);
  });

  it("ramps toward maximum by cap days", () => {
    expect(streakFlameOpacity(14)).toBe(1);
    expect(streakFlameOpacity(100)).toBe(1);
  });

  it("interpolates mid streak", () => {
    expect(streakFlameOpacity(7)).toBeCloseTo(0.63, 5);
  });
});
