import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDrizzleOrMutationTxMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  getDrizzleOrMutationTx: getDrizzleOrMutationTxMock,
}));

import { resolveOrCreateTrustedPatientUserByPhone } from './pgPublicBookingUserResolve';

/**
 * A-3, requirement "never mint trust without proof". Before 2026-07-26 this insert stamped
 * `patient_phone_trust_at` unconditionally, so an anonymous POST to the public booking endpoint
 * minted a phone-trusted identity — the same flag the login path reads.
 */
function tx(existingRows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(existingRows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const returning = vi.fn().mockResolvedValue([{ id: 'user-new' }]);
  const values = vi.fn(() => ({ returning }));
  return {
    handle: { select: vi.fn(() => ({ from })), insert: vi.fn(() => ({ values })) },
    values,
    where,
  };
}

describe('public booking identity resolution — trust requires proof', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves patient_phone_trust_at NULL when control of the phone was not proved', async () => {
    const t = tx([]);
    getDrizzleOrMutationTxMock.mockReturnValue(t.handle);

    await resolveOrCreateTrustedPatientUserByPhone('+70000000000', 'Synthetic', false);

    expect(t.values).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNormalized: '+70000000000', patientPhoneTrustAt: null }),
    );
  });

  it('stamps patient_phone_trust_at only when control was proved', async () => {
    const t = tx([]);
    getDrizzleOrMutationTxMock.mockReturnValue(t.handle);

    await resolveOrCreateTrustedPatientUserByPhone('+70000000000', 'Synthetic', true);

    expect(t.values).toHaveBeenCalledWith(
      expect.objectContaining({ patientPhoneTrustAt: expect.any(String) }),
    );
  });

  it('never re-stamps trust on an identity that already exists', async () => {
    const t = tx([{ id: 'user-existing' }]);
    getDrizzleOrMutationTxMock.mockReturnValue(t.handle);

    await expect(
      resolveOrCreateTrustedPatientUserByPhone('+70000000000', 'Synthetic', true),
    ).resolves.toEqual({ userId: 'user-existing', created: false });

    expect(t.handle.insert).not.toHaveBeenCalled();
  });

  it('keeps the trust decision a required argument, so no call site can inherit a default', () => {
    const source = readFileSync(
      new URL('./pgPublicBookingUserResolve.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('phoneProven: boolean,');
    expect(source).not.toContain('phoneProven?:');
    expect(source).not.toMatch(/phoneProven\s*=/);
    expect(source).toContain('patientPhoneTrustAt: phoneProven ?');
  });

  it('matches by phone only — the scope of that match is a documented property, not an accident', () => {
    const source = readFileSync(
      new URL('./pgPublicBookingUserResolve.ts', import.meta.url),
      'utf8',
    );
    // `platform_users` has no `organization_id` (A-4 is the item that changes that), so this lookup
    // is global by construction. It stays global here ON PURPOSE — a person is one person across
    // clinics — and A-3's answer is that reaching that person now costs a proof of control, not
    // that the lookup narrows. If this ever grows an organisation predicate, that is a deliberate
    // identity-model change and this assertion is the place it gets noticed.
    expect(source).not.toContain('organizationId');
    expect(source).toContain('platformUsers.phoneNormalized');
    expect(source).toContain('isNull(platformUsers.mergedIntoId)');
  });
});
