import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getProjectionHealth } from './projectionHealth.js';

function createDbMock() {
  const queryMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('projectionHealth', () => {
  it('returns snapshot with pending, dead, oldestPendingAt, retryDistribution', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({
        rows: [
          { status: 'pending', cnt: '3' },
          { status: 'dead', cnt: '1' },
          { status: 'processing', cnt: '2' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ next_try_at: '2026-03-19T10:00:00Z' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { attempts_done: 0, cnt: '2' },
          { attempts_done: 1, cnt: '2' },
          { attempts_done: 2, cnt: '1' },
        ],
      });

    const snapshot = await getProjectionHealth(db);

    expect(snapshot).toEqual({
      pendingCount: 3,
      deadCount: 1,
      oldestPendingAt: '2026-03-19T10:00:00Z',
      processingCount: 2,
      retryDistribution: { 0: 2, 1: 2, 2: 1 },
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]![0]).toContain("status IN ('pending', 'processing', 'dead')");
    expect(query.mock.calls[1]![0]).toContain("status = 'pending'");
    expect(query.mock.calls[2]![0]).toContain("attempts_done");
  });

  it('returns zero counts and null oldest when no rows', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const snapshot = await getProjectionHealth(db);

    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.deadCount).toBe(0);
    expect(snapshot.oldestPendingAt).toBeNull();
    expect(snapshot.processingCount).toBe(0);
    expect(snapshot.retryDistribution).toEqual({});
  });
});
