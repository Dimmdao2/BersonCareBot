import { describe, expect, it } from "vitest";
import { editorLinesToTemplateExerciseInputs } from "./templateExercisePayload";

describe("editorLinesToTemplateExerciseInputs", () => {
  it("assigns sort_order from visual order after reorder", () => {
    const payload = editorLinesToTemplateExerciseInputs([
      {
        exerciseId: "c",
        reps: 10,
        sets: 2,
        side: "both",
        maxPain0_10: 3,
        comment: "x",
      },
      {
        exerciseId: "a",
        reps: null,
        sets: null,
        side: null,
        maxPain0_10: null,
        comment: null,
      },
    ]);
    expect(payload.map((p) => p.exerciseId)).toEqual(["c", "a"]);
    expect(payload.map((p) => p.sortOrder)).toEqual([0, 1]);
  });
});
