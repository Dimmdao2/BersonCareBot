import { beforeEach, describe, expect, it, vi } from 'vitest';

const runIdentityClientPgTextMock = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/infra/db/client', () => ({ getPool: vi.fn(() => ({})) }));
vi.mock('@/infra/db/withClient', () => ({
  withPoolTransaction: vi.fn(async (_pool, work) => work(fakeClient)),
}));
vi.mock('@/infra/repos/identityPhoneSql', () => ({
  runIdentityClientSql: runIdentityClientPgTextMock,
}));
vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({
  findTrustedCanonicalUserIdByPhone: vi.fn(),
  resolveCanonicalUserId: vi.fn(),
}));
vi.mock('@/infra/repos/pgUserProjection', () => ({
  mergeCanonicalPlatformUserCandidates: vi.fn(),
}));
vi.mock('@/infra/upsertBroadcastDefaultsAfterChannelBind', () => ({
  upsertBroadcastDefaultsAfterChannelBind: vi.fn(),
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  runWebappNamedRoot: vi.fn(),
}));
vi.mock('@/infra/repos/userIdentityFioSql', () => ({
  syncUserIdentityFioMirrorWebapp: vi.fn(),
}));
vi.mock('@/infra/repos/pgUserByPhone', () => ({ loadSessionIdentityUser: vi.fn() }));

import { pgIdentityResolutionPort } from './pgIdentityResolution';

describe('public identity cutover: bot entry is resolve-only', () => {
  beforeEach(() => {
    runIdentityClientPgTextMock.mockReset();
    runIdentityClientPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
  });

  it('does not perform a second database operation when the exact channel binding is missing', async () => {
    const result = await pgIdentityResolutionPort.resolveByChannelBinding({
      channelCode: 'telegram',
      externalId: 'unbound-chat',
      displayName: 'Unregistered person',
      role: 'client',
    });

    expect(result).toBeNull();
    expect(runIdentityClientPgTextMock).toHaveBeenCalledTimes(1);
  });
});
