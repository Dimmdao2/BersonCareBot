import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Владелец: «картинку скачиваем один раз и кладём в НАШЕ хранилище».
 *
 * «Один раз» — это про запись: сохранение упражнения со ссылкой обязано оставить ровно одну
 * служебную строку обложки на клинику и ссылку, в той же транзакции, что и сама ссылка, и без
 * похода в сеть. Проверяется поведение записи: что ушло в базу и сколько раз, а не форма кода.
 */

const runWebappPgText =
  vi.hoisted(() => vi.fn(async (_text: string, _values?: readonly unknown[], _tx?: unknown) => ({
    rows: [] as unknown[],
    rowCount: 0,
  })));
const catalogMediaLadderLookup = vi.hoisted(() => vi.fn());
const drizzleInsertValues = vi.hoisted(() => vi.fn());
const drizzleConflict = vi.hoisted(() => vi.fn());
const drizzleInsert = vi.hoisted(() =>
  vi.fn(() => ({
    values: (values: unknown) => {
      drizzleInsertValues(values);
      return {
        onConflictDoUpdate: async (config: unknown) => {
          drizzleConflict(config);
        },
      };
    },
  })),
);

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText,
  runWebappTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ insert: drizzleInsert }),
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => 'org-1',
}));
vi.mock('@/infra/repos/catalogMediaLadderLookup', () => ({
  catalogMediaLadderLookup,
}));

const { createPgLfkExercisesPort } = await import('./pgLfkExercises');

const EXERCISE_ROW = {
  id: 'ex-1',
  owner_kind: 'organization',
  catalog_scope: 'catalog',
  title: 'Приседания у стены',
  description: null,
  region_ref_id: null,
  load_type: null,
  difficulty_1_10: null,
  contraindications: null,
  tags: null,
  is_archived: false,
  created_by: 'doctor-1',
  created_at: '2026-08-27T00:00:00.000Z',
  updated_at: '2026-08-27T00:00:00.000Z',
};

/** Statements the repository issued, as `[sql, values]` pairs. */
function issued(): { sql: string; values: readonly unknown[] }[] {
  return runWebappPgText.mock.calls.map((call) => ({
    sql: String(call[0]),
    values: (call[1] ?? []) as readonly unknown[],
  }));
}

function coverValues(): Record<string, unknown>[] {
  return drizzleInsertValues.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

beforeEach(() => {
  runWebappPgText.mockReset();
  catalogMediaLadderLookup.mockReset();
  drizzleInsert.mockClear();
  drizzleInsertValues.mockClear();
  drizzleConflict.mockClear();
  catalogMediaLadderLookup.mockResolvedValue({ get: () => undefined, size: 0 });
  runWebappPgText.mockImplementation(async (text: string) => {
    if (text.includes('INSERT INTO lfk_exercises')) return { rows: [EXERCISE_ROW], rowCount: 1 };
    if (text.includes('SELECT id FROM lfk_exercises')) return { rows: [{ id: 'ex-1' }], rowCount: 1 };
    if (text.includes('FROM lfk_exercises e')) return { rows: [EXERCISE_ROW], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

describe('упражнение со ссылкой на видеохостинг: заказ обложки в наше хранилище', () => {
  it('создание заказывает ровно одну служебную строку по канонической ссылке', async () => {
    await createPgLfkExercisesPort().create(
      {
        title: 'Приседания у стены',
        media: [
          {
            mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            mediaType: 'hosted_video',
            sortOrder: 0,
          },
        ],
      },
      'doctor-1',
    );

    const covers = coverValues();
    expect(covers).toHaveLength(1);
    expect(covers[0]).toMatchObject({
      usagePurpose: 'hosted_video_preview',
      hostedVideoSourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      previewStatus: 'pending',
    });
  });

  it('та же ссылка в разных написаниях не плодит заказов внутри одного сохранения', async () => {
    await createPgLfkExercisesPort().create(
      {
        title: 'Приседания у стены',
        media: [
          {
            mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            mediaType: 'hosted_video',
            sortOrder: 0,
          },
          {
            mediaUrl: 'https://youtu.be/dQw4w9WgXcQ?t=90&utm_source=tg',
            mediaType: 'hosted_video',
            sortOrder: 1,
          },
        ],
      },
      'doctor-1',
    );

    expect(coverValues()).toHaveLength(1);
  });

  /* Повторное сохранение той же ссылки переиспользует строку, а сдавшуюся — возвращает в очередь. */
  it('повторное сохранение переиспользует строку и возвращает сдавшуюся обложку в очередь', async () => {
    await createPgLfkExercisesPort().update('ex-1', {
      media: [
        {
          mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          mediaType: 'hosted_video',
          sortOrder: 0,
        },
      ],
    });

    const covers = coverValues();
    expect(covers).toHaveLength(1);
    expect(drizzleConflict).toHaveBeenCalledTimes(1);
    expect(drizzleConflict.mock.calls[0]?.[0]).toMatchObject({
      set: {
        previewStatus: expect.anything(),
        previewAttempts: expect.anything(),
        previewNextAttemptAt: expect.anything(),
      },
    });
  });

  it('замена медиа не удаляет общую обложку — сносится только связь упражнения', async () => {
    await createPgLfkExercisesPort().update('ex-1', { media: [] });

    expect(issued().some((s) => s.sql.includes('DELETE FROM lfk_exercise_media'))).toBe(true);
    expect(issued().some((s) => s.sql.includes('DELETE FROM media_files'))).toBe(false);
  });

  it('файл из медиатеки обложку не заказывает', async () => {
    await createPgLfkExercisesPort().create(
      {
        title: 'Мостик',
        media: [
          {
            mediaUrl: '/api/media/00000000-0000-4000-8000-0000000000c1',
            mediaType: 'video',
            sortOrder: 0,
          },
        ],
      },
      'doctor-1',
    );

    expect(coverValues()).toHaveLength(0);
  });

  it('состояние превью и файла, и ссылки читается общей дверью, а не вторым join', async () => {
    runWebappPgText.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO lfk_exercises')) return { rows: [EXERCISE_ROW], rowCount: 1 };
      if (text.includes('FROM lfk_exercise_media em')) {
        return {
          rows: [
            {
              id: 'em-1',
              owner_kind: 'organization',
              exercise_id: 'ex-1',
              media_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              media_type: 'hosted_video',
              sort_order: 0,
              created_at: '2026-08-27T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    catalogMediaLadderLookup.mockResolvedValue({
      get: () => ({
        previewSmUrl: '/api/media/33333333-3333-4333-8333-333333333333/preview/sm',
        previewMdUrl: '/api/media/33333333-3333-4333-8333-333333333333/preview/md',
        previewStatus: 'ready' as const,
        standardRendition: true,
      }),
      size: 1,
    });

    const created = await createPgLfkExercisesPort().create(
      {
        title: 'Приседания у стены',
        media: [
          {
            mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            mediaType: 'hosted_video',
            sortOrder: 0,
          },
        ],
      },
      'doctor-1',
    );

    expect(created.media[0]!.previewStatus).toBe('ready');
    expect(created.media[0]!.previewSmUrl).toBe(
      '/api/media/33333333-3333-4333-8333-333333333333/preview/sm',
    );
    expect(catalogMediaLadderLookup).toHaveBeenCalled();
  });
});
