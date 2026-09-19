import { beforeEach, describe, expect, it, vi } from 'vitest';

const incidentRecorder = vi.hoisted(() => vi.fn(async () => ({ id: 'incident-1' })));

vi.mock('../../operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: incidentRecorder,
}));

import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { runOutgoingDeliveryWorkerTick } from './outgoingDeliveryWorker.js';

const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const QUEUE_ID = '20000000-0000-4000-8000-000000000002';

function row(attemptCount: number, maxAttempts = 8): OutgoingDeliveryQueueRow {
  return {
    id: QUEUE_ID,
    eventId: 'booking.lifecycle:created:30000000-0000-4000-8000-000000000003',
    kind: 'booking_lifecycle',
    channel: 'internal',
    payloadJson: {
      bookingLifecycle: {
        organizationId: ORGANIZATION_ID,
        appointmentId: '30000000-0000-4000-8000-000000000003',
        fact: 'created',
      },
    },
    status: 'processing',
    attemptCount,
    maxAttempts,
    nextRetryAt: '2026-09-19T10:00:00.000Z',
    lastAttemptAt: '2026-09-19T09:59:00.000Z',
    sentAt: null,
    deadAt: null,
    lastError: null,
    priority: 100,
  };
}

function harness(claimed: OutgoingDeliveryQueueRow) {
  const sent: string[] = [];
  const dead: string[] = [];
  const retryable: string[] = [];
  const dispatching: string[] = [];

  const db: DbPort = {
    async query<T>(sqlText: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sqlText.includes('public.system_settings')) return { rows: [] as T[] };
      if (sqlText.includes('SET reclaim_count = q.reclaim_count + 1')) {
        return { rows: [] as T[] };
      }
      if (sqlText.includes("SET status = 'processing'")) {
        return {
          rows: [
            {
              id: claimed.id,
              event_id: claimed.eventId,
              kind: claimed.kind,
              channel: claimed.channel,
              payload_json: claimed.payloadJson,
              status: claimed.status,
              attempt_count: claimed.attemptCount,
              max_attempts: claimed.maxAttempts,
              next_retry_at: claimed.nextRetryAt,
              last_attempt_at: claimed.lastAttemptAt,
              sent_at: claimed.sentAt,
              dead_at: claimed.deadAt,
              last_error: claimed.lastError,
              priority: claimed.priority,
            },
          ] as T[],
        };
      }
      if (sqlText.includes('app.resolve_outgoing_delivery_scope')) {
        return {
          rows: [
            {
              queue_kind: 'booking_lifecycle',
              organization_id: ORGANIZATION_ID,
              resolution: 'tenant',
            },
          ] as T[],
        };
      }
      const id = String(params?.[params.length - 1] ?? '');
      if (sqlText.includes("SET status = 'dispatching'")) dispatching.push(id);
      if (sqlText.includes("SET status = 'sent'")) sent.push(id);
      if (sqlText.includes("SET status = 'dead'")) dead.push(id);
      if (sqlText.includes("SET status = 'failed_retryable'")) retryable.push(id);
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (tx: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };

  return { db, sent, dead, retryable, dispatching };
}

async function runFailedReplay(attemptCount: number, maxAttempts = 8) {
  const claimed = row(attemptCount, maxAttempts);
  const h = harness(claimed);
  const processBookingLifecycle = vi.fn(async () => ({
    ok: false,
    status: 503,
    error: 'booking_lifecycle_failed',
  }));
  const result = await runOutgoingDeliveryWorkerTick({
    db: h.db,
    writePort: { writeDb: async () => undefined } as never,
    dispatchOutgoing: async (_intent: OutgoingIntent) => ({}),
    bookingLifecycle: {
      idempotencyPort: {
        tryAcquire: async () => true,
        release: async () => undefined,
      },
      webappEventsPort: { processBookingLifecycle },
    },
    batchSize: 10,
  });
  return { ...h, processBookingLifecycle, result };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('durable booking lifecycle worker failure outcomes', () => {
  it('keeps a transient signed-webapp failure retryable without entering transport dispatching', async () => {
    const h = await runFailedReplay(1);

    expect(h.result).toEqual({ claimed: 1, processed: 0, errors: 1 });
    expect(h.processBookingLifecycle).toHaveBeenCalledOnce();
    expect(h.retryable).toEqual([QUEUE_ID]);
    expect(h.sent).toEqual([]);
    expect(h.dead).toEqual([]);
    expect(h.dispatching).toEqual([]);
  });

  it('opens an operator incident when the booking lifecycle replay exhausts its attempts', async () => {
    const h = await runFailedReplay(8);

    expect(h.dead).toEqual([QUEUE_ID]);
    expect(h.retryable).toEqual([]);
    expect(incidentRecorder).toHaveBeenCalledTimes(1);
    expect(incidentRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'booking_lifecycle_replay',
        errorClass: 'booking_lifecycle_replay_dead',
      }),
    );
  });

  it('keeps terminal replay reclaimable when its operator incident cannot be persisted', async () => {
    incidentRecorder.mockRejectedValueOnce(new Error('incident_store_unavailable'));

    const h = await runFailedReplay(8);

    // PAY-REL-02: `dead` is an operator-visible terminal state, not a substitute for the
    // incident. If incident persistence fails, acknowledging the row as dead silently loses the
    // only alert for an already-captured payment whose lifecycle never completed.
    expect(h.result).toEqual({ claimed: 1, processed: 0, errors: 1 });
    expect(h.dead).toEqual([]);
    expect(h.retryable).toEqual([QUEUE_ID]);
    expect(h.sent).toEqual([]);
    expect(incidentRecorder).toHaveBeenCalledOnce();
  });
});
