import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  getOperationalVerboseLogEnabled,
  invalidateOperationalVerboseLogCache,
  resetOperationalVerboseLogCacheForTests,
} from './operationalVerboseLog.js';

function createDbMock() {
  const queryMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

function mockFlagRow(query: ReturnType<typeof createDbMock>['query'], valueJson: unknown) {
  query.mockResolvedValueOnce({ rows: [{ value_json: valueJson }], rowCount: 1 } as DbQueryResult<{
    value_json: unknown;
  }>);
}

describe('getOperationalVerboseLogEnabled', () => {
  beforeEach(() => {
    resetOperationalVerboseLogCacheForTests();
  });

  it('defaults to false when no row', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult);
    expect(await getOperationalVerboseLogEnabled(db)).toBe(false);
  });

  it('returns true for { value: true } and { value: "true" }', async () => {
    {
      const { db, query } = createDbMock();
      mockFlagRow(query, { value: true });
      expect(await getOperationalVerboseLogEnabled(db)).toBe(true);
    }
    resetOperationalVerboseLogCacheForTests();
    {
      const { db, query } = createDbMock();
      mockFlagRow(query, { value: 'true' });
      expect(await getOperationalVerboseLogEnabled(db)).toBe(true);
    }
  });

  it('returns false for other values', async () => {
    const { db, query } = createDbMock();
    mockFlagRow(query, { value: false });
    expect(await getOperationalVerboseLogEnabled(db)).toBe(false);
  });

  it('caches within TTL (second call does not re-query)', async () => {
    const { db, query } = createDbMock();
    mockFlagRow(query, { value: true });
    expect(await getOperationalVerboseLogEnabled(db)).toBe(true);
    expect(await getOperationalVerboseLogEnabled(db)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('re-queries after cache invalidation', async () => {
    const { db, query } = createDbMock();
    mockFlagRow(query, { value: true });
    expect(await getOperationalVerboseLogEnabled(db)).toBe(true);
    invalidateOperationalVerboseLogCache();
    mockFlagRow(query, { value: false });
    expect(await getOperationalVerboseLogEnabled(db)).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails safe to false when the query throws', async () => {
    const { db, query } = createDbMock();
    query.mockRejectedValueOnce(new Error('db down'));
    expect(await getOperationalVerboseLogEnabled(db)).toBe(false);
  });
});
