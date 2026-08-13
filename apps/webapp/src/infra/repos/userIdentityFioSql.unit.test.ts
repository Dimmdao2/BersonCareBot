/**
 * D15b/5 (slice 5): `user_identity` is the SOURCE OF TRUTH for FIO, not a mirror read behind a
 * fallback. Readers must not COALESCE back to the legacy `platform_users` columns, and the mirror
 * writer must cover merge tombstones too — migration 0381 made the mirror total precisely so that
 * a missing row surfaces as NULL instead of being hidden.
 */
import { describe, expect, it, vi } from 'vitest';
import { syncUserIdentityFioMirror } from '@bersoncare/platform-merge';
import { FIO, FIO_SELECT, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';

describe('userIdentityFioSql — D15b/5 source-of-truth contract', () => {
  it('reads FIO from user_identity only, with no fallback to platform_users', () => {
    for (const expr of Object.values(FIO)) {
      expect(expr).toMatch(/^ui\./);
      expect(expr).not.toContain('COALESCE');
      expect(expr).not.toContain('pu.');
    }
    expect(FIO_SELECT).toContain(FIO.displayName);
    expect(USER_IDENTITY_FIO_JOIN).toContain('user_identity ui');
  });

  it('syncUserIdentityFioMirror upserts all five FIO columns for EVERY row, tombstones included', async () => {
    const query = vi.fn(
      async (_sql: string, _params?: unknown[]) => ({ rows: [] as never[], rowCount: 1 }),
    );
    const userId = '00000000-0000-4000-8000-0000000d0f10';

    await syncUserIdentityFioMirror({ query }, userId);

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0]!;
    expect(params).toEqual([userId]);
    expect(sql).toContain('INSERT INTO public.user_identity');
    expect(sql).toContain('ON CONFLICT (platform_user_id) DO UPDATE SET');
    for (const col of ['first_name', 'last_name', 'patronymic', 'display_name', 'birth_date']) {
      expect(sql).toContain(col);
    }
    // A `merged_into_id IS NULL` filter here would leave merge tombstones without a mirror row,
    // and with the reader fallback gone their FIO would read NULL.
    expect(sql).not.toContain('merged_into_id IS NULL');
  });
});
