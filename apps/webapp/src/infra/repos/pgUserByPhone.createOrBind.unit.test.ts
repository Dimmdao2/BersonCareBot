import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D15b/6 confirm-path correction proof. Mirrors the established pattern in
 * `pgUserByPhone.findByPhone.unit.test.ts`: mock `runWebappNamedRoot` at the module boundary so
 * this exercises the REAL row-mapping/session-assembly code in `pgUserByPhonePort.createOrBind`
 * for the plain phone login/registration case (no channel to bind, no profile-bind session) —
 * proving the exact declared capability identity/typed args, the successful start→confirm result
 * shape for both existing and new identities, and the fail-closed conflict/archived outcomes,
 * without a live DB.
 *
 * The messenger-channel branch (no `profileBindOrganizationId`) is a sibling atomic root call, keyed
 * by the channel binding — covered separately by
 * `pgUserByPhone.createOrBind.messengerChannel.unit.test.ts`. Only the `profileBindOrganizationId`
 * branch still uses the original relation-based transaction (a real, non-bootstrap organization
 * principal wraps it) — covered by `d15b5FioDualWriteGaps.unit.test.ts`.
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

const RESOLVED_EXISTING = {
  outcome: 'resolved',
  was_created: false,
  id: 'user-1',
  display_name: 'Иванов Иван Иванович',
  first_name: 'Иван',
  last_name: 'Иванов',
  patronymic: 'Иванович',
  role: 'client',
  session_epoch: 3,
  is_archived: false,
  contacts: [
    {
      contact_kind: 'phone',
      value_normalized: '+79261234567',
      is_primary: true,
      confirmed_at: '2026-08-21T00:00:00.000Z',
      source_origin: 'direct',
    },
  ],
  bindings: [],
};

const RESOLVED_NEW = {
  ...RESOLVED_EXISTING,
  was_created: true,
  id: 'user-2',
  display_name: '+79261234567',
  first_name: null,
  last_name: null,
  patronymic: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('pgUserByPhonePort.createOrBind (D15b/6 confirm-path bootstrap door)', () => {
  it('reaches a session result for an existing canonical-contact user without a 500', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_EXISTING }] });

    const result = await pgUserByPhonePort.createOrBind('+79261234567', {
      channel: 'web',
      chatId: 'device-1',
    });

    expect(result.wasCreated).toBe(false);
    expect(result.user).toEqual(
      expect.objectContaining({ userId: 'user-1', role: 'client', phone: '+79261234567' }),
    );
  });

  it('reaches a session result for a brand-new registration', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_NEW }] });

    const result = await pgUserByPhonePort.createOrBind('+79261234567', {
      channel: 'web',
      chatId: 'device-2',
    });

    expect(result.wasCreated).toBe(true);
    expect(result.user.userId).toBe('user-2');
  });

  it('uses the exact declared bootstrap capability identity and typed args (fail-closed proof)', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_EXISTING }] });

    await pgUserByPhonePort.createOrBind(
      '+79261234567',
      { channel: 'web', chatId: 'device-1', displayName: 'Иван' },
      { phoneNumberProven: true, confirmingChannel: 'sms' },
    );

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0];
    expect(db).toBe(fakes.db);
    expect(identity).toBe('app.pre_session_phone_confirm_resolve(text,text,boolean,text)');
    expect(args).toEqual(['+79261234567', 'Иван', true, 'sms']);
  });

  it('fails closed instead of guessing on an ambiguous live-duplicate conflict', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: { outcome: 'conflict' } }] });

    await expect(
      pgUserByPhonePort.createOrBind('+79261234567', { channel: 'web', chatId: 'device-1' }),
    ).rejects.toThrow('createOrBind: ambiguous live phone holders');
  });

  it('refuses to mint a session for an archived identity (D2) instead of resurrecting it', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ result: { ...RESOLVED_EXISTING, is_archived: true } }],
    });

    await expect(
      pgUserByPhonePort.createOrBind('+79261234567', { channel: 'web', chatId: 'device-1' }),
    ).rejects.toThrow('createOrBind: platform user is archived');
  });

  it('fails closed on an unrecognized payload shape instead of returning a partial session', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: { outcome: 'maybe' } }] });

    await expect(
      pgUserByPhonePort.createOrBind('+79261234567', { channel: 'web', chatId: 'device-1' }),
    ).rejects.toThrow();
  });
});
