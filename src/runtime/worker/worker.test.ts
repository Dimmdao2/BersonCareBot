import { describe, expect, it, vi } from 'vitest';
import { runWorkerTick } from './worker.js';

describe('runWorkerTick', () => {
  it('returns idle when no jobs', async () => {
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue(null),
      completeJob: vi.fn().mockResolvedValue(undefined),
      rescheduleJob: vi.fn().mockResolvedValue(undefined),
      buildContext: vi.fn(),
      executeAction: vi.fn(),
      retryDelaySeconds: 60,
    });
    expect(result).toBe('idle');
  });

  it('completes successful jobs', async () => {
    const completeJob = vi.fn().mockResolvedValue(undefined);
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue({
        id: 'j1',
        kind: 'delivery.retry',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {},
      }),
      completeJob,
      rescheduleJob: vi.fn().mockResolvedValue(undefined),
      buildContext: vi.fn().mockResolvedValue({
        event: {
          type: 'schedule.tick',
          meta: { eventId: 'evt-1', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
          payload: {},
        },
        nowIso: '2026-03-05T12:00:00.000Z',
        values: {},
      }),
      executeAction: vi.fn().mockResolvedValue({ status: 'success' }),
      retryDelaySeconds: 60,
    });

    expect(result).toBe('processed');
    expect(completeJob).toHaveBeenCalledTimes(1);
  });
});
