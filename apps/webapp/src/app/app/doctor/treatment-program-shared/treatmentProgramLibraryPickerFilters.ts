import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { Template } from "@/modules/lfk-templates/types";
import type { TreatmentProgramLibraryPickType } from "@/modules/treatment-program/types";
import { isDoctorCatalogMissingFilter } from "@/shared/lib/doctorCatalogEmptyFieldFilter";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import type { TreatmentProgramLibraryRow } from "./treatmentProgramLibraryTypes";

export function buildExerciseMetaById(
  exercises: Exercise[],
): Record<string, { regionRefIds: readonly string[]; loadType: ExerciseLoadType | null }> {
  return Object.fromEntries(
    exercises.map((e) => [e.id, { regionRefIds: e.regionRefIds, loadType: e.loadType }]),
  );
}

export function mapExerciseRegionCodes(
  regionRefIds: readonly string[],
  bodyRegionIdToCode: Record<string, string> | undefined,
): readonly string[] {
  if (!bodyRegionIdToCode) return [];
  return regionRefIds
    .map((id) => bodyRegionIdToCode[id])
    .filter((code): code is string => typeof code === "string" && code.length > 0);
}

export function buildLfkComplexLibraryFilterMeta(
  template: Template,
  exerciseMetaById: Record<string, { regionRefIds: readonly string[]; loadType: ExerciseLoadType | null }>,
  bodyRegionIdToCode: Record<string, string> | undefined,
): Pick<TreatmentProgramLibraryRow, "regionCodes" | "loadTypes" | "matchesMissingRegion" | "matchesMissingLoad"> {
  const regionCodes = new Set<string>();
  const loadTypes = new Set<string>();
  let matchesMissingRegion = false;
  let matchesMissingLoad = false;

  for (const row of template.exercises ?? []) {
    const meta = exerciseMetaById[row.exerciseId];
    if (!meta) continue;
    if (!meta.regionRefIds.length) matchesMissingRegion = true;
    for (const rid of meta.regionRefIds) {
      const code = bodyRegionIdToCode?.[rid];
      if (code) regionCodes.add(code);
    }
    if (!meta.loadType) matchesMissingLoad = true;
    else loadTypes.add(meta.loadType);
  }

  return {
    regionCodes: [...regionCodes],
    loadTypes: [...loadTypes],
    matchesMissingRegion,
    matchesMissingLoad,
  };
}

export function supportsTreatmentProgramLibraryRegionLoadFilters(
  pickType: TreatmentProgramLibraryPickType | "exercise" | "lfk_complex" | "clinical_test" | "recommendation" | "lesson",
): boolean {
  return pickType === "exercise" || pickType === "lfk_complex";
}

function rowMatchesRegion(row: TreatmentProgramLibraryRow, regionCode: string): boolean {
  if (isDoctorCatalogMissingFilter(regionCode)) {
    if (row.loadTypes !== undefined) return row.matchesMissingRegion === true;
    return (row.regionCodes ?? []).length === 0;
  }
  return (row.regionCodes ?? []).includes(regionCode);
}

function rowMatchesLoad(row: TreatmentProgramLibraryRow, loadType: string): boolean {
  if (isDoctorCatalogMissingFilter(loadType)) {
    if (row.loadTypes !== undefined) return row.matchesMissingLoad === true;
    return row.loadType == null;
  }
  if (row.loadTypes !== undefined) return row.loadTypes.includes(loadType);
  return row.loadType === loadType;
}

export function filterTreatmentProgramLibraryPickerRows(
  rows: TreatmentProgramLibraryRow[],
  input: {
    searchQuery: string;
    regionCode?: string | null;
    loadType?: string | null;
    applyRegionLoadFilters: boolean;
  },
): TreatmentProgramLibraryRow[] {
  let out = rows;
  const needle = normalizeRuSearchString(input.searchQuery.trim());
  if (needle) {
    out = out.filter((row) => normalizeRuSearchString(row.title).includes(needle));
  }

  if (!input.applyRegionLoadFilters) return out;

  const regionCode = input.regionCode?.trim() ?? "";
  if (regionCode) {
    out = out.filter((row) => rowMatchesRegion(row, regionCode));
  }

  const loadType = input.loadType ?? null;
  if (loadType) {
    out = out.filter((row) => rowMatchesLoad(row, loadType));
  }

  return out;
}

export function treatmentProgramLibraryPickerFiltersActive(input: {
  searchQuery: string;
  regionCode: string | null;
  loadType: string | null;
  applyRegionLoadFilters: boolean;
}): boolean {
  if (input.searchQuery.trim()) return true;
  if (!input.applyRegionLoadFilters) return false;
  return Boolean(input.regionCode) || Boolean(input.loadType);
}

export function treatmentProgramLibraryPickerEmptyMessage(input: {
  baseListLength: number;
  filteredListLength: number;
  filtersActive: boolean;
}): string {
  if (input.filteredListLength > 0) return "";
  if (input.baseListLength === 0) return "Нет записей для выбранного типа.";
  if (input.filtersActive) return "Ничего не найдено по фильтрам.";
  return "Нет записей для выбранного типа.";
}
