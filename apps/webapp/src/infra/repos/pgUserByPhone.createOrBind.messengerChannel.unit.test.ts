import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D15b/6 messenger confirm-path correction proof. Same pattern as
 * `pgUserByPhone.createOrBind.unit.test.ts`: mock `runWebappNamedRoot` at the module boundary so
 * this exercises the REAL row-mapping/session-assembly code in `pgUserByPhonePort.createOrBind` for
 * a messenger channel key (no `profileBindOrganizationId`) — proving the exact declared capability
 * identity/typed args and the fail-closed conflict/archived outcomes for `POST
 * /api/auth/phone/messenger-bind/finish`'s `confirmPhoneAuth` call, without a live DB.
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
  is_blocked: false,
  contacts: [
    {
      contact_kind: 'phone',
      value_normalized: '+79261234567',
      is_primary: true,
      confirmed_at: '2026-08-21T00:00:00.000Z',
      source_origin: 'direct',
    },
  ],
  bindings: [{ channel_code: 'telegram', external_id: 'tg-1' }],
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

describe('pgUserByPhonePort.createOrBind (D15b/6 messenger confirm-path bootstrap door)', () => {
  it('reaches a session result for an already channel-bound existing holder without a 500', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_EXISTING }] });

    const result = await pgUserByPhonePort.createOrBind('+79261234567', {
      channel: 'telegram',
      chatId: 'tg-1',
    });

    expect(result.wasCreated).toBe(false);
    expect(result.user).toEqual(
      expect.objectContaining({ userId: 'user-1', role: 'client', phone: '+79261234567' }),
    );
  });

  it('reaches a session result for a brand-new messenger registration', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_NEW }] });

    const result = await pgUserByPhonePort.createOrBind('+79261234567', {
      channel: 'max',
      chatId: 'max-2',
    });

    expect(result.wasCreated).toBe(true);
    expect(result.user.userId).toBe('user-2');
  });

  it('uses the exact declared bootstrap capability identity and typed args, keyed by the channel binding', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_EXISTING }] });

    await pgUserByPhonePort.createOrBind(
      '+79261234567',
      { channel: 'telegram', chatId: 'tg-1' },
      { confirmingChannel: 'telegram', phoneNumberProven: true },
    );

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0];
    expect(db).toBe(fakes.db);
    expect(identity).toBe(
      'app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)',
    );
    expect(args).toEqual(['telegram', 'tg-1', '+79261234567', null, 'telegram', null]);
  });

  it('passes profileBindUserId through as the session candidate for an already-authenticated bind', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: RESOLVED_EXISTING }] });

    await pgUserByPhonePort.createOrBind(
      '+79261234567',
      { channel: 'telegram', chatId: 'tg-1' },
      { profileBindUserId: 'user-1' },
    );

    const [, , args] = fakes.runWebappNamedRoot.mock.calls[0];
    expect(args).toEqual(['telegram', 'tg-1', '+79261234567', null, null, 'user-1']);
  });

  it('fails closed instead of guessing when the channel owner and the phone owner disagree', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ result: { outcome: 'conflict', candidate_ids: ['user-1', 'user-2'] } }],
    });

    await expect(
      pgUserByPhonePort.createOrBind('+79261234567', { channel: 'telegram', chatId: 'tg-1' }),
    ).rejects.toThrow('createOrBind: ambiguous messenger channel/phone holders');
  });

  it('refuses to mint a session for an archived identity (D2) instead of resurrecting it', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ result: { ...RESOLVED_EXISTING, is_archived: true } }],
    });

    await expect(
      pgUserByPhonePort.createOrBind('+79261234567', { channel: 'telegram', chatId: 'tg-1' }),
    ).rejects.toThrow('createOrBind: platform user cannot start a session');
  });
});
