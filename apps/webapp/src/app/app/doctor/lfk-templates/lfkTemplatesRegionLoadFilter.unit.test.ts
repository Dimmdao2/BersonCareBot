import { describe, expect, it } from 'vitest';
import { DOCTOR_CATALOG_FILTER_MISSING } from '@/shared/lib/doctorCatalogEmptyFieldFilter';
import {
  filterLfkTemplatesByRegionAndLoad,
  type LfkTemplateFilterExerciseMeta,
} from './lfkTemplatesRegionLoadFilter';

/**
 * ОРАКУЛ: постановка владельца 11.09.2026 — тип нагрузки стал мультиполем, «такое же поле, как
 * регион». Значит список шаблонов ЛФК обязан находить комплекс по ЛЮБОМУ типу нагрузки его
 * упражнений. Сравнение с одним значением (первым в наборе) молча прячет комплексы от врача.
 */
const META: Record<string, LfkTemplateFilterExerciseMeta> = {
  // Алфавитно первый код набора — `static_hold`, поэтому фильтр по `strength` ловит этот набор
  // только если сравнивается весь набор.
  both: { regionRefIds: ['knee-id'], loadTypes: ['static_hold', 'strength'] },
  stretchOnly: { regionRefIds: ['back-id'], loadTypes: ['stretch'] },
  empty: { regionRefIds: [], loadTypes: [] },
};

const BODY_REGION_ID_TO_CODE = { 'knee-id': 'knee', 'back-id': 'back' };

function template(id: string, exerciseIds: string[]) {
  return { id, exercises: exerciseIds.map((exerciseId) => ({ exerciseId })) };
}

const TEMPLATES = [
  template('with_both', ['both']),
  template('with_stretch', ['stretchOnly']),
  template('with_empty', ['empty']),
];

function idsFiltered(input: { regionCode?: string | null; loadType?: string | null }): string[] {
  return filterLfkTemplatesByRegionAndLoad(TEMPLATES, {
    ...input,
    exerciseMetaById: META,
    bodyRegionIdToCode: BODY_REGION_ID_TO_CODE,
  }).map((t) => t.id);
}

describe('фильтр списка шаблонов ЛФК по типу нагрузки и региону', () => {
  it('комплекс находится по КАЖДОМУ типу нагрузки своих упражнений, а не по алфавитно первому', () => {
    expect(idsFiltered({ loadType: 'strength' })).toEqual(['with_both']);
    expect(idsFiltered({ loadType: 'static_hold' })).toEqual(['with_both']);
    expect(idsFiltered({ loadType: 'stretch' })).toEqual(['with_stretch']);
  });

  it('фильтр «не заполнено» отдаёт комплексы с упражнениями без типа нагрузки', () => {
    expect(idsFiltered({ loadType: DOCTOR_CATALOG_FILTER_MISSING })).toEqual(['with_empty']);
  });

  it('фильтр «не заполнено» по региону отдаёт комплексы с упражнениями без региона', () => {
    expect(idsFiltered({ regionCode: DOCTOR_CATALOG_FILTER_MISSING })).toEqual(['with_empty']);
  });

  it('регион и тип нагрузки сужают список вместе', () => {
    expect(idsFiltered({ regionCode: 'knee', loadType: 'strength' })).toEqual(['with_both']);
    expect(idsFiltered({ regionCode: 'back', loadType: 'strength' })).toEqual([]);
  });

  it('без фильтров список не меняется', () => {
    expect(idsFiltered({})).toEqual(['with_both', 'with_stretch', 'with_empty']);
  });
});
