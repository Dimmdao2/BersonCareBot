import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import {
  enqueueProjectionEvent,
  claimDueProjectionEvents,
  completeProjectionEvent,
  failProjectionEvent,
  rescheduleProjectionEvent,
} from './projectionOutbox.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('projectionOutbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createDbMock() {
    const queryMock = vi.fn();
    const db: DbPort = {
      query: queryMock as unknown as DbPort['query'],
      tx: vi.fn() as unknown as DbPort['tx'],
    };
    return { db, query: queryMock };
  }

  it('enqueueProjectionEvent inserts via Drizzle onConflictDoNothing', async () => {
    const { db } = createDbMock();
    const onConflict = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing: onConflict });
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await enqueueProjectionEvent(db, {
      eventType: 'user.upserted',
      idempotencyKey: 'user.upserted:42:abc',
      occurredAt: '2026-03-19T00:00:00Z',
      payload: { integratorUserId: '42' },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      eventType: 'user.upserted',
      idempotencyKey: 'user.upserted:42:abc',
      occurredAt: '2026-03-19T00:00:00Z',
      payload: { integratorUserId: '42' },
    });
    expect(onConflict).toHaveBeenCalledTimes(1);
  });

  it('claimDueProjectionEvents uses execute with SKIP LOCKED', async () => {
    const { db } = createDbMock();
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          eventType: 'user.upserted',
          idempotencyKey: 'k',
          occurredAt: 'ts',
          payload: {},
          attemptsDone: 0,
          maxAttempts: 5,
        },
      ],
    });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ execute } as never);

    const result = await claimDueProjectionEvents(db, 5);

    expect(result).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('completeProjectionEvent sets status to done', async () => {
    const { db } = createDbMock();
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ update } as never);

    await completeProjectionEvent(db, 99);

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' }),
    );
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('failProjectionEvent sets status to dead with error', async () => {
    const { db } = createDbMock();
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ update } as never);

    await failProjectionEvent(db, 7, 'timeout');

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'dead', lastError: 'timeout' }),
    );
  });

  it('rescheduleProjectionEvent sets pending with backoff', async () => {
    const { db } = createDbMock();
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ update } as never);

    await rescheduleProjectionEvent(db, 3, 2, 60);

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        attemptsDone: 2,
      }),
    );
    const setArg = set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.nextTryAt).toBeDefined();
    expect(setArg.updatedAt).toBeDefined();
  });
});
