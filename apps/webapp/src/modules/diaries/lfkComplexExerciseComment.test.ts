import { describe, expect, it } from "vitest";
import { effectiveLfkComplexExerciseComment } from "./lfkComplexExerciseComment";

describe("effectiveLfkComplexExerciseComment", () => {
  it("uses local override when non-empty after trim", () => {
    expect(
      effectiveLfkComplexExerciseComment({
        comment: "Из шаблона",
        localComment: "  Для пациента  ",
      }),
    ).toBe("Для пациента");
  });

  it("falls back to frozen comment when local empty or null", () => {
    expect(
      effectiveLfkComplexExerciseComment({
        comment: "Шаблон",
        localComment: null,
      }),
    ).toBe("Шаблон");
    expect(
      effectiveLfkComplexExerciseComment({
        comment: "Шаблон",
        localComment: "   ",
      }),
    ).toBe("Шаблон");
  });

  it("returns null when both absent", () => {
    expect(
      effectiveLfkComplexExerciseComment({
        comment: null,
        localComment: null,
      }),
    ).toBeNull();
  });
});
