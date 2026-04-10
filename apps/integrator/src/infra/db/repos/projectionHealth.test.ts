import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  getProjectionHealth,
  isProjectionHealthDegraded,
  type ProjectionHealthSnapshot,
} from './projectionHealth.js';

function createDbMock() {
  const queryMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('projectionHealth', () => {
  it('returns snapshot with pending, dead, oldestPendingAt, retryDistribution, lastSuccessAt, retriesOverThreshold', async () => {
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
      })
      .mockResolvedValueOnce({
        rows: [{ last_success: '2026-03-19T09:00:00Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ cnt: '1' }],
      });

    const snapshot = await getProjectionHealth(db);

    expect(snapshot).toEqual({
      pendingCount: 3,
      deadCount: 1,
      cancelledCount: 0,
      oldestPendingAt: '2026-03-19T10:00:00Z',
      processingCount: 2,
      retryDistribution: { 0: 2, 1: 2, 2: 1 },
      lastSuccessAt: '2026-03-19T09:00:00Z',
      retriesOverThreshold: 1,
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0]![0]).toContain("status IN ('pending', 'processing', 'dead', 'cancelled')");
    expect(query.mock.calls[1]![0]).toContain("status = 'pending'");
    expect(query.mock.calls[2]![0]).toContain("attempts_done");
    expect(query.mock.calls[3]![0]).toContain("status = 'done'");
    expect(query.mock.calls[4]![0]).toContain('attempts_done >= $1');
  });

  it('returns zero counts and null oldest/lastSuccess when no rows', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

    const snapshot = await getProjectionHealth(db);

    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.deadCount).toBe(0);
    expect(snapshot.oldestPendingAt).toBeNull();
    expect(snapshot.processingCount).toBe(0);
    expect(snapshot.cancelledCount).toBe(0);
    expect(snapshot.retryDistribution).toEqual({});
    expect(snapshot.lastSuccessAt).toBeNull();
    expect(snapshot.retriesOverThreshold).toBe(0);
  });

  it('uses custom retryThreshold when provided', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: '2' }] });

    await getProjectionHealth(db, { retryThreshold: 5 });

    expect(query.mock.calls[4]![1]).toEqual([5]);
  });

  it('returns cancelledCount when status cancelled is present', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({
        rows: [
          { status: 'pending', cnt: '1' },
          { status: 'cancelled', cnt: '4' },
          { status: 'dead', cnt: '0' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

    const snapshot = await getProjectionHealth(db);
    expect(snapshot.cancelledCount).toBe(4);
    expect(snapshot.pendingCount).toBe(1);
  });
});

describe('isProjectionHealthDegraded', () => {
  it('returns true when deadCount > 0 (default allow 0)', () => {
    const snapshot: ProjectionHealthSnapshot = {
      pendingCount: 0,
      deadCount: 1,
      cancelledCount: 0,
      oldestPendingAt: null,
      processingCount: 0,
      retryDistribution: {},
      lastSuccessAt: null,
      retriesOverThreshold: 0,
    };
    expect(isProjectionHealthDegraded(snapshot)).toBe(true);
  });

  it('returns true when retriesOverThreshold > 0 (default allow 0)', () => {
    const snapshot: ProjectionHealthSnapshot = {
      pendingCount: 2,
      deadCount: 0,
      cancelledCount: 0,
      oldestPendingAt: null,
      processingCount: 0,
      retryDistribution: { 3: 2 },
      lastSuccessAt: null,
      retriesOverThreshold: 2,
    };
    expect(isProjectionHealthDegraded(snapshot)).toBe(true);
  });

  it('returns false when no dead and no retries over threshold', () => {
    const snapshot: ProjectionHealthSnapshot = {
      pendingCount: 1,
      deadCount: 0,
      cancelledCount: 0,
      oldestPendingAt: '2026-03-19T10:00:00Z',
      processingCount: 0,
      retryDistribution: { 0: 1 },
      lastSuccessAt: '2026-03-19T09:00:00Z',
      retriesOverThreshold: 0,
    };
    expect(isProjectionHealthDegraded(snapshot)).toBe(false);
  });

  it('does not treat cancelledCount alone as degraded', () => {
    const snapshot: ProjectionHealthSnapshot = {
      pendingCount: 0,
      deadCount: 0,
      cancelledCount: 99,
      oldestPendingAt: null,
      processingCount: 0,
      retryDistribution: {},
      lastSuccessAt: null,
      retriesOverThreshold: 0,
    };
    expect(isProjectionHealthDegraded(snapshot)).toBe(false);
  });

  it('respects allowDeadCount and allowRetriesOverThreshold', () => {
    const snapshot: ProjectionHealthSnapshot = {
      pendingCount: 0,
      deadCount: 1,
      cancelledCount: 0,
      oldestPendingAt: null,
      processingCount: 0,
      retryDistribution: {},
      lastSuccessAt: null,
      retriesOverThreshold: 3,
    };
    expect(
      isProjectionHealthDegraded(snapshot, { allowDeadCount: 1, allowRetriesOverThreshold: 5 }),
    ).toBe(false);
    expect(
      isProjectionHealthDegraded(snapshot, { allowDeadCount: 0, allowRetriesOverThreshold: 5 }),
    ).toBe(true);
  });
});
