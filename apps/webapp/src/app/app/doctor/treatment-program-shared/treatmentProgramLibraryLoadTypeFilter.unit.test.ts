import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseLoadType } from '@/modules/lfk-exercises/types';
import type { Template } from '@/modules/lfk-templates/types';
import { buildTreatmentProgramLibraryPickers } from '@/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers';
import { DOCTOR_CATALOG_FILTER_MISSING } from '@/shared/lib/doctorCatalogEmptyFieldFilter';
import {
  buildExerciseMetaById,
  buildLfkComplexLibraryFilterMeta,
  filterTreatmentProgramLibraryPickerRows,
} from './treatmentProgramLibraryPickerFilters';
import type { TreatmentProgramLibraryRow } from './treatmentProgramLibraryTypes';

/**
 * ОРАКУЛ: постановка владельца 11.09.2026 — «тип нагрузки должен стать мультиполем… этот тип должен
 * быть поле такое же, как регион». Поле стало мультивыбором, и legacy-колонка `load_type` теперь
 * хранит АЛФАВИТНО ПЕРВЫЙ код набора (тот же принцип, что у `region_ref_id`). Значит любой фильтр,
 * который сравнивает эту колонку, молча теряет упражнения: {Силовая, Статическое удержание} по
 * фильтру «Силовая» не находится, потому что в колонке лежит `static_hold`.
 */
function exercise(id: string, loadTypes: ExerciseLoadType[]): Exercise {
  const sorted = [...loadTypes].sort((a, b) => a.localeCompare(b));
  return {
    id,
    title: id,
    description: null,
    contraindications: null,
    difficulty110: null,
    // Legacy-колонка ведёт себя как в базе: первый по алфавиту, а не первый выбранный.
    loadType: sorted[0] ?? null,
    loadTypes: sorted,
    regionRefIds: [],
    tags: [],
    isArchived: false,
    ownerKind: 'organization',
    catalogScope: 'catalog',
    media: [],
  } as unknown as Exercise;
}

/**
 * Строки подбора собираются ТЕМ ЖЕ кодом, что и в приложении: отображение «упражнение → строка
 * подбора» (`buildTreatmentProgramLibraryPickers`) и есть то место, где фильтр падал на
 * legacy-колонку. Литеральная строка этот шов не проверяет.
 */
function pickerRows(exercises: Exercise[]): TreatmentProgramLibraryRow[] {
  return buildTreatmentProgramLibraryPickers({
    exercises,
    lfkTemplates: [],
    testSets: [],
    clinicalTests: [],
    recommendations: [],
    contentPagesAll: [],
  }).exercises as unknown as TreatmentProgramLibraryRow[];
}

describe('фильтр подбора по типу нагрузки при мультитипе', () => {
  const both = exercise('strength_and_hold', ['strength', 'static_hold']);

  it('упражнение с двумя типами находится по КАЖДОМУ из них, а не только по алфавитно первому', () => {
    const rows = pickerRows([both, exercise('stretch_only', ['stretch'])]);

    for (const lt of ['strength', 'static_hold']) {
      const found = filterTreatmentProgramLibraryPickerRows(rows, {
        searchQuery: '',
        loadType: lt,
        applyRegionLoadFilters: true,
      });
      expect(found.map((r) => r.id)).toContain('strength_and_hold');
    }
    expect(filterTreatmentProgramLibraryPickerRows(rows, {
        searchQuery: '',
        loadType: 'stretch',
        applyRegionLoadFilters: true,
      }).map((r) => r.id)).toEqual(
      ['stretch_only'],
    );
  });

  it('метаданные упражнения несут набор типов, а не одиночную legacy-колонку', () => {
    const meta = buildExerciseMetaById([both]);
    expect(meta[both.id]!.loadTypes).toEqual(['static_hold', 'strength']);
  });

  it('упражнение без типов нагрузки попадает в фильтр «не заполнено», а с типами — нет', () => {
    const rows = pickerRows([both, exercise('no_load', [])]);

    const found = filterTreatmentProgramLibraryPickerRows(rows, {
      searchQuery: '',
      loadType: DOCTOR_CATALOG_FILTER_MISSING,
      applyRegionLoadFilters: true,
    });
    expect(found.map((r) => r.id)).toEqual(['no_load']);
  });

  it('комплекс ЛФК наследует ВСЕ типы своих упражнений', () => {
    const template = {
      id: 'complex',
      exercises: [{ exerciseId: both.id, sortOrder: 0 }],
    } as unknown as Template;

    const meta = buildLfkComplexLibraryFilterMeta(template, buildExerciseMetaById([both]), {});
    expect([...(meta.loadTypes ?? [])].sort()).toEqual(['static_hold', 'strength']);
  });
});
