import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D15b/6 repair proof. Mirrors the established pattern in
 * `pgEmailOtpPublic.namedRoots.unit.test.ts`: mock `runWebappNamedRoot` at the module boundary so
 * this exercises the REAL row-mapping/session-assembly code in `pgUserByPhonePort.findByPhone`
 * (not a route-level mock of the whole port, which `phoneStartFallback.route.test.ts` already
 * covers), while proving the exact declared capability identity/args used for the bootstrap
 * (pre-session) door — the same mechanism this suite uses elsewhere to prove "capability exact
 * function/purpose/typed args fail-closed" without a live DB.
 */
const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  getWebappSqlFromPgClient: fakes.getWebappSqlFromPgClient,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { pgUserByPhonePort } from './pgUserByPhone';

const FOUND_PAYLOAD = {
  found: true,
  id: 'user-1',
  display_name: 'Иванов Иван Иванович',
  first_name: 'Иван',
  last_name: 'Иванов',
  patronymic: 'Иванович',
  role: 'client',
  session_epoch: 3,
  is_archived: false,
  is_blocked: false,
  contacts: [
    {
      contact_kind: 'phone',
      value_normalized: '+79261234567',
      is_primary: true,
      confirmed_at: '2026-08-01T00:00:00.000Z',
      source_origin: 'direct',
    },
    {
      contact_kind: 'email',
      value_normalized: 'ivan@example.test',
      is_primary: true,
      confirmed_at: '2026-08-01T00:00:00.000Z',
      source_origin: 'direct',
    },
  ],
  bindings: [{ channel_code: 'telegram', external_id: '12345' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('pgUserByPhonePort.findByPhone (D15b/6 pre-session bootstrap door)', () => {
  it('reaches a session-shaped result for an existing canonical-contact user without a 500', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: FOUND_PAYLOAD }] });

    const user = await pgUserByPhonePort.findByPhone('+79261234567');

    expect(user).toEqual({
      userId: 'user-1',
      role: 'client',
      displayName: 'Иванов Иван Иванович',
      firstName: 'Иван',
      lastName: 'Иванов',
      patronymic: 'Иванович',
      contacts: [
        {
          kind: 'phone',
          value: '+79261234567',
          isPrimary: true,
          confirmedAt: '2026-08-01T00:00:00.000Z',
          sourceOrigin: 'direct',
        },
        {
          kind: 'email',
          value: 'ivan@example.test',
          isPrimary: true,
          confirmedAt: '2026-08-01T00:00:00.000Z',
          sourceOrigin: 'direct',
        },
      ],
      phone: '+79261234567',
      email: 'ivan@example.test',
      bindings: { telegramId: '12345' },
      sessionEpoch: 3,
    });
  });

  it('uses the exact declared bootstrap capability identity and typed args (fail-closed proof)', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: FOUND_PAYLOAD }] });

    await pgUserByPhonePort.findByPhone('+79261234567');

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0];
    expect(db).toBe(fakes.db);
    expect(identity).toBe('app.pre_session_find_session_user_by_phone(text)');
    expect(args).toEqual(['+79261234567']);
  });

  it('returns null for a missing number, staying neutral with no extra DB round-trip', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: { found: false } }] });

    const user = await pgUserByPhonePort.findByPhone('+79260000000');

    expect(user).toBeNull();
    // Same single named-root call as the found path — no second query leaks existence via timing.
    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
  });

  it('returns null for an archived identity (D2) instead of minting a session', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ result: { ...FOUND_PAYLOAD, is_archived: true } }],
    });

    const user = await pgUserByPhonePort.findByPhone('+79261234567');

    expect(user).toBeNull();
  });

  it('fails closed on an unrecognized payload shape instead of returning a partial session', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: { found: 'maybe' } }] });

    await expect(pgUserByPhonePort.findByPhone('+79261234567')).rejects.toThrow();
  });
});
