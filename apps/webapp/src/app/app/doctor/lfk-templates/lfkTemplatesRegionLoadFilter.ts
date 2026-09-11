import { isDoctorCatalogMissingFilter } from '@/shared/lib/doctorCatalogEmptyFieldFilter';

/**
 * Фильтр списка шаблонов ЛФК по региону и типу нагрузки его упражнений.
 *
 * Вынесено из `LfkTemplatesPageClient.tsx` в отдельный модуль по той же причине, по которой рядом
 * живёт `treatmentProgramLibraryPickerFilters.ts`: тип нагрузки — НАБОР, и сравнение с одиночной
 * legacy-колонкой молча прятало комплексы с упражнениями на два типа. Внутри `.tsx` это поведение
 * тестом не закрывалось.
 */
export type LfkTemplateFilterExerciseMeta = {
  regionRefIds: readonly string[];
  loadTypes: readonly string[];
};

export function filterLfkTemplatesByRegionAndLoad<
  T extends { exercises: readonly { exerciseId: string }[] },
>(
  templates: readonly T[],
  input: {
    regionCode?: string | null;
    loadType?: string | null;
    exerciseMetaById: Record<string, LfkTemplateFilterExerciseMeta | undefined>;
    bodyRegionIdToCode: Record<string, string>;
  },
): T[] {
  const { exerciseMetaById, bodyRegionIdToCode } = input;
  let out: T[] = [...templates];

  const regionCode = input.regionCode?.trim();
  if (regionCode) {
    if (isDoctorCatalogMissingFilter(regionCode)) {
      out = out.filter((tpl) =>
        tpl.exercises.some((row) => !exerciseMetaById[row.exerciseId]?.regionRefIds?.length),
      );
    } else {
      out = out.filter((tpl) =>
        tpl.exercises.some((row) => {
          const m = exerciseMetaById[row.exerciseId];
          if (!m?.regionRefIds?.length) return false;
          return m.regionRefIds.some((rid) => (bodyRegionIdToCode[rid] ?? null) === regionCode);
        }),
      );
    }
  }

  const loadType = input.loadType ?? null;
  if (loadType) {
    if (isDoctorCatalogMissingFilter(loadType)) {
      out = out.filter((tpl) =>
        tpl.exercises.some(
          (row) => (exerciseMetaById[row.exerciseId]?.loadTypes ?? []).length === 0,
        ),
      );
    } else {
      // Набор целиком, а не первый его элемент: комплекс попадает в фильтр по ЛЮБОМУ типу нагрузки
      // своих упражнений.
      out = out.filter((tpl) =>
        tpl.exercises.some((row) =>
          (exerciseMetaById[row.exerciseId]?.loadTypes ?? []).includes(loadType),
        ),
      );
    }
  }

  return out;
}
