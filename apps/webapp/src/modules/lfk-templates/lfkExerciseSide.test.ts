import { describe, expect, it } from "vitest";
import { lfkExerciseSideRu, parseLfkExerciseSide } from "./lfkExerciseSide";

describe("lfkExerciseSide", () => {
  it("parseLfkExerciseSide accepts extended values", () => {
    expect(parseLfkExerciseSide("damaged")).toBe("damaged");
    expect(parseLfkExerciseSide("healthy")).toBe("healthy");
    expect(parseLfkExerciseSide("left")).toBe("left");
    expect(parseLfkExerciseSide("")).toBe(null);
    expect(parseLfkExerciseSide("invalid")).toBe(null);
  });

  it("lfkExerciseSideRu maps to Russian labels", () => {
    expect(lfkExerciseSideRu("damaged")).toBe("Повреждённая");
    expect(lfkExerciseSideRu("healthy")).toBe("Здоровая");
    expect(lfkExerciseSideRu("both")).toBe("Обе");
  });
});
