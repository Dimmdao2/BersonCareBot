import { describe, expect, it, vi } from 'vitest';
import { countMeaningfulData } from './platformUserMergePreview';

/**
 * Аудит `docs/_TODO/runs/TYPED_SQL_W5_INDEPENDENT_AUDIT_2026-09-02.md` F2: preview's
 * `countMeaningfulData` narrowed three counters (`symptom_trackings`, `lfk_complexes`,
 * `message_log`) to `platform_user_id = $1 OR (platform_user_id IS NULL AND user_id = $2)`,
 * diverging from the apply path's authority, `assertSharedPhoneGuard.meaningfulCount`
 * (`packages/platform-merge/src/pgPlatformUserMerge.ts`), which uses the plain
 * `platform_user_id = $1 OR user_id = $2`. The `IS NULL` gate under-counts a row whose
 * `platform_user_id` already points at *another* user but whose stale legacy `user_id` text
 * still equals this one — the preview would then clear the `shared_phone_both_have_meaningful_data`
 * blocker, and the apply path (which counts that row) refuses the merge mid-flight anyway.
 *
 * This test proves: (1) the preview's SQL text no longer carries the `IS NULL` gate for these
 * three tables, and (2) a row shaped exactly like that gap is still counted.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function fakePool(rowsByTable: Record<string, number>) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const table = Object.keys(rowsByTable).find((t) => sql.includes(`FROM ${t}`));
    return { rows: [{ c: table ? rowsByTable[table] : 0 }], rowCount: 1 };
  });
  return { pool: { query }, calls };
}

describe('countMeaningfulData: preview mirrors the apply-path shared-phone guard', () => {
  it('symptom_trackings/lfk_complexes/message_log bind the plain OR, not an IS NULL gate', async () => {
    const { pool, calls } = fakePool({});
    await countMeaningfulData(pool as never, USER_ID);

    for (const table of ['symptom_trackings', 'lfk_complexes', 'message_log']) {
      const call = calls.find((c) => c.sql.includes(`FROM ${table}`));
      expect(call, `no query issued for ${table}`).toBeDefined();
      expect(call!.sql).not.toMatch(/IS NULL/);
      expect(call!.sql).toMatch(/platform_user_id = \$\d+::uuid OR user_id = \$\d+::text/);
    }
  });

  it('counts a row whose platform_user_id points elsewhere but whose legacy user_id still matches', async () => {
    // A plain OR predicate matches this row (user_id = $2 side); an IS-NULL-gated predicate
    // would not, because platform_user_id is set (to someone else), not NULL — exactly the gap
    // that let the preview clear a merge the apply path then refused.
    const { pool, calls } = fakePool({ symptom_trackings: 1, lfk_complexes: 0, message_log: 0 });
    const sum = await countMeaningfulData(pool as never, USER_ID);

    const call = calls.find((c) => c.sql.includes('FROM symptom_trackings'))!;
    // Both bound params carry the same userId — the row's own platform_user_id (OTHER_ID) never
    // appears in this statement's params, confirming the match came from the user_id arm alone.
    expect(call.params).toEqual([USER_ID, USER_ID]);
    expect(call.params).not.toContain(OTHER_ID);
    expect(sum).toBeGreaterThan(0);
  });
});
