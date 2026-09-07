import { describe, expect, it, vi } from 'vitest';
import { mutateCanonicalUserContacts } from '@bersoncare/platform-merge';

describe('userContactsSql — D15b/6 source-of-truth contract', () => {
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
