import { describe, expect, it } from "vitest";
import { treatmentProgramItemToRatingTarget } from "./mapProgramItemToTarget";

describe("treatmentProgramItemToRatingTarget", () => {
  it("maps exercise to lfk_exercise", () => {
    expect(treatmentProgramItemToRatingTarget("exercise", "e1")).toEqual({ kind: "lfk_exercise", targetId: "e1" });
  });

  it("maps lesson to content_page", () => {
    expect(treatmentProgramItemToRatingTarget("lesson", "p1")).toEqual({ kind: "content_page", targetId: "p1" });
  });

  it("maps lfk_complex to lfk_complex", () => {
    expect(treatmentProgramItemToRatingTarget("lfk_complex", "c1")).toEqual({ kind: "lfk_complex", targetId: "c1" });
  });

  it("returns null for unsupported types", () => {
    expect(treatmentProgramItemToRatingTarget("clinical_test", "t1")).toEqual({ kind: null, targetId: null });
    expect(treatmentProgramItemToRatingTarget("recommendation", "r1")).toEqual({ kind: null, targetId: null });
  });
});
