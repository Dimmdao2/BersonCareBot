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
    expect(pickers.lfkComplexes[0]?.expandLines).toEqual([
      expect.objectContaining({ itemRefId: "e1", snapshot: expect.objectContaining({ title: "Упражнение" }) }),
      expect.objectContaining({ itemRefId: "e2" }),
    ]);
  });

  it("maps template exercise load into lfkComplex expandLines", () => {
    const exercises = [
      minimalExercise({ id: "e1", title: "Упражнение", difficulty1_10: 3, regionRefIds: [] }),
    ];
    const lfkTemplates = [
      {
        id: "tpl-1",
        title: "Комплекс",
        description: null,
        status: "published" as const,
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        exercises: [
          {
            id: "line-1",
            templateId: "tpl-1",
            exerciseId: "e1",
            exerciseTitle: "Упражнение",
            sortOrder: 0,
            reps: 10,
            sets: 3,
            side: null,
            maxPain0_10: 4,
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
    });
    expect(pickers.lfkComplexes[0]?.expandLines?.[0]?.loadSettings).toEqual({
      reps: 10,
      sets: 3,
      maxPain: 4,
    });
  });

  it("builds expandLines for test sets", () => {
    const pickers = buildTreatmentProgramLibraryPickers({
      exercises: [],
      lfkTemplates: [],
      testSets: [
        {
          id: "set-1",
          title: "Набор",
          description: null,
          publicationStatus: "published",
          isArchived: false,
          createdBy: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          items: [
            {
              id: "line-1",
              testSetId: "set-1",
              testId: "test-a",
              sortOrder: 0,
              comment: null,
              test: {
                id: "test-a",
                title: "Тест A",
                testType: null,
                isArchived: false,
                bodyRegionId: null,
                bodyRegionIds: [],
                previewMedia: { mediaUrl: "https://example.com/t.jpg", mediaType: "image", sortOrder: 0 },
              },
            },
          ],
        },
      ],
      clinicalTests: [],
      recommendations: [],
      contentPagesAll: [],
    });
    expect(pickers.testSets[0]?.expandLines).toEqual([
      expect.objectContaining({
        itemRefId: "test-a",
        snapshot: expect.objectContaining({ title: "Тест A" }),
      }),
    ]);
  });
});
