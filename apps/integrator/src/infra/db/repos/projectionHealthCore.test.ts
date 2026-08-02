import { describe, expect, it, vi } from 'vitest';
import {
  isProjectionHealthDegraded,
  readProjectionHealthSnapshot,
} from './projectionHealthCore.js';

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
});
