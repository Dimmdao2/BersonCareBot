import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';

/**
 * Аудит `docs/_TODO/runs/TYPED_SQL_W5_INDEPENDENT_AUDIT_2026-09-02.md` F1: динамический SET-билдер
 * `update()` связывал `tags` голым значением, drizzle разворачивал JS-массив в row-constructor
 * (`tags = ($1, $2)` вместо `tags = $1`), и Postgres отказывал на любом количестве тегов — «malformed
 * array literal» на одном теге, «operator does not exist: text[] = record» на двух. Тест держит ровно
 * один плейсхолдер на `tags` при 0/1/2 тегах и не даёт остальным полям молча потерять биндинг.
 */

const runWebappSql = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _fragment: unknown) => ({
    rows: [] as unknown[],
    rowCount: 0,
  })),
);

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({}),
  runWebappSql,
  runWebappTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => 'org-1',
}));
vi.mock('@/infra/repos/catalogMediaLadderLookup', () => ({
  catalogMediaLadderLookup: vi.fn(async () => ({ get: () => undefined, size: 0 })),
}));

const { createPgLfkExercisesPort } = await import('./pgLfkExercises');

/** Statements the repository issued, exactly as PostgreSQL would receive them. */
function issued(): { sql: string; values: readonly unknown[] }[] {
  return runWebappSql.mock.calls.map((call) => drizzleSqlFragmentToPgQuery(call[1] as SQL));
}

const EXERCISE_ROW = {
  id: 'ex-1',
  owner_kind: 'organization',
  catalog_scope: 'catalog',
  title: 'Наклоны',
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
  region_m2m_ids: [] as string[],
};

beforeEach(() => {
  runWebappSql.mockReset();
  runWebappSql.mockImplementation(async (_db: unknown, fragment: unknown) => {
    const text = drizzleSqlFragmentToPgQuery(fragment as SQL).sql;
    if (text.includes('SELECT id FROM lfk_exercises')) return { rows: [{ id: 'ex-1' }], rowCount: 1 };
    if (text.includes('SELECT e.id')) return { rows: [EXERCISE_ROW], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

/** One `$n` placeholder for `col`, and the bound value carried at that position — or null if absent. */
function boundValue(
  statement: { sql: string; values: readonly unknown[] },
  col: string,
): { placeholder: string; value: unknown } | null {
  const m = statement.sql.match(new RegExp(`\\b${col}\\s*=\\s*(\\$\\d+)`));
  if (!m) return null;
  const idx = Number(m[1]!.slice(1)) - 1;
  return { placeholder: m[1]!, value: statement.values[idx] };
}

describe('обновление упражнения: SET tags связывается одним параметром, не row-constructor', () => {
  it.each([
    ['без тегов', [] as string[]],
    ['один тег', ['spine']],
    ['два тега', ['spine', 'balance']],
  ])('%s — tags = $N ровно один раз, без скобок-конструктора', async (_label, tags) => {
    await createPgLfkExercisesPort().update('ex-1', { title: 'Наклоны', tags });

    const update = issued().find((s) => s.sql.startsWith('UPDATE lfk_exercises'));
    expect(update).toBeDefined();

    // Row-constructor form is `tags = ($n)` or `tags = ($n, $n+1, ...)` — reject both.
    expect(update!.sql).not.toMatch(/tags\s*=\s*\(/);

    const tagsBinding = boundValue(update!, 'tags');
    expect(tagsBinding).not.toBeNull();
    expect(tagsBinding!.value).toEqual(tags);

    // The sibling scalar column stays a normal single-placeholder bind alongside it.
    const titleBinding = boundValue(update!, 'title');
    expect(titleBinding).not.toBeNull();
    expect(titleBinding!.value).toBe('Наклоны');
  });

  it('tags: null очищает теги тем же единственным плейсхолдером', async () => {
    await createPgLfkExercisesPort().update('ex-1', { tags: null });

    const update = issued().find((s) => s.sql.startsWith('UPDATE lfk_exercises'));
    expect(update).toBeDefined();
    expect(update!.sql).not.toMatch(/tags\s*=\s*\(/);
    expect(boundValue(update!, 'tags')?.value).toBeNull();
  });
});
