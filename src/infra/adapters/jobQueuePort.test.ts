import { describe, expect, it, vi } from 'vitest';
import { createPostgresJobQueue } from './jobQueuePort.js';

describe('createPostgresJobQueue', () => {
  it('persists generic telegram delivery payloads without phone fallback', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const queue = createPostgresJobQueue({
      db: {
        query,
        tx: async (fn) => fn({ query, tx: async (inner) => inner({ query, tx: async () => undefined as never }) }),
      },
      retryDelaySeconds: 60,
    });

    await queue.enqueue({
      kind: 'message.deliver',
      payload: {
        intent: {
          type: 'message.send',
          meta: {
            eventId: 'evt-1',
            occurredAt: '2026-03-10T10:00:00.000Z',
            source: 'rubitime',
          },
          payload: {
            message: { text: 'hello telegram' },
            delivery: { channels: ['telegram'], maxAttempts: 1 },
          },
        },
        targets: [{ resource: 'telegram', address: { chatId: 123 } }],
        retry: { maxAttempts: 1, backoffSeconds: [0] },
      },
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]?.slice(0, 5)).toEqual([
      null,
      'hello telegram',
      0,
      1,
      'message.deliver',
    ]);
    expect(String(query.mock.calls[0]?.[1]?.[5] ?? '')).toContain('"chatId":123');
    expect(String(query.mock.calls[0]?.[1]?.[5] ?? '')).toContain('"telegram"');
  });

  it('claims generic jobs with original payload and channels intact', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: 42,
        phoneNormalized: null,
        messageText: 'hello telegram',
        kind: 'message.deliver',
        runAt: '2026-03-10T10:00:00.000Z',
        payloadJson: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'evt-42',
              occurredAt: '2026-03-10T10:00:00.000Z',
              source: 'rubitime',
            },
            payload: {
              message: { text: 'hello telegram' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
          targets: [{ resource: 'telegram', address: { chatId: 123 } }],
          retry: { maxAttempts: 1, backoffSeconds: [0] },
        },
        attemptsDone: 0,
        maxAttempts: 1,
      }],
    });
    const queue = createPostgresJobQueue({
      db: {
        query,
        tx: async (fn) => fn({ query, tx: async (inner) => inner({ query, tx: async () => undefined as never }) }),
      },
      retryDelaySeconds: 60,
    });

    const jobs = await queue.claimDueJobs(10);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: 'message.deliver',
      runAt: '2026-03-10T10:00:00.000Z',
      plan: [{ channel: 'telegram', maxAttempts: 1 }],
      targets: [{ resource: 'telegram', address: { chatId: 123 } }],
      payload: {
        intent: {
          payload: {
            delivery: { channels: ['telegram'], maxAttempts: 1 },
          },
        },
      },
    });
  });
});
