/**
 * D15b/6 audit MF: `user_contacts` mirror after messenger channel bind + canonical phone lookup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const syncMirrorMock = vi.hoisted(() => vi.fn());
const syncContactsMirrorMock = vi.hoisted(() => vi.fn());
const runIdentityClientPgTextMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());
const findCanonicalUserIdByPhoneMock = vi.hoisted(() => vi.fn());
const applyPhoneHistoryMock = vi.hoisted(() => vi.fn());
const upsertBroadcastMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/repos/userIdentityFioSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userIdentityFioSql')>();
  return {
    ...actual,
    syncUserIdentityFioMirrorWebapp: syncMirrorMock,
  };
});

vi.mock('@/infra/repos/userContactsSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userContactsSql')>();
  return {
    ...actual,
    syncUserContactsMirrorWebapp: syncContactsMirrorMock,
  };
});

vi.mock('@/infra/repos/identityPhoneSql', () => ({
  runIdentityClientPgText: runIdentityClientPgTextMock,
  runIdentityPoolPgTextOnPool: vi.fn(),
}));

vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({
  resolveCanonicalUserId: resolveCanonicalUserIdMock,
  findCanonicalUserIdByPhone: findCanonicalUserIdByPhoneMock,
}));

vi.mock('@/infra/repos/pgPhoneHistory', () => ({
  applyPlatformUserPhoneHistoryTransition: applyPhoneHistoryMock,
}));

vi.mock('@/infra/upsertBroadcastDefaultsAfterChannelBind', () => ({
  upsertBroadcastDefaultsAfterChannelBind: upsertBroadcastMock,
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlFromPgClient: vi.fn(() => ({})),
}));

vi.mock('@bersoncare/platform-merge', () => ({
  applyMessengerPhonePublicBind: vi.fn(),
  classifyMergeFailure: vi.fn(),
  enrichMessengerBindAuditDetailsFields: vi.fn(),
  mergePlatformUsersInTransaction: vi.fn(),
  MessengerPhoneLinkError: class MessengerPhoneLinkError extends Error {},
}));

import { createPgPhoneMessengerBindPort } from '@/infra/repos/pgPhoneMessengerBind';

const SESSION_USER_ID = '00000000-0000-4000-8000-0000000d0001';
const NEW_LOGIN_USER_ID = '00000000-0000-4000-8000-0000000d0003';
const fakeClient = { tag: 'tx-client' };
const fakePool = {
  connect() {
    throw new Error('test unexpectedly requested a pool connection');
  },
  query() {
    throw new Error('test unexpectedly queried through the pool');
  },
} as unknown as Pool;

function channelBindingInsertIndex(): number {
  return runIdentityClientPgTextMock.mock.calls.findIndex(
    ([, sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO user_channel_bindings'),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  syncMirrorMock.mockResolvedValue(undefined);
  syncContactsMirrorMock.mockResolvedValue(undefined);
  applyPhoneHistoryMock.mockResolvedValue(undefined);
  upsertBroadcastMock.mockResolvedValue(undefined);
});

describe('D15b/6 — pgPhoneMessengerBind mirror after channel bind', () => {
  it('profile_bind: mirrors user_contacts after channel INSERT (not only via phone-history)', async () => {
    resolveCanonicalUserIdMock.mockResolvedValue(SESSION_USER_ID);
    findCanonicalUserIdByPhoneMock.mockResolvedValue(null);
    runIdentityClientPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: SESSION_USER_ID }] });

    const port = createPgPhoneMessengerBindPort(fakePool);
    const result = await port.applyMessengerContactPreOtp(fakeClient as never, {
      phoneNormalized: '+79001234567',
      channelCode: 'telegram',
      externalId: 'tg-1',
      purpose: 'profile_bind',
      sessionUserId: SESSION_USER_ID,
    });

    expect(result).toEqual({ ok: true, accountCreated: false });
    expect(findCanonicalUserIdByPhoneMock).toHaveBeenCalledWith({}, '+79001234567');
    const bindIdx = channelBindingInsertIndex();
    expect(bindIdx).toBeGreaterThanOrEqual(0);
    const mirrorAfterBind = syncContactsMirrorMock.mock.invocationCallOrder.some(
      (mirrorOrder) =>
        mirrorOrder > runIdentityClientPgTextMock.mock.invocationCallOrder[bindIdx]!,
    );
    expect(mirrorAfterBind).toBe(true);
    expect(syncContactsMirrorMock).toHaveBeenCalledWith(fakeClient, SESSION_USER_ID);
  });

  it('login: mirrors user_contacts after channel INSERT on the login bind path', async () => {
    findCanonicalUserIdByPhoneMock.mockResolvedValue(null);
    resolveCanonicalUserIdMock.mockImplementation(async (_db, id: string) => id);
    runIdentityClientPgTextMock.mockImplementation(async (_client, sql: string) => {
      if (sql.includes('FROM user_channel_bindings ucb')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO platform_users')) {
        return { rows: [{ id: NEW_LOGIN_USER_ID }] };
      }
      if (sql.includes('INSERT INTO user_channel_bindings')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const port = createPgPhoneMessengerBindPort(fakePool);
    const result = await port.applyMessengerContactPreOtp(fakeClient as never, {
      phoneNormalized: '+79007654321',
      channelCode: 'telegram',
      externalId: 'tg-2',
      purpose: 'login',
    });

    expect(result).toEqual({ ok: true, accountCreated: true });
    expect(findCanonicalUserIdByPhoneMock).toHaveBeenCalledWith({}, '+79007654321');
    const bindIdx = channelBindingInsertIndex();
    expect(bindIdx).toBeGreaterThanOrEqual(0);
    const mirrorAfterBind = syncContactsMirrorMock.mock.invocationCallOrder.some(
      (mirrorOrder) =>
        mirrorOrder > runIdentityClientPgTextMock.mock.invocationCallOrder[bindIdx]!,
    );
    expect(mirrorAfterBind).toBe(true);
    expect(syncContactsMirrorMock).toHaveBeenCalledWith(fakeClient, NEW_LOGIN_USER_ID);
  });
});
