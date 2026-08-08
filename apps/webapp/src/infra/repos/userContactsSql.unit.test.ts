/**
 * D15b/6 (slice 5): `user_contacts` is the SOURCE OF TRUTH for phone/e-mail, not a mirror read
 * behind a fallback — it holds the uniqueness (migration 0380) and, unlike the scalar columns it
 * replaced, several confirmed contacts per person. Messenger links are NOT mirrored here: they
 * live in `user_channel_bindings` (migration 0382 removed the duplicated slice).
 */
import { describe, expect, it, vi } from 'vitest';
import { syncUserContactsMirror } from '@bersoncare/platform-merge';
import {
  CONTACTS,
  CONTACTS_NO_PHONE,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';

describe('userContactsSql — D15b/6 source-of-truth contract', () => {
  it('reads the primary phone from user_contacts only, with no fallback to platform_users', () => {
    expect(CONTACTS.phoneNormalized).toBe('uc_pri_phone.value_normalized');
    expect(CONTACTS.phoneNormalized).not.toContain('COALESCE');
    expect(CONTACTS.phoneNormalized).not.toContain('pu.phone_normalized');
    expect(USER_CONTACTS_PRIMARY_PHONE_LATERAL).toContain('user_contacts');
    expect(USER_CONTACTS_PRIMARY_PHONE_LATERAL).toContain("contact_kind = 'phone'");
  });

  it('reads the primary email from user_contacts only, with no fallback to platform_users', () => {
    expect(CONTACTS.emailNormalized).toBe('uc_pri_email.value_normalized');
    expect(CONTACTS.emailNormalized).not.toContain('COALESCE');
    expect(CONTACTS.emailNormalized).not.toContain('pu.email_normalized');
  });

  it('CONTACTS_NO_PHONE is built on the user_contacts primary phone expression', () => {
    expect(CONTACTS_NO_PHONE).toContain('uc_pri_phone');
    expect(CONTACTS_NO_PHONE).not.toMatch(/pu\.phone_normalized IS NULL/);
  });

  it('syncUserContactsMirror rebuilds phone/email from three sources and never mirrors channels', async () => {
    const query = vi.fn(
      async (_sql: string, _params?: unknown[]) => ({ rows: [] as never[], rowCount: 1 }),
    );
    const userId = '00000000-0000-4000-8000-0000000d0c10';

    await syncUserContactsMirror({ query }, userId);

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0]![0]).toContain('DELETE FROM user_contacts');
    const insertSql = query.mock.calls.slice(1).map((c) => c[0] as string).join('\n');
    expect(insertSql).toContain('platform_users');
    expect(insertSql).toContain('user_oauth_bindings');
    expect(insertSql).toContain('user_phone_history');
    // Messenger links stay in `user_channel_bindings`; mirroring them here duplicated both the
    // rows and that table's uniqueness (evidence/18-duplication-sweep.md §2а).
    expect(insertSql).not.toContain('user_channel_bindings');
    expect(insertSql).not.toContain('channel_code');
    for (const call of query.mock.calls.slice(1)) {
      expect(call[1]).toEqual([userId]);
    }
  });
});
