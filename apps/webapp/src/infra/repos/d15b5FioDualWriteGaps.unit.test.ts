/**
 * D15b/5 audit MF-1..3: dual-write mirror after FIO writers + COALESCE reader for booking merge.
 */
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncMirrorMock = vi.hoisted(() => vi.fn());
const runIdentityClientPgTextMock = vi.hoisted(() => vi.fn());
const runIdentityPoolPgTextMock = vi.hoisted(() => vi.fn());
const withPoolTransactionMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());
const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runPgPoolPgTextMock = vi.hoisted(() => vi.fn());

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
  runPgPoolPgText: runPgPoolPgTextMock,
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  getWebappSqlDb: vi.fn(() => ({})),
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
import { findPublicBookingNameCollisionCandidates } from '@/infra/repos/pgPublicBookingMergeCandidates';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';
import { pgUserByPhonePort } from '@/infra/repos/pgUserByPhone';

const LOCKED_USER_ID = '00000000-0000-4000-8000-0000000d0001';
const OAUTH_USER_ID = '00000000-0000-4000-8000-0000000d0002';

beforeEach(() => {
  vi.clearAllMocks();
  syncMirrorMock.mockResolvedValue(undefined);
});

describe('D15b/5 MF-1 — pgUserByPhone locked-binding dual-write', () => {
  it('mirrors FIO into user_identity after display_name update on an existing locked binding', async () => {
    const fakeClient = { tag: 'tx-client' };
    withPoolTransactionMock.mockImplementation(async (_pool, fn) => fn(fakeClient));
    resolveCanonicalUserIdMock.mockResolvedValue(LOCKED_USER_ID);
    runIdentityClientPgTextMock
      .mockResolvedValueOnce({ rows: [] })
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
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await pgUserByPhonePort.createOrBind(
      '+79001234567',
      { channel: 'web', chatId: 'device-1', displayName: 'Иван' },
    );

    expect(syncMirrorMock).toHaveBeenCalledOnce();
    expect(syncMirrorMock).toHaveBeenCalledWith(fakeClient, LOCKED_USER_ID);
    const updateCall = runIdentityClientPgTextMock.mock.calls.find(
      ([, sql]) => typeof sql === 'string' && sql.includes('UPDATE platform_users'),
    );
    expect(updateCall?.[1]).toContain('display_name');
  });
});

describe('D15b/5 MF-2 — pgOAuthUserResolve createOAuthPlatformUser dual-write', () => {
  it('mirrors FIO into user_identity after OAuth platform user insert', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: OAUTH_USER_ID }] });

    const userId = await pgOAuthUserResolvePort.createOAuthPlatformUser({
      phoneNorm: null,
      display: 'Иван Иванов',
      emailRaw: 'ivan@example.com',
      emailVerifiedAt: new Date().toISOString(),
    });

    expect(userId).toBe(OAUTH_USER_ID);
    expect(syncMirrorMock).toHaveBeenCalledOnce();
    expect(syncMirrorMock).toHaveBeenCalledWith(expect.anything(), OAUTH_USER_ID);
    const [insertSql] = runWebappPgTextMock.mock.calls[0] as [string];
    expect(insertSql).toContain('INSERT INTO platform_users');
    expect(insertSql).toContain('display_name');
  });
});

describe('D15b/5 MF-3 — pgPublicBookingMergeCandidates COALESCE reader', () => {
  it('matches booking contact names via user_identity COALESCE, not platform_users.display_name only', async () => {
    runPgPoolPgTextMock.mockResolvedValueOnce({ rows: [] });

    await findPublicBookingNameCollisionCandidates({
      pool: {} as Pool,
      anchorUserId: '00000000-0000-4000-8000-0000000d0003',
      contactName: 'Пётр Петров',
    });

    expect(runPgPoolPgTextMock).toHaveBeenCalledOnce();
    const [, sql] = runPgPoolPgTextMock.mock.calls[0] as [unknown, string, unknown[]];
    expect(sql).toContain(USER_IDENTITY_FIO_JOIN);
    expect(sql).toContain(FIO.displayName);
    expect(sql).not.toMatch(/lower\(trim\(display_name\)\)/);
  });
});
