/**
 * D15b/5 audit MF-1..2: dual-write mirror after FIO writers.
 *
 * MF-3 (booking-merge COALESCE reader) moved with `pgPublicBookingMergeCandidates` into a named DB
 * door (Track D synthesis 26.08, migration `20260826T140000_…`) — the COALESCE-over-`user_identity`
 * property it asserted now lives in SQL, not in a TS query-text fragment, and is proven behaviorally
 * by `deploy/postgres/privileges/public-booking-merge-candidates.devDbProof.test.mjs` instead of by
 * matching source text here (AGENTS.md §10a).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncMirrorMock = vi.hoisted(() => vi.fn());
const syncContactsMirrorMock = vi.hoisted(() => vi.fn());
const runIdentityClientPgTextMock = vi.hoisted(() => vi.fn());
const runIdentityPoolPgTextMock = vi.hoisted(() => vi.fn());
const withPoolTransactionMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());
const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/repos/userContactsSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userContactsSql')>();
  return {
    ...actual,
    mutateCanonicalUserContactsWebapp: syncContactsMirrorMock,
  };
});

vi.mock('@/infra/repos/userIdentityFioSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userIdentityFioSql')>();
  return {
    ...actual,
    syncUserIdentityFioMirrorWebapp: syncMirrorMock,
  };
});

vi.mock('@/infra/repos/identityPhoneSql', () => ({
  runIdentityClientPgText: runIdentityClientPgTextMock,
  runIdentityPoolPgText: runIdentityPoolPgTextMock,
}));

vi.mock('@/infra/db/withClient', () => ({
  withPoolTransaction: withPoolTransactionMock,
}));

vi.mock('@/infra/db/client', () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  getWebappSqlDb: vi.fn(() => ({
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: OAUTH_USER_ID }],
      }),
    }),
  })),
}));

vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({
  resolveCanonicalUserId: resolveCanonicalUserIdMock,
  findCanonicalUserIdByPhone: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return {
    ...actual,
    getCurrentDbPrincipalPlatformUserId: vi.fn(),
    runWithDbOrganizationPrincipal: vi.fn((_orgId: string, fn: () => unknown) => fn()),
  };
});

import { pgOAuthUserResolvePort } from '@/infra/repos/pgOAuthUserResolve';
import { pgUserByPhonePort } from '@/infra/repos/pgUserByPhone';

const LOCKED_USER_ID = '00000000-0000-4000-8000-0000000d0001';
const OAUTH_USER_ID = '00000000-0000-4000-8000-0000000d0002';

beforeEach(() => {
  vi.clearAllMocks();
  syncMirrorMock.mockResolvedValue(undefined);
  syncContactsMirrorMock.mockResolvedValue(undefined);
});

describe('D15b/5 MF-1 — pgUserByPhone locked-binding dual-write', () => {
  it('mirrors FIO into user_identity after display_name update on an existing locked binding', async () => {
    const fakeClient = { tag: 'tx-client' };
    withPoolTransactionMock.mockImplementation(async (_pool, fn) => fn(fakeClient));
    resolveCanonicalUserIdMock.mockResolvedValue(LOCKED_USER_ID);
    runIdentityClientPgTextMock
      .mockResolvedValueOnce({ rows: [{ user_id: LOCKED_USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ user_id: LOCKED_USER_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    runIdentityPoolPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: LOCKED_USER_ID,
            display_name: 'Иван',
            first_name: null,
            last_name: null,
            patronymic: null,
            role: 'client',
            phone_normalized: '+79001234567',
            session_epoch: 1,
            is_archived: false,
            is_blocked: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            contact_kind: 'phone',
            value_normalized: '+79001234567',
            is_primary: true,
            confirmed_at: new Date(),
            source_origin: 'direct',
          },
        ],
      });

    // D15b/6 confirm-path correction: `createOrBind` for a `web` channel (no channel to bind) now
    // resolves through the atomic `pre_session` SQL root instead of this relation-based transaction
    // (`pgUserByPhone.ts`), and so does a bare messenger channel (no `profileBindOrganizationId`) —
    // see `pgUserByPhone.createOrBind.messengerChannel.unit.test.ts`. The relation-based transaction
    // this test exercises now survives ONLY for `profileBindOrganizationId` (an already-authenticated,
    // organization-scoped bind, wrapped by a real `runWithDbOrganizationPrincipal`, mocked below to
    // just invoke its callback) — `app.auth_phone_bind_lock_channel_binding` itself only ever locks a
    // real binding for `telegram`/`max`/`vk` (never `web`), so a "locked binding" scenario is only
    // realistic for a messenger channel. Use one here to keep exercising this relation-based path.
    await pgUserByPhonePort.createOrBind(
      '+79001234567',
      { channel: 'telegram', chatId: 'device-1', displayName: 'Иван' },
      { profileBindOrganizationId: 'org-1' },
    );

    expect(syncMirrorMock).toHaveBeenCalledOnce();
    expect(syncMirrorMock).toHaveBeenCalledWith(fakeClient, LOCKED_USER_ID);
    expect(syncContactsMirrorMock).toHaveBeenCalledOnce();
    expect(syncContactsMirrorMock).toHaveBeenCalledWith(fakeClient, LOCKED_USER_ID, [
      expect.objectContaining({ action: 'upsert', kind: 'phone' }),
    ]);
    const updateCall = runIdentityClientPgTextMock.mock.calls.find(
      ([, sql]) => typeof sql === 'string' && sql.includes('UPDATE platform_users'),
    );
    expect(updateCall?.[1]).toContain('display_name');
  });
});

describe('D15b/5 MF-2 — pgOAuthUserResolve createOAuthPlatformUser dual-write', () => {
  it('mirrors FIO into user_identity after OAuth platform user insert', async () => {
    const userId = await pgOAuthUserResolvePort.createOAuthPlatformUser({
      phoneNorm: null,
      display: 'Иван Иванов',
      emailRaw: 'ivan@example.com',
      emailVerifiedAt: new Date(),
    });

    expect(userId).toBe(OAUTH_USER_ID);
    expect(syncMirrorMock).toHaveBeenCalledOnce();
    expect(syncMirrorMock).toHaveBeenCalledWith(expect.anything(), OAUTH_USER_ID);
    expect(syncContactsMirrorMock).toHaveBeenCalledOnce();
    expect(syncContactsMirrorMock).toHaveBeenCalledWith(expect.anything(), OAUTH_USER_ID, []);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });
});
