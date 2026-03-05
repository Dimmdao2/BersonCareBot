import { describe, expect, it, vi } from 'vitest';
import { runWorkerTick } from './runner.js';

describe('runWorkerTick', () => {
  it('returns idle when no jobs', async () => {
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue(null),
      completeJob: vi.fn().mockResolvedValue(undefined),
      failJob: vi.fn().mockResolvedValue(undefined),
      rescheduleJob: vi.fn().mockResolvedValue(undefined),
      logAttempt: vi.fn().mockResolvedValue(undefined),
      dispatchOutgoing: vi.fn().mockResolvedValue(undefined),
      nowIso: () => '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });
    expect(result).toBe('idle');
  });

  it('completes successful jobs', async () => {
    const completeJob = vi.fn().mockResolvedValue(undefined);
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue({
        id: 'j1',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'evt-1', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
            payload: {
              message: { text: 'hello' },
              delivery: { channels: ['channel-a'] },
            },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
        },
      }),
      completeJob,
      failJob: vi.fn().mockResolvedValue(undefined),
      rescheduleJob: vi.fn().mockResolvedValue(undefined),
      logAttempt: vi.fn().mockResolvedValue(undefined),
      dispatchOutgoing: vi.fn().mockResolvedValue(undefined),
      nowIso: () => '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });

    expect(result).toBe('processed');
    expect(completeJob).toHaveBeenCalledTimes(1);
  });
});
