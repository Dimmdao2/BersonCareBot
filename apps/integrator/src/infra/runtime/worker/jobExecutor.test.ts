import { describe, expect, it, vi } from 'vitest';
import { executeJob } from './jobExecutor.js';

describe('executeJob', () => {
  it('returns ok=true when dispatch succeeds', async () => {
    const result = await executeJob(
      {
        id: 'job-1',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'out-1',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'domain',
            },
            payload: {
              message: { text: 'hello' },
              delivery: { channels: ['channel-a', 'channel-b'] },
            },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
        },
      },
      {
        dispatchOutgoing: vi.fn().mockResolvedValue({}),
      },
    );

    expect(result.ok).toBe(true);
  });

  it('returns failed result when dispatch fails', async () => {
    const result = await executeJob(
      {
        id: 'job-2',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'out-2',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'domain',
            },
            payload: {
              message: { text: 'hello' },
              delivery: { channels: ['channel-a'] },
            },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
        },
      },
      {
        dispatchOutgoing: vi.fn().mockRejectedValue(new Error('CHANNEL_DOWN')),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errorCode).toContain('CHANNEL_DOWN');
  });
});
