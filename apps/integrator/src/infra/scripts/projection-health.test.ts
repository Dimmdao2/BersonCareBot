import { describe, expect, it, vi } from 'vitest';
import { runProjectionHealthCli } from './projection-health.js';
import type { ProjectionHealthPool } from './projectionHealthPoolProvider.js';

function createPool(rows: Array<Record<string, unknown>[]>): ProjectionHealthPool {
  return {
    execute: vi.fn(async () => ({ rows: rows.shift() ?? [] })),
    end: vi.fn(async () => undefined),
  };
}

describe('projection-health CLI', () => {
  it('keeps the deploy-gate exit semantics while reporting cancelled separately from dead', async () => {
    const pool = createPool([
      [
        { status: 'pending', cnt: '1' },
        { status: 'cancelled', cnt: '4' },
      ],
      [{ next_try_at: null }],
      [{ attempts_done: 0, cnt: '1' }],
      [{ last_success: null }],
      [{ cnt: '0' }],
    ]);
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = await runProjectionHealthCli({
      env: { DATABASE_URL: 'postgres://example.invalid/projection_health' },
      createPool: vi.fn(() => pool),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(stdout.write).toHaveBeenCalledWith(
      `${JSON.stringify(
        {
          pendingCount: 1,
          deadCount: 0,
          cancelledCount: 4,
          oldestPendingAt: null,
          processingCount: 0,
          retryDistribution: { 0: 1 },
          lastSuccessAt: null,
          retriesOverThreshold: 0,
        },
        null,
        2,
      )}\n`,
    );
    expect(stderr.write).not.toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
