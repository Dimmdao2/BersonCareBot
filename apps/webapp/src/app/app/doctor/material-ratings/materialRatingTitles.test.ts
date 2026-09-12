import { describe, expect, it } from 'vitest';

import {
  loadMaterialRatingTitles,
  materialRatingLabel,
  type MaterialRatingTitlesPorts,
} from './materialRatingTitles';

/**
 * Дверь, которую сторожит этот файл: НАЗВАНИЕ материала в сводке оценок читается одним местом, и
 * платформенный слой должен доходить до КАЖДОГО чтения названий, а не до некоторых.
 *
 * Как это выглядело живьём до 12.09.2026: страница оценок считала `includePlatformBase` из тарифа, а
 * дверь `api/doctor/material-ratings/summary` жёстко передавала `false`. Оценка платформенного
 * упражнения приходила туда БЕЗ названия (`label: null`) — замерено на DEV: до правки `label = null`,
 * после — «Базовая библиотека: разгибание колена сидя», строки в базе те же.
 *
 * Oracle — не текст названия, а граница чтения: с флагом платформенная строка называется, без флага —
 * нет; страницы CMS от флага не зависят вообще. Фейковые порты отдают платформенную строку ТОЛЬКО
 * когда чтение пришло с флагом, ровно как настоящие `pgLfkExercises`/`pgLfkTemplates`.
 */

const PLATFORM_EXERCISE_ID = '00000000-0000-4000-8000-0000000040a1';
const OWN_EXERCISE_ID = '00000000-0000-4000-8000-0000000040a2';
const PLATFORM_TEMPLATE_ID = '00000000-0000-4000-8000-0000000040a3';
const CONTENT_PAGE_ID = '00000000-0000-4000-8000-0000000040a4';

const ROWS = [
  { targetKind: 'lfk_exercise' as const, targetId: PLATFORM_EXERCISE_ID },
  { targetKind: 'lfk_exercise' as const, targetId: OWN_EXERCISE_ID },
  { targetKind: 'lfk_complex' as const, targetId: PLATFORM_TEMPLATE_ID },
  { targetKind: 'content_page' as const, targetId: CONTENT_PAGE_ID },
];

function fakePorts() {
  const flags: { exercises?: boolean; templates: boolean[] } = { templates: [] };
  const deps: MaterialRatingTitlesPorts = {
    contentPages: {
      async listMetaByIds(ids) {
        return ids.map((id) => ({ id, title: 'Страница помощи' }));
      },
    },
    lfkExercises: {
      async listExerciseTitlesByIds(ids, options) {
        flags.exercises = options.includePlatformBase;
        const titles = new Map<string, string>();
        for (const id of ids) {
          if (id === OWN_EXERCISE_ID) titles.set(id, 'Своё упражнение');
          if (id === PLATFORM_EXERCISE_ID && options.includePlatformBase) {
            titles.set(id, 'Базовая библиотека: разгибание колена сидя');
          }
        }
        return titles;
      },
    },
    lfkTemplates: {
      async getTemplate(id, options) {
        flags.templates.push(options.includePlatformBase);
        if (id === PLATFORM_TEMPLATE_ID && !options.includePlatformBase) return null;
        return { title: 'Базовая библиотека: комплекс на колено' };
      },
    },
  };
  return { deps, flags };
}

describe('названия материалов в сводке оценок и платформенный слой', () => {
  it('с разрешённым платформенным слоем платформенные строки называются', async () => {
    const { deps, flags } = fakePorts();
    const titles = await loadMaterialRatingTitles(deps, ROWS, { includePlatformBase: true });

    expect(materialRatingLabel(titles, ROWS[0])).toBe('Базовая библиотека: разгибание колена сидя');
    expect(materialRatingLabel(titles, ROWS[1])).toBe('Своё упражнение');
    expect(materialRatingLabel(titles, ROWS[2])).toBe('Базовая библиотека: комплекс на колено');
    // Флаг обязан дойти до КАЖДОГО чтения названий, а не до первого.
    expect(flags.exercises).toBe(true);
    expect(flags.templates).toEqual([true]);
  });

  it('без разрешения платформенного слоя платформенная строка остаётся без названия', async () => {
    const { deps } = fakePorts();
    const titles = await loadMaterialRatingTitles(deps, ROWS, { includePlatformBase: false });

    expect(materialRatingLabel(titles, ROWS[0])).toBeNull();
    expect(materialRatingLabel(titles, ROWS[2])).toBeNull();
    // Своя строка от флага не зависит.
    expect(materialRatingLabel(titles, ROWS[1])).toBe('Своё упражнение');
  });

  it('страница CMS названием не зависит от платформенного слоя', async () => {
    const { deps } = fakePorts();
    for (const includePlatformBase of [true, false]) {
      const titles = await loadMaterialRatingTitles(deps, ROWS, { includePlatformBase });
      expect(materialRatingLabel(titles, ROWS[3])).toBe('Страница помощи');
    }
  });
});
