import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  enqueueProjectionEvent,
  claimDueProjectionEvents,
  completeProjectionEvent,
  failProjectionEvent,
  rescheduleProjectionEvent,
} from './projectionOutbox.js';

function createDbMock() {
  const queryMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('projectionOutbox', () => {
  it('enqueueProjectionEvent inserts with correct params', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await enqueueProjectionEvent(db, {
      eventType: 'user.upserted',
      idempotencyKey: 'user.upserted:42:abc',
      occurredAt: '2026-03-19T00:00:00Z',
      payload: { integratorUserId: '42' },
    });

    expect(query).toHaveBeenCalledOnce();
    const call = query.mock.calls[0]!;
    const sql = call[0] as string;
    const params = call[1] as unknown[];
    expect(sql).toContain('INSERT INTO projection_outbox');
    expect(params[0]).toBe('user.upserted');
    expect(params[1]).toBe('user.upserted:42:abc');
    expect(params[2]).toBe('2026-03-19T00:00:00Z');
    expect(params[3]).toBe('{"integratorUserId":"42"}');
  });

  it('claimDueProjectionEvents uses FOR UPDATE SKIP LOCKED', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({
      rows: [{ id: 1, eventType: 'user.upserted', idempotencyKey: 'k', occurredAt: 'ts', payload: {}, attemptsDone: 0, maxAttempts: 5 }],
    });

    const result = await claimDueProjectionEvents(db, 5);

    expect(result).toHaveLength(1);
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("status = 'processing'");
  });

  it('completeProjectionEvent sets status to done', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [] });

    await completeProjectionEvent(db, 99);

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("status = 'done'");
    expect(params[0]).toBe(99);
  });

  it('failProjectionEvent sets status to dead with error', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [] });

    await failProjectionEvent(db, 7, 'timeout');

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("status = 'dead'");
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('timeout');
  });

  it('rescheduleProjectionEvent sets pending with backoff', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [] });

    await rescheduleProjectionEvent(db, 3, 2, 60);

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("status = 'pending'");
    expect(params[0]).toBe(3);
    expect(params[1]).toBe(2);
    expect(params[2]).toBe(60);
  });
});
