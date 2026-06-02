import { describe, expect, it } from "vitest";
import { buildTreatmentProgramLibraryPickers } from "./buildTreatmentProgramLibraryPickers";
import type { Exercise } from "@/modules/lfk-exercises/types";
import type { Template } from "@/modules/lfk-templates/types";

function minimalExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    title: "Упр",
    description: null,
    regionRefId: "reg-1",
    regionRefIds: ["reg-1", "reg-2"],
    loadType: "strength",
    difficulty1_10: null,
    contraindications: null,
    tags: null,
    isArchived: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    media: [],
    ...overrides,
  };
}

describe("buildTreatmentProgramLibraryPickers", () => {
  it("maps exercise region ref ids to codes for library filters", () => {
    const pickers = buildTreatmentProgramLibraryPickers({
      exercises: [minimalExercise()],
      lfkTemplates: [],
      testSets: [],
      clinicalTests: [],
      recommendations: [],
      contentPagesAll: [],
      bodyRegionIdToCode: { "reg-1": "spine", "reg-2": "knee" },
    });
    expect(pickers.exercises[0]?.regionCodes).toEqual(["spine", "knee"]);
    expect(pickers.exercises[0]?.loadType).toBe("strength");
  });

  it("builds lfk complex filter meta from template exercises", () => {
    const exercises = [
      minimalExercise({ id: "e1", regionRefIds: ["reg-1"], loadType: "strength" }),
      minimalExercise({ id: "e2", regionRefIds: [], loadType: null }),
    ];
    const lfkTemplates: Template[] = [
      {
        id: "tpl-1",
        title: "Комплекс",
        description: null,
        status: "published",
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        exercises: [
          {
            id: "row-1",
            templateId: "tpl-1",
            exerciseId: "e1",
            sortOrder: 0,
            reps: null,
            sets: null,
            side: null,
            maxPain0_10: null,
            comment: null,
          },
          {
            id: "row-2",
            templateId: "tpl-1",
            exerciseId: "e2",
            sortOrder: 1,
            reps: null,
            sets: null,
            side: null,
            maxPain0_10: null,
            comment: null,
          },
        ],
      },
    ];
    const pickers = buildTreatmentProgramLibraryPickers({
      exercises,
      lfkTemplates,
      testSets: [],
      clinicalTests: [],
      recommendations: [],
      contentPagesAll: [],
      bodyRegionIdToCode: { "reg-1": "spine" },
    });
    expect(pickers.lfkComplexes[0]?.regionCodes).toEqual(["spine"]);
    expect(pickers.lfkComplexes[0]?.loadTypes).toEqual(["strength"]);
    expect(pickers.lfkComplexes[0]?.matchesMissingRegion).toBe(true);
    expect(pickers.lfkComplexes[0]?.matchesMissingLoad).toBe(true);
  });
});
