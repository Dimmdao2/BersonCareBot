import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getPhoneNormalizedForDeliveryLookup } from './platformUserDeliveryPhone.js';

function makeDb(query: ReturnType<typeof vi.fn>): DbPort {
  return { query, tx: vi.fn() } as unknown as DbPort;
}

// eslint-disable-next-line no-secrets/no-secrets -- describe label matches exported function name
describe('getPhoneNormalizedForDeliveryLookup', () => {
  it('returns trimmed phone when row exists', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ phone_normalized: ' +79991112233 ' }],
    });
    const db = makeDb(query);
    await expect(getPhoneNormalizedForDeliveryLookup(db, '1001')).resolves.toBe('+79991112233');
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain('public.platform_users');
  });

  it('returns null for empty userKey without querying', async () => {
    const query = vi.fn();
    const db = makeDb(query);
    await expect(getPhoneNormalizedForDeliveryLookup(db, '  ')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns null when no row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = makeDb(query);
    await expect(getPhoneNormalizedForDeliveryLookup(db, 'uuid-1')).resolves.toBeNull();
  });
});
