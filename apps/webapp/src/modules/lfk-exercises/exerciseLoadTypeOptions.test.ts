import { describe, expect, it } from "vitest";
import { exerciseLoadTypeLabel } from "./exerciseLoadTypeOptions";

describe("exerciseLoadTypeLabel", () => {
  it("returns Russian label for known codes", () => {
    expect(exerciseLoadTypeLabel("strength")).toBe("Силовая");
    expect(exerciseLoadTypeLabel("cardio")).toBe("Кардио");
  });

  it("returns empty for null/undefined/empty", () => {
    expect(exerciseLoadTypeLabel(null)).toBe("");
    expect(exerciseLoadTypeLabel(undefined)).toBe("");
    expect(exerciseLoadTypeLabel("")).toBe("");
  });
});
