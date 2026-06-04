import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  claimDueOutgoingDeliveries,
  enqueueOutgoingDeliveryIfAbsent,
  markOutgoingDeliveryDead,
  markOutgoingDeliverySent,
  rescheduleOutgoingDeliveryRetry,
  resetStaleOutgoingDeliveryProcessing,
} from './outgoingDeliveryQueue.js';

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn().mockResolvedValue({ rows: [] }),
}));

function lastSql(): string {
  const fragment = vi.mocked(runIntegratorSql).mock.calls.at(-1)?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe('outgoingDeliveryQueue (Drizzle sql)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [] });
  });

  it('enqueueOutgoingDeliveryIfAbsent keeps idempotent event_id conflict policy', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({ rows: [{ inserted: true }] });

    const inserted = await enqueueOutgoingDeliveryIfAbsent({} as never, {
      eventId: 'event-1',
      kind: 'doctor_broadcast_intent',
      channel: 'telegram',
      payloadJson: { x: 1 },
      maxAttempts: 3,
    });

    expect(inserted).toBe(true);
    const sqlText = lastSql();
    expect(sqlText).toContain('public.outgoing_delivery_queue');
    expect(sqlText).toContain('ON CONFLICT (event_id) DO NOTHING');
    expect(sqlText).toContain('RETURNING true AS inserted');
  });

  it('resetStaleOutgoingDeliveryProcessing only resets stale processing rows', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({ rows: [{ id: 'q1' }, { id: 'q2' }] });

    const count = await resetStaleOutgoingDeliveryProcessing({} as never, 12);

    expect(count).toBe(2);
    const sqlText = lastSql();
    expect(sqlText).toContain("status = 'processing'");
    expect(sqlText).toContain("status = 'failed_retryable'");
    expect(sqlText).toContain('last_attempt_at < now()');
  });

  it('claimDueOutgoingDeliveries preserves SKIP LOCKED claim semantics and row mapping', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({
      rows: [
        {
          id: 'q1',
          event_id: 'event-1',
          kind: 'reminder_dispatch',
          channel: 'max',
          payload_json: { a: 1 },
          status: 'processing',
          attempt_count: 2,
          max_attempts: 6,
          next_retry_at: '2026-01-01T00:00:00.000Z',
          last_attempt_at: '2026-01-01T00:00:01.000Z',
          sent_at: null,
          dead_at: null,
          last_error: null,
        },
      ],
    });

    const rows = await claimDueOutgoingDeliveries({} as never, 5);

    expect(rows).toEqual([
      {
        id: 'q1',
        eventId: 'event-1',
        kind: 'reminder_dispatch',
        channel: 'max',
        payloadJson: { a: 1 },
        status: 'processing',
        attemptCount: 2,
        maxAttempts: 6,
        nextRetryAt: '2026-01-01T00:00:00.000Z',
        lastAttemptAt: '2026-01-01T00:00:01.000Z',
        sentAt: null,
        deadAt: null,
        lastError: null,
      },
    ]);
    const sqlText = lastSql();
    expect(sqlText).toContain('FOR UPDATE SKIP LOCKED');
    expect(sqlText).toContain('ORDER BY next_retry_at ASC');
    expect(sqlText).toContain("status IN ('pending', 'failed_retryable')");
  });

  it('markOutgoingDeliverySent writes final sent status without reopening row', async () => {
    await markOutgoingDeliverySent({} as never, 'q-sent');

    const sqlText = lastSql();
    expect(sqlText).toContain("status = 'sent'");
    expect(sqlText).toContain('sent_at = now()');
    expect(sqlText).toContain('last_error = NULL');
  });

  it('markOutgoingDeliveryDead writes final dead status and error', async () => {
    await markOutgoingDeliveryDead({} as never, 'q-dead', 'provider failed');

    const sqlText = lastSql();
    expect(sqlText).toContain("status = 'dead'");
    expect(sqlText).toContain('dead_at = now()');
    expect(sqlText).toContain('last_error = ');
  });

  it('rescheduleOutgoingDeliveryRetry keeps retryable status and next_retry interval', async () => {
    await rescheduleOutgoingDeliveryRetry({} as never, 'q-retry', 45, 'temporary');

    const sqlText = lastSql();
    expect(sqlText).toContain("status = 'failed_retryable'");
    expect(sqlText).toContain('next_retry_at = now()');
    expect(sqlText).toContain("' seconds'");
  });
});
