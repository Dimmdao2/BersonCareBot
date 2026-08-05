/**
 * D15b/5: COALESCE readers prefer `user_identity`; mirror upserts all five FIO fields.
 */
import { describe, expect, it, vi } from 'vitest';
import { syncUserIdentityFioMirror } from '@bersoncare/platform-merge';
import { FIO, FIO_SELECT, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';

describe('userIdentityFioSql — D15b/5 COALESCE contract', () => {
  it('prefers user_identity columns before platform_users in every FIO expression', () => {
    for (const expr of Object.values(FIO)) {
      expect(expr).toMatch(/^COALESCE\(ui\./);
      expect(expr).toMatch(/, pu\./);
    }
    expect(FIO_SELECT).toContain(FIO.displayName);
    expect(USER_IDENTITY_FIO_JOIN).toContain('user_identity ui');
  });

  it('syncUserIdentityFioMirror copies all five FIO columns from platform_users', async () => {
    const query = vi.fn(
      async (_sql: string, _params?: unknown[]) => ({ rows: [] as never[], rowCount: 1 }),
    );
    const userId = '00000000-0000-4000-8000-0000000d0f10';

    await syncUserIdentityFioMirror({ query }, userId);

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0]!;
    expect(params).toEqual([userId]);
    expect(sql).toContain('INSERT INTO user_identity');
    expect(sql).toContain('ON CONFLICT (platform_user_id) DO UPDATE SET');
    for (const col of ['first_name', 'last_name', 'patronymic', 'display_name', 'birth_date']) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain('merged_into_id IS NULL');
  });
});
