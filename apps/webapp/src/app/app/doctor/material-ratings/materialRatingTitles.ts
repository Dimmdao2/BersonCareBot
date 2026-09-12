import type { MaterialRatingTargetKind } from '@/modules/material-rating/types';

/**
 * Названия материалов для сводки оценок — ОДНО чтение на обе двери.
 *
 * Зачем одно место: страница оценок и её API-сводка показывают один и тот же список строк, а до
 * 12.09.2026 считали названия своим кодом каждая. Страница брала платформенный слой из тарифа,
 * дверь `api/doctor/material-ratings/summary` жёстко передавала `includePlatformBase: false` — и
 * оценка платформенного материала приходила туда БЕЗ названия (`label: null`), хотя на странице
 * название было. Пока платформенных материалов никому не назначали, расхождение было немым; после
 * S0б платформенный материал назначается пациенту и может быть оценён.
 *
 * Поэтому решение о платформенном слое принимает вызывающая сторона (у неё свой тарифный гейт), а
 * чтение названий — общее: разойтись им больше негде.
 */

export type MaterialRatingTitleRow = {
  targetKind: MaterialRatingTargetKind;
  targetId: string;
};

export type MaterialRatingTitlesPorts = {
  contentPages: {
    listMetaByIds: (ids: string[]) => Promise<{ id: string; title: string }[]>;
  };
  lfkExercises: {
    listExerciseTitlesByIds: (
      ids: string[],
      options: { includePlatformBase: boolean },
    ) => Promise<Map<string, string>>;
  };
  lfkTemplates: {
    getTemplate: (
      id: string,
      options: { includePlatformBase: boolean },
    ) => Promise<{ title?: string | null } | null>;
  };
};

export type MaterialRatingTitles = {
  contentMetas: { id: string; title: string }[];
  exerciseTitleById: Map<string, string>;
  templateTitleById: Map<string, string | null>;
};

function idsOfKind(rows: MaterialRatingTitleRow[], kind: MaterialRatingTargetKind): string[] {
  return [...new Set(rows.filter((row) => row.targetKind === kind).map((row) => row.targetId))];
}

export async function loadMaterialRatingTitles(
  deps: MaterialRatingTitlesPorts,
  rows: MaterialRatingTitleRow[],
  options: { includePlatformBase: boolean },
): Promise<MaterialRatingTitles> {
  const { includePlatformBase } = options;
  const templateIds = idsOfKind(rows, 'lfk_complex');
  const [contentMetas, exerciseTitleById, templateEntries] = await Promise.all([
    deps.contentPages.listMetaByIds(idsOfKind(rows, 'content_page')),
    deps.lfkExercises.listExerciseTitlesByIds(idsOfKind(rows, 'lfk_exercise'), {
      includePlatformBase,
    }),
    Promise.all(
      templateIds.map(async (id) => {
        const template = await deps.lfkTemplates.getTemplate(id, { includePlatformBase });
        const title = template?.title?.trim() ? template.title : null;
        return [id, title] as const;
      }),
    ),
  ]);
  return {
    contentMetas,
    exerciseTitleById,
    templateTitleById: new Map(templateEntries),
  };
}

/** Название строки сводки в плоском виде — то, что отдаёт API-дверь. */
export function materialRatingLabel(
  titles: MaterialRatingTitles,
  row: MaterialRatingTitleRow,
): string | null {
  switch (row.targetKind) {
    case 'content_page':
      return titles.contentMetas.find((meta) => meta.id === row.targetId)?.title ?? null;
    case 'lfk_exercise':
      return titles.exerciseTitleById.get(row.targetId) ?? null;
    case 'lfk_complex':
      return titles.templateTitleById.get(row.targetId) ?? null;
  }
}
