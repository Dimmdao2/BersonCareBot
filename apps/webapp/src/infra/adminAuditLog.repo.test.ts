import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentObservabilityContext: vi.fn(() => ({})),
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
  applyCurrentDbPrincipalToTransaction: vi.fn(async () => false),
}));

import {
  countOpenAutoMergeConflicts,
  getLastAuditLogDetailsField,
  writeAuditLogDedupeOpenConflictKey,
} from './adminAuditLog';

const poolStub = {} as Pool;

describe('adminAuditLog (repo SQL parity)', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
  });

  it('getLastAuditLogDetailsField selects details json field', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ value: 'degraded' }] });
    const v = await getLastAuditLogDetailsField(poolStub, 'system_health_snapshot', 'severity');
    expect(v).toBe('degraded');
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('details->>$2');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(['system_health_snapshot', 'severity']);
  });

  it('countOpenAutoMergeConflicts filters unresolved auto_merge_conflict', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ n: '3' }] });
    const n = await countOpenAutoMergeConflicts(poolStub);
    expect(n).toBe(3);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('auto_merge_conflict');
    expect(sql).toContain('resolved_at IS NULL');
    expect(sql).toContain('organization_id = $1::uuid');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
  });

  it('writeAuditLogDedupeOpenConflictKey swallows unique violation', async () => {
    const err = new Error('dup') as Error & { code?: string };
    err.code = '23505';
    runWebappPgTextMock.mockRejectedValueOnce(err);
    await expect(
      writeAuditLogDedupeOpenConflictKey(poolStub, {
        actorId: null,
        action: 'auto_merge_conflict',
        conflictKey: 'abc',
        details: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('writeAuditLogDedupeOpenConflictKey logs non-unique errors', async () => {
    const errorSpy = vi
      .spyOn((await import('./logging/logger')).logger, 'error')
      .mockImplementation(() => {});
    runWebappPgTextMock.mockRejectedValueOnce(new Error('db down'));
    await expect(
      writeAuditLogDedupeOpenConflictKey(poolStub, {
        actorId: null,
        action: 'auto_merge_conflict',
        conflictKey: 'abc',
        details: {},
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
