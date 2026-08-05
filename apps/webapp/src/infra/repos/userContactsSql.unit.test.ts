/**
 * D15b/6: COALESCE readers prefer `user_contacts`; mirror rebuilds from four sources.
 */
import { describe, expect, it, vi } from 'vitest';
import { syncUserContactsMirror } from '@bersoncare/platform-merge';
import {
  CONTACTS,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';

describe('userContactsSql — D15b/6 COALESCE contract', () => {
  it('prefers user_contacts primary phone before platform_users.phone_normalized', () => {
    expect(CONTACTS.phoneNormalized).toMatch(/^COALESCE\(uc_pri_phone\./);
    expect(CONTACTS.phoneNormalized).toContain('pu.phone_normalized');
    expect(USER_CONTACTS_PRIMARY_PHONE_LATERAL).toContain('user_contacts');
    expect(USER_CONTACTS_PRIMARY_PHONE_LATERAL).toContain("contact_kind = 'phone'");
  });

  it('syncUserContactsMirror rebuilds from four source tables', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const userId = '00000000-0000-4000-8000-0000000d0c10';

    await syncUserContactsMirror({ query }, userId);

    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[0]![0]).toContain('DELETE FROM user_contacts');
    const insertSql = query.mock.calls.slice(1).map((c) => c[0] as string).join('\n');
    expect(insertSql).toContain('platform_users');
    expect(insertSql).toContain('user_oauth_bindings');
    expect(insertSql).toContain('user_phone_history');
    expect(insertSql).toContain('user_channel_bindings');
    for (const call of query.mock.calls.slice(1)) {
      expect(call[1]).toEqual([userId]);
    }
  });
});
