import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getIntegratorDrizzleSession } from '../db/drizzle.js';
import { createPostgresJobQueue } from './jobQueuePort.js';

vi.mock('../db/drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('createPostgresJobQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('persists generic telegram delivery payloads without phone fallback', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert, execute: vi.fn() } as never);

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

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNormalized: null,
        messageText: 'hello telegram',
        attemptsDone: 0,
        maxAttempts: 1,
        status: 'pending',
        kind: 'message.deliver',
      }),
    );
    const v = values.mock.calls[0]![0] as Record<string, unknown>;
    expect(v.payloadJson).toEqual(
      expect.objectContaining({
        targets: [{ resource: 'telegram', address: { chatId: 123 } }],
      }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('claims generic jobs with original payload and channels intact', async () => {
    const execute = vi.fn().mockResolvedValue({
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
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert: vi.fn(), execute } as never);

    const query = vi.fn();
    const queue = createPostgresJobQueue({
      db: {
        query,
        tx: async (fn) => fn({ query, tx: async (inner) => inner({ query, tx: async () => undefined as never }) }),
      },
      retryDelaySeconds: 60,
    });

    const jobs = await queue.claimDueJobs(10);

    expect(jobs).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
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
