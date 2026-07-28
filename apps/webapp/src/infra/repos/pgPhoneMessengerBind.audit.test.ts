import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { createPgPhoneMessengerBindPort } from '@/infra/repos/pgPhoneMessengerBind';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runPgPoolPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentObservabilityContext: vi.fn(() => ({})),
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
  applyCurrentDbPrincipalToTransaction: vi.fn(async () => false),
}));

vi.mock('@/infra/db/client', () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/infra/db/withClient', () => ({
  withPoolTransaction: vi.fn(),
}));

vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({
  resolveCanonicalUserId: vi.fn(async (_client: unknown, id: string) => id),
}));

vi.mock('@/infra/repos/pgPhoneHistory', () => ({
  applyPlatformUserPhoneHistoryTransition: vi.fn(),
}));

vi.mock('@/infra/upsertBroadcastDefaultsAfterChannelBind', () => ({
  upsertBroadcastDefaultsAfterChannelBind: vi.fn(),
}));

vi.mock('@bersoncare/platform-merge', () => ({
  applyMessengerPhonePublicBind: vi.fn(),
  classifyMergeFailure: vi.fn(),
  enrichMessengerBindAuditDetailsFields: vi.fn(async () => ({})),
  mergePlatformUsersInTransaction: vi.fn(),
  MessengerPhoneLinkError: class MessengerPhoneLinkError extends Error {
    readonly code: string;
    readonly candidateIds: string[];

    constructor(code: string, options?: { candidateIds?: string[] }) {
      super(code);
      this.code = code;
      this.candidateIds = options?.candidateIds ?? [];
    }
  },
}));

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEFAULT_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const client = {} as PoolClient;

describe('pgPhoneMessengerBind admin audit log', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
  });

  it('stamps anomaly audit rows with default organization fallback', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgPhoneMessengerBindPort({ query: vi.fn() } as never);
    await port.recordMessengerBindBlocked?.(client, {
      reason: 'missing_ids',
      candidateIds: [],
      channelCode: 'telegram',
      externalId: 'tg-1',
      phoneNormalized: '+79991234567',
      source: 'test',
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const [sql, values] = runWebappPgTextMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain('INSERT INTO admin_audit_log (organization_id, actor_id, action');
    expect(String(sql)).toContain('messenger_phone_bind_anomaly');
    expect(values).toEqual([DEFAULT_ORG_ID, null, expect.any(String), 'error']);
    expect(JSON.parse(String((values as unknown[])[2]))).toMatchObject({
      reason: 'missing_ids',
      candidateIds: [],
      channelCode: 'telegram',
      externalId: 'tg-1',
      phoneSuffix: '4567',
      source: 'test',
    });
  });

  it('stamps blocked audit rows with current organization without changing global conflict dedupe', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgPhoneMessengerBindPort({ query: vi.fn() } as never);
    await port.recordMessengerBindBlocked?.(client, {
      reason: 'merge_blocked_distinct_real_users',
      candidateIds: ['u-2', 'u-1'],
      channelCode: 'max',
      externalId: 'max-1',
      phoneNormalized: '+79990000001',
      source: 'test',
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const [selectSql, selectValues] = runWebappPgTextMock.mock.calls[0] ?? [];
    expect(String(selectSql)).toContain('WHERE conflict_key = $1 AND resolved_at IS NULL');
    expect(String(selectSql)).not.toContain('organization_id');
    expect(selectValues).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/)]);

    const [insertSql, insertValues] = runWebappPgTextMock.mock.calls[1] ?? [];
    expect(String(insertSql)).toContain('(organization_id, actor_id, action');
    expect(String(insertSql)).toContain('messenger_phone_bind_blocked');
    expect(String(insertSql)).toContain('ON CONFLICT (conflict_key) WHERE resolved_at IS NULL');
    expect(insertValues).toEqual([
      ORG_ID,
      'u-2',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(String),
      'error',
    ]);
  });

  it('preserves global existing-row repeat update for blocked audit rows', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', repeat_count: 1 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgPhoneMessengerBindPort({ query: vi.fn() } as never);
    await port.recordMessengerBindBlocked?.(client, {
      reason: 'merge_blocked_distinct_real_users',
      candidateIds: ['u-2', 'u-1'],
      channelCode: 'telegram',
      externalId: 'tg-repeat',
      phoneNormalized: '+79990000002',
      source: 'test',
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const [selectSql] = runWebappPgTextMock.mock.calls[0] ?? [];
    expect(String(selectSql)).toContain('WHERE conflict_key = $1 AND resolved_at IS NULL');
    expect(String(selectSql)).not.toContain('organization_id');

    const [updateSql, updateValues] = runWebappPgTextMock.mock.calls[1] ?? [];
    expect(String(updateSql)).toContain('UPDATE admin_audit_log');
    expect(String(updateSql)).toContain('repeat_count = repeat_count + 1');
    expect(String(updateSql)).toContain('WHERE id = $1::uuid');
    expect(String(updateSql)).not.toContain('organization_id');
    expect(updateValues).toEqual([
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      expect.any(String),
      'error',
    ]);
  });
});
