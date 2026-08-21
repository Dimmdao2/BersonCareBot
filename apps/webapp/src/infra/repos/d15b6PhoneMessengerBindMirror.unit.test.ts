/**
 * D15b/6: messenger bind (secret lifecycle, completion-state read, and — messenger confirm-path
 * correction — the pre-OTP contact/channel resolve) goes through exact named `pre_session` roots,
 * never a raw relation transaction the bootstrap principal has no door for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const runIdentityClientPgTextMock = vi.hoisted(() => vi.fn());
const runWebappNamedRootMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/repos/identityPhoneSql', () => ({
  runIdentityClientPgText: runIdentityClientPgTextMock,
  runIdentityPoolPgTextOnPool: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({ tag: 'root-db' })),
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  runWebappNamedRoot: runWebappNamedRootMock,
  webappSqlFromPgText: vi.fn(() => ({ tag: 'root-sql' })),
}));

import { createPgPhoneMessengerBindPort } from '@/infra/repos/pgPhoneMessengerBind';

const SESSION_USER_ID = '00000000-0000-4000-8000-0000000d0001';
const NEW_LOGIN_USER_ID = '00000000-0000-4000-8000-0000000d0003';
const fakePool = {
  connect() {
    throw new Error('test unexpectedly requested a pool connection');
  },
  query() {
    throw new Error('test unexpectedly queried through the pool');
  },
} as unknown as Pool;

beforeEach(() => {
  vi.resetAllMocks();
  runWebappNamedRootMock.mockResolvedValue({ rows: [] });
});

describe('D15b/6 — pgPhoneMessengerBind canonical contact write', () => {
  it('starts the bearer secret through one exact named root instead of relation SQL', async () => {
    const port = createPgPhoneMessengerBindPort(fakePool);
    await port.startSecret({
      tokenHash: 'token-hash',
      phoneNormalized: '+79001234567',
      channelCode: 'telegram',
      purpose: 'login',
      userId: null,
      expiresAtIso: '2026-08-14T19:00:00.000Z',
    });

    expect(runWebappNamedRootMock).toHaveBeenCalledWith(
      { tag: 'root-db' },
      'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)',
      [
        'start',
        'token-hash',
        null,
        '+79001234567',
        'telegram',
        'login',
        null,
        null,
        null,
        '2026-08-14T19:00:00.000Z',
      ],
      { tag: 'root-sql' },
    );
    expect(runIdentityClientPgTextMock).not.toHaveBeenCalled();
  });

  it('verifies completion through the exact read-only root without opening a relation transaction', async () => {
    runWebappNamedRootMock.mockResolvedValueOnce({
      rows: [
        {
          ready: false,
          account_created: false,
          sync_target_user_id: SESSION_USER_ID,
          canonical_user_id: null,
        },
      ],
    });
    const port = createPgPhoneMessengerBindPort(fakePool);

    const result = await port.verifyCompletionState({
      tokenHash: 'completion-token-hash',
      channelCode: 'telegram',
      externalId: 'tg-completion',
      contactPhoneNormalized: '+79001234567',
    });

    expect(result).toEqual({
      ready: false,
      accountCreated: false,
      syncTargetUserId: SESSION_USER_ID,
      canonicalUserId: null,
    });
    expect(runWebappNamedRootMock).toHaveBeenCalledWith(
      { tag: 'root-db' },
      'app.phone_messenger_bind_completion_state(text,text,text,text)',
      ['completion-token-hash', 'telegram', 'tg-completion', '+79001234567'],
      { tag: 'root-sql' },
    );
    expect(runIdentityClientPgTextMock).not.toHaveBeenCalled();
  });

  it('profile_bind: resolves through the exact named root instead of a relation transaction', async () => {
    runWebappNamedRootMock.mockResolvedValueOnce({
      rows: [
        {
          result: {
            outcome: 'resolved',
            was_created: false,
            id: SESSION_USER_ID,
            display_name: 'Иван',
            role: 'client',
            session_epoch: 1,
            is_archived: false,
            contacts: [],
            bindings: [],
          },
        },
      ],
    });

    const port = createPgPhoneMessengerBindPort(fakePool);
    const result = await port.applyMessengerContactPreOtp({
      phoneNormalized: '+79001234567',
      channelCode: 'telegram',
      externalId: 'tg-1',
      purpose: 'profile_bind',
      sessionUserId: SESSION_USER_ID,
    });

    expect(result).toEqual({ ok: true, accountCreated: false });
    expect(runWebappNamedRootMock).toHaveBeenCalledTimes(1);
    const [db, identity, args] = runWebappNamedRootMock.mock.calls[0]!;
    expect(db).toEqual({ tag: 'root-db' });
    expect(identity).toBe('app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)');
    expect(args).toEqual(['telegram', 'tg-1', '+79001234567', null, 'telegram', SESSION_USER_ID]);
    expect(runIdentityClientPgTextMock).not.toHaveBeenCalled();
  });

  it('profile_bind: fails closed without a session id instead of resolving anonymously', async () => {
    const port = createPgPhoneMessengerBindPort(fakePool);
    const result = await port.applyMessengerContactPreOtp({
      phoneNormalized: '+79001234567',
      channelCode: 'telegram',
      externalId: 'tg-1',
      purpose: 'profile_bind',
      sessionUserId: null,
    });

    expect(result).toEqual({ ok: false, code: 'session_required' });
    expect(runWebappNamedRootMock).not.toHaveBeenCalled();
  });

  it('login: resolves the newly created account through the exact named root', async () => {
    runWebappNamedRootMock.mockResolvedValueOnce({
      rows: [
        {
          result: {
            outcome: 'resolved',
            was_created: true,
            id: NEW_LOGIN_USER_ID,
            display_name: '+79007654321',
            role: 'client',
            session_epoch: 1,
            is_archived: false,
            contacts: [],
            bindings: [{ channel_code: 'telegram', external_id: 'tg-2' }],
          },
        },
      ],
    });

    const port = createPgPhoneMessengerBindPort(fakePool);
    const result = await port.applyMessengerContactPreOtp({
      phoneNormalized: '+79007654321',
      channelCode: 'telegram',
      externalId: 'tg-2',
      purpose: 'login',
    });

    expect(result).toEqual({ ok: true, accountCreated: true });
    expect(runWebappNamedRootMock).toHaveBeenCalledTimes(1);
    const [db, identity, args] = runWebappNamedRootMock.mock.calls[0]!;
    expect(db).toEqual({ tag: 'root-db' });
    expect(identity).toBe('app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)');
    expect(args).toEqual(['telegram', 'tg-2', '+79007654321', null, 'telegram', null]);
    expect(runIdentityClientPgTextMock).not.toHaveBeenCalled();
  });

  it('login: fails closed on a channel/phone-owner conflict with the candidate ids for manual merge', async () => {
    runWebappNamedRootMock.mockResolvedValueOnce({
      rows: [{ result: { outcome: 'conflict', candidate_ids: [NEW_LOGIN_USER_ID, SESSION_USER_ID] } }],
    });

    const port = createPgPhoneMessengerBindPort(fakePool);
    const result = await port.applyMessengerContactPreOtp({
      phoneNormalized: '+79007654321',
      channelCode: 'telegram',
      externalId: 'tg-2',
      purpose: 'login',
    });

    expect(result).toEqual({
      ok: false,
      code: 'merge_blocked_ambiguous_candidates',
      candidateIds: [NEW_LOGIN_USER_ID, SESSION_USER_ID],
    });
    // D15b/6 conflict-audit correction: exactly one call, into the named root — the audit case
    // (`messenger_phone_bind_blocked`) is produced by that SAME root, atomically with the conflict
    // decision (see the migration). No caller-side transaction is attempted: `fakePool` throws if its
    // `connect`/`query` is ever reached, and this port no longer exposes a `withTransaction`/
    // `recordMessengerBindBlocked` pair to reach it through.
    expect(runWebappNamedRootMock).toHaveBeenCalledTimes(1);
    expect(runIdentityClientPgTextMock).not.toHaveBeenCalled();
    expect(port).not.toHaveProperty('withTransaction');
    expect(port).not.toHaveProperty('recordMessengerBindBlocked');
  });
});
