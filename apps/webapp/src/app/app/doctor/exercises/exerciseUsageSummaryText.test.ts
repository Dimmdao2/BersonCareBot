import { describe, expect, it } from "vitest";
import { EMPTY_EXERCISE_USAGE_SNAPSHOT } from "@/modules/lfk-exercises/types";
import { exerciseUsageSummaryLines, vNaForm } from "./exerciseUsageSummaryText";

describe("exerciseUsageSummaryText", () => {
  it("vNaForm uses singular for 1 and 21", () => {
    expect(vNaForm(1, "коте", "котах", "котах")).toBe("В 1 коте");
    expect(vNaForm(21, "коте", "котах", "котах")).toBe("В 21 коте");
  });

  it("vNaForm uses few for 2–4 except 12–14", () => {
    expect(vNaForm(2, "коте", "котах", "котах")).toBe("В 2 котах");
    expect(vNaForm(4, "коте", "котах", "котах")).toBe("В 4 котах");
    expect(vNaForm(12, "коте", "котах", "котах")).toBe("В 12 котах");
  });

  it("vNaForm uses many for 5, 11, 22", () => {
    expect(vNaForm(5, "коте", "котах", "котах")).toBe("В 5 котах");
    expect(vNaForm(11, "коте", "котах", "котах")).toBe("В 11 котах");
    expect(vNaForm(22, "коте", "котах", "котах")).toBe("В 22 котах");
  });

  it("exerciseUsageSummaryLines includes completed history line", () => {
    const lines = exerciseUsageSummaryLines({
      ...EMPTY_EXERCISE_USAGE_SNAPSHOT,
      completedTreatmentProgramInstanceCount: 1,
    });
    expect(lines.some((l) => l.includes("завершённой программе") && l.includes("история"))).toBe(true);
  });
});
