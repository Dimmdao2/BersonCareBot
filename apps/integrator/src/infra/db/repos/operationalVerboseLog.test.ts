import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { getOperationalVerboseLogEnabled } from './operationalVerboseLog.js';

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

  it('re-queries on every call and returns the current value', async () => {
    const { db, query } = createDbMock();
    mockFlagRow(query, { value: true });
    mockFlagRow(query, { value: false });
    expect(await getOperationalVerboseLogEnabled(db)).toBe(true);
    expect(await getOperationalVerboseLogEnabled(db)).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails safe to false when the query throws', async () => {
    const { db, query } = createDbMock();
    query.mockRejectedValueOnce(new Error('db down'));
    expect(await getOperationalVerboseLogEnabled(db)).toBe(false);
  });
});
