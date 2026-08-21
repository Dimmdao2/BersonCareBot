/**
 * D15b/6 physical cutover: `user_contacts` is the only phone/e-mail authority.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { mutateCanonicalUserContacts } from '@bersoncare/platform-merge';
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

  it('atomically upserts, demotes and promotes only inside user_contacts', async () => {
    const dialect = new PgDialect();
    const statements: string[] = [];
    const executeSql = vi.fn(async (fragment: SQL) => {
      statements.push(dialect.sqlToQuery(fragment).sql);
      return { rows: [] as never[], rowCount: 1 };
    });
    const userId = '00000000-0000-4000-8000-0000000d0c10';

    await mutateCanonicalUserContacts({ executeSql }, userId, [{
      action: 'upsert',
      kind: 'phone',
      valueNormalized: '+79990000000',
      isPrimary: true,
      confirmedAt: '2026-08-21T00:00:00.000Z',
      sourceOrigin: 'direct',
    }]);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('WITH existing_value AS MATERIALIZED');
    expect(statements[0]).toContain('demoted_primary AS');
    expect(statements[0]).toContain('updated_value AS');
    expect(statements[0]).toContain('inserted_value AS');
    expect(statements.join('\n')).not.toMatch(/platform_users|user_phone_history|user_oauth_bindings|user_channel_bindings/);
  });

  it('fails closed when the same canonical value belongs to another account', async () => {
    const executeSql = vi.fn(async () => ({ rows: [] as never[], rowCount: 0 }));

    await expect(mutateCanonicalUserContacts({ executeSql },
      '00000000-0000-4000-8000-0000000d0c10', [{
        action: 'upsert', kind: 'email', valueNormalized: 'owner@example.test',
        isPrimary: false, confirmedAt: null, sourceOrigin: 'direct',
      }])).rejects.toThrow('canonical_email_contact_conflict');
  });

  it('maps a concurrent cross-account unique collision without a separate demotion statement', async () => {
    const executeSql = vi.fn(async () => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'uq_user_contacts_phone',
      });
    });

    await expect(mutateCanonicalUserContacts({ executeSql },
      '00000000-0000-4000-8000-0000000d0c10', [{
        action: 'upsert', kind: 'phone', valueNormalized: '+79990000000',
        isPrimary: true, confirmedAt: null, sourceOrigin: 'direct',
      }])).rejects.toThrow('canonical_phone_contact_conflict');
    expect(executeSql).toHaveBeenCalledTimes(1);
  });
});
