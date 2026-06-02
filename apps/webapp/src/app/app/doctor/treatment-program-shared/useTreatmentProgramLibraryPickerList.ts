import { useMemo } from "react";
import type { TreatmentProgramLibraryPickType } from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryRow } from "./treatmentProgramLibraryTypes";
import {
  filterTreatmentProgramLibraryPickerRows,
  supportsTreatmentProgramLibraryRegionLoadFilters,
  treatmentProgramLibraryPickerEmptyMessage,
  treatmentProgramLibraryPickerFiltersActive,
} from "./treatmentProgramLibraryPickerFilters";

export function useTreatmentProgramLibraryPickerList(input: {
  rows: TreatmentProgramLibraryRow[];
  searchQuery: string;
  regionCode: string | null;
  loadType: string | null;
  pickType: TreatmentProgramLibraryPickType | "exercise" | "lfk_complex" | "clinical_test" | "recommendation" | "lesson";
}) {
  const applyRegionLoadFilters = supportsTreatmentProgramLibraryRegionLoadFilters(input.pickType);

  const filteredRows = useMemo(
    () =>
      filterTreatmentProgramLibraryPickerRows(input.rows, {
        searchQuery: input.searchQuery,
        regionCode: input.regionCode,
        loadType: input.loadType,
        applyRegionLoadFilters,
      }),
    [input.rows, input.searchQuery, input.regionCode, input.loadType, applyRegionLoadFilters],
  );

  const filtersActive = treatmentProgramLibraryPickerFiltersActive({
    searchQuery: input.searchQuery,
    regionCode: input.regionCode,
    loadType: input.loadType,
    applyRegionLoadFilters,
  });

  const emptyMessage = treatmentProgramLibraryPickerEmptyMessage({
    baseListLength: input.rows.length,
    filteredListLength: filteredRows.length,
    filtersActive,
  });

  return { filteredRows, emptyMessage, applyRegionLoadFilters, filtersActive };
}
