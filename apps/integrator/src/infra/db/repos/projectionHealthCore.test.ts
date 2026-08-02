import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  isProjectionHealthDegraded,
  readProjectionHealthSnapshot,
} from './projectionHealthCore.js';

const pgDialect = new PgDialect();

function snapshotExecutor() {
  return {
    execute: vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { status: 'pending', cnt: '5' },
          { status: 'processing', cnt: '2' },
          { status: 'dead', cnt: '1' },
          { status: 'cancelled', cnt: '3' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ next_try_at: '2026-08-03T08:00:00.000Z' }] })
      .mockResolvedValueOnce({
        rows: [
          { attempts_done: 0, cnt: '4' },
          { attempts_done: 3, cnt: '3' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ last_success: '2026-08-03T09:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ cnt: '3' }] }),
  };
}

describe('projection health snapshot', () => {
  it('preserves all release-gate metrics when its executor runs Drizzle fragments', async () => {
    const db = snapshotExecutor();

    const snapshot = await readProjectionHealthSnapshot(db, { retryThreshold: 3 });

    expect(snapshot).toEqual({
      pendingCount: 5,
      processingCount: 2,
      deadCount: 1,
      cancelledCount: 3,
      oldestPendingAt: '2026-08-03T08:00:00.000Z',
      retryDistribution: { 0: 4, 3: 3 },
      lastSuccessAt: '2026-08-03T09:00:00.000Z',
      retriesOverThreshold: 3,
    });
    expect(db.execute).toHaveBeenCalledTimes(5);
    expect(isProjectionHealthDegraded(snapshot)).toBe(true);
    expect(
      isProjectionHealthDegraded(snapshot, { allowDeadCount: 1, allowRetriesOverThreshold: 3 }),
    ).toBe(false);
  });

  it('binds a non-default retry threshold into the over-threshold query', async () => {
    const db = snapshotExecutor();

    await readProjectionHealthSnapshot(db, { retryThreshold: 4 });

    const overThresholdFragment = db.execute.mock.calls[4]?.[0];
    expect(overThresholdFragment).toBeDefined();
    const compiled = pgDialect.sqlToQuery(overThresholdFragment as SQL);
    expect(compiled.sql).toContain('attempts_done >= $1');
    expect(compiled.params).toEqual([4]);
  });
});
