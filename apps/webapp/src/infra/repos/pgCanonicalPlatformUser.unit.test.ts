/**
 * D15b/6: trusted phone canonical lookup prefers user_contacts assembly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { findTrustedCanonicalUserIdByPhone } from '@/infra/repos/pgCanonicalPlatformUser';

const TRUSTED_USER_ID = '00000000-0000-4000-8000-0000000d0f01';
const PHONE = '+79001234567';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findTrustedCanonicalUserIdByPhone — D15b/6 user_contacts reader', () => {
  it('resolves trusted owner via primary phone row in user_contacts', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: TRUSTED_USER_ID }] });

    const id = await findTrustedCanonicalUserIdByPhone({} as never, PHONE);

    expect(id).toBe(TRUSTED_USER_ID);
    expect(runWebappPgTextMock).toHaveBeenCalledOnce();
    const [sql] = runWebappPgTextMock.mock.calls[0] as [string];
    expect(sql).toContain('user_contacts');
    expect(sql).toContain('confirmed_at IS NOT NULL');
    expect(sql).not.toContain('patient_phone_trust_at');
  });

  it('falls back to platform_users.patient_phone_trust_at when user_contacts has no row', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: TRUSTED_USER_ID }] });

    const id = await findTrustedCanonicalUserIdByPhone({} as never, PHONE);

    expect(id).toBe(TRUSTED_USER_ID);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const [legacySql] = runWebappPgTextMock.mock.calls[1] as [string];
    expect(legacySql).toContain('patient_phone_trust_at IS NOT NULL');
  });
});
