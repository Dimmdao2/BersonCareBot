import { describe, expect, it, vi } from 'vitest';
import { runSchedulerTick } from './scheduler.js';

describe('runSchedulerTick', () => {
  it('moves due jobs to runtime queue', async () => {
    const enqueueRuntimeJob = vi.fn().mockResolvedValue(undefined);
    const markScheduledAsQueued = vi.fn().mockResolvedValue(undefined);

    const count = await runSchedulerTick(
      {
        claimDueScheduledJobs: vi.fn().mockResolvedValue([
          {
            id: 'j1',
            kind: 'delivery.retry',
            runAt: '2026-03-05T12:00:00.000Z',
            attempts: 0,
            maxAttempts: 3,
            payload: {},
          },
        ]),
        enqueueRuntimeJob,
        markScheduledAsQueued,
      },
      '2026-03-05T12:00:00.000Z',
      50,
    );

    expect(count).toBe(1);
    expect(enqueueRuntimeJob).toHaveBeenCalledTimes(1);
    expect(markScheduledAsQueued).toHaveBeenCalledTimes(1);
  });
});
