import { describe, expect, it } from "vitest";
import type { TreatmentProgramLibraryRow } from "./treatmentProgramLibraryTypes";
import {
  buildLfkComplexLibraryFilterMeta,
  filterTreatmentProgramLibraryPickerRows,
  treatmentProgramLibraryPickerEmptyMessage,
  treatmentProgramLibraryPickerFiltersActive,
} from "./treatmentProgramLibraryPickerFilters";
import type { Template } from "@/modules/lfk-templates/types";

describe("treatmentProgramLibraryPickerFilters", () => {
  const rows: TreatmentProgramLibraryRow[] = [
    {
      id: "ex-1",
      title: "Spine strength",
      regionCodes: ["spine"],
      loadType: "strength",
    },
    {
      id: "ex-2",
      title: "Knee stretch",
      regionCodes: ["knee"],
      loadType: "stretch",
    },
    {
      id: "ex-3",
      title: "No meta",
      regionCodes: [],
      loadType: null,
    },
  ];

  it("filters by region and load together (AND)", () => {
    const out = filterTreatmentProgramLibraryPickerRows(rows, {
      searchQuery: "",
      regionCode: "spine",
      loadType: "strength",
      applyRegionLoadFilters: true,
    });
    expect(out.map((r) => r.id)).toEqual(["ex-1"]);
  });

  it("exercise without region/load does not match concrete region filter", () => {
    const out = filterTreatmentProgramLibraryPickerRows(rows, {
      searchQuery: "",
      regionCode: "spine",
      loadType: null,
      applyRegionLoadFilters: true,
    });
    expect(out.map((r) => r.id)).toEqual(["ex-1"]);
  });

  it("empty message distinguishes filtered vs empty catalog", () => {
    expect(
      treatmentProgramLibraryPickerEmptyMessage({
        baseListLength: 2,
        filteredListLength: 0,
        filtersActive: true,
      }),
    ).toBe("Ничего не найдено по фильтрам.");
    expect(
      treatmentProgramLibraryPickerEmptyMessage({
        baseListLength: 0,
        filteredListLength: 0,
        filtersActive: false,
      }),
    ).toBe("Нет записей для выбранного типа.");
  });

  it("filtersActive is true when search or region/load set", () => {
    expect(
      treatmentProgramLibraryPickerFiltersActive({
        searchQuery: "колено",
        regionCode: null,
        loadType: null,
        applyRegionLoadFilters: true,
      }),
    ).toBe(true);
    expect(
      treatmentProgramLibraryPickerFiltersActive({
        searchQuery: "",
        regionCode: "spine",
        loadType: null,
        applyRegionLoadFilters: false,
      }),
    ).toBe(false);
  });

  it("lfk complex meta matches any constituent exercise load/region", () => {
    const template: Template = {
      id: "tpl-1",
      title: "C",
      description: null,
      status: "published",
      createdBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      exercises: [
        { id: "row-1", templateId: "tpl-1", exerciseId: "e1", sortOrder: 0, reps: null, sets: null, side: null, maxPain0_10: null, comment: null },
        { id: "row-2", templateId: "tpl-1", exerciseId: "e2", sortOrder: 1, reps: null, sets: null, side: null, maxPain0_10: null, comment: null },
      ],
    };
    const meta = buildLfkComplexLibraryFilterMeta(
      template,
      {
        e1: { regionRefIds: ["reg-spine"], loadType: "strength" },
        e2: { regionRefIds: [], loadType: null },
      },
      { "reg-spine": "spine" },
    );
    expect(meta.regionCodes).toEqual(["spine"]);
    expect(meta.loadTypes).toEqual(["strength"]);

    const complexRow: TreatmentProgramLibraryRow = {
      id: "tpl-1",
      title: "Complex",
      ...meta,
    };
    expect(
      filterTreatmentProgramLibraryPickerRows([complexRow], {
        searchQuery: "",
        regionCode: "spine",
        loadType: "strength",
        applyRegionLoadFilters: true,
      }).length,
    ).toBe(1);
  });
});
