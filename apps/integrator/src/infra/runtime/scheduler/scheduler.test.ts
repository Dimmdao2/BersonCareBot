import { describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
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

  it('runs the claim and queue transition inside an infra principal scope', async () => {
    const principalKinds: Array<string | undefined> = [];

    await runSchedulerTick(
      {
        claimDueScheduledJobs: vi.fn(async () => {
          principalKinds.push(getCurrentDbPrincipal()?.kind);
          return [
            {
              id: 'j-infra',
              kind: 'delivery.retry',
              runAt: '2026-03-05T12:00:00.000Z',
              attempts: 0,
              maxAttempts: 3,
              payload: {},
            },
          ];
        }),
        enqueueRuntimeJob: vi.fn(async () => {
          principalKinds.push(getCurrentDbPrincipal()?.kind);
        }),
        markScheduledAsQueued: vi.fn(async () => {
          principalKinds.push(getCurrentDbPrincipal()?.kind);
        }),
      },
      '2026-03-05T12:00:00.000Z',
      50,
    );

    expect(principalKinds).toEqual(['infra', 'infra', 'infra']);
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });
});
