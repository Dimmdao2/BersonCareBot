/**
 * D27-C (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md — D27-C) — the new
 * `auth_email_otp` durable-queue kind: delivery is enqueued instead of awaited inside the public
 * `/api/auth/email-otp/start` request, so the ONLY place a real provider failure can surface is
 * this worker. This proves the operator-visibility half of that trade: a temporary failure that
 * exhausts the fast retry ladder must open an operator incident, on the SAME
 * `outbound_delivery_provider` direction the previous synchronous send path already reported
 * through (routes.ts's recordOutboundProviderFailure) — not a new, unwatched direction. Mirrors
 * outgoingDeliveryWorker.inboundReply.d35.test.ts's harness for the sibling `inbound_reply` kind.
 */
import { describe, expect, it, vi } from 'vitest';

const incidentRecorder = vi.hoisted(() => vi.fn(async () => ({ id: 'inc-1', occurrenceCount: 1 })));

vi.mock('../../operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: incidentRecorder,
}));

import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processClaimedOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

function authCodeIntent(eventId: string): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId,
      occurredAt: '2026-08-04T10:00:00.000Z',
      source: 'email',
      outboundMessageClass: 'auth_code',
      outboundCapability: 'auth_code',
    },
    payload: {
      recipient: { email: 'person@example.test' },
      message: { text: 'Ваш код BersonCare: 123456' },
      delivery: { channels: ['email'] },
      subject: 'Код подтверждения BersonCare',
    },
  };
}

function row(overrides: Partial<OutgoingDeliveryQueueRow> = {}): OutgoingDeliveryQueueRow {
  return {
    id: 'a0000000-0000-4000-8000-00000000000a',
    eventId: 'auth-otp:email:queued-0',
    kind: 'auth_email_otp',
    channel: 'email',
    payloadJson: { intent: authCodeIntent('otp:email:queued-0') },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 4,
    nextRetryAt: '2026-08-04T10:00:00.000Z',
    lastAttemptAt: '2026-08-04T09:59:00.000Z',
    sentAt: null,
    deadAt: null,
    lastError: null,
    priority: 100,
    ...overrides,
  };
}

type Harness = {
  db: DbPort;
  sentCalls: number;
  deadCalls: { lastError: unknown; failureClass: unknown }[];
  rescheduleCalls: { delaySeconds: unknown }[];
};

function harness(): Harness {
  const deadCalls: Harness['deadCalls'] = [];
  const rescheduleCalls: Harness['rescheduleCalls'] = [];
  let sentCalls = 0;

  const db: DbPort = {
    async query<T>(sqlText: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sqlText.includes('app.resolve_outgoing_delivery_scope')) {
        return {
          rows: [
            { queue_kind: 'auth_email_otp', organization_id: null, resolution: 'operator_global' },
          ] as T[],
        };
      }
      if (sqlText.includes("status = 'sent'")) {
        sentCalls += 1;
        return { rows: [] as T[] };
      }
      if (sqlText.includes("status = 'dead'")) {
        // markOutgoingDeliveryDead binds (last_error, failure_class, id) in that order.
        deadCalls.push({ lastError: params?.[0], failureClass: params?.[1] });
        return { rows: [] as T[] };
      }
      if (sqlText.includes("status = 'failed_retryable'")) {
        // rescheduleOutgoingDeliveryRetry binds delaySeconds (as text) first, then last_error, then id.
        rescheduleCalls.push({ delaySeconds: Number(params?.[0]) });
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };

  return { db, get sentCalls() { return sentCalls; }, deadCalls, rescheduleCalls };
}

function dispatchThatAlwaysFails(message: string): (intent: OutgoingIntent) => Promise<never> {
  return async () => {
    throw new Error(message);
  };
}

describe('auth_email_otp: happy path dispatches through the single chokepoint and marks sent', () => {
  it('дано: провайдер принял письмо → когда обработка → тогда dispatchOutgoing вызван и строка sent, без инцидента', async () => {
    const h = harness();
    const dispatched: OutgoingIntent[] = [];

    await processClaimedOutgoingDeliveryRow(row(), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async (intent) => {
        dispatched.push(intent);
        return {};
      },
    });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.meta.outboundMessageClass).toBe('auth_code');
    expect(h.sentCalls).toBe(1);
    expect(h.deadCalls).toHaveLength(0);
    expect(incidentRecorder).not.toHaveBeenCalled();
  });
});

describe('auth_email_otp: временный отказ, исчерпавший короткую лестницу, — инцидент оператора', () => {
  it('дано: сетевой сбой и attemptCount уже равен maxAttempts → когда обработка → тогда строка dead И recordOperatorFailureIncident вызван с direction=outbound_delivery_provider, integration=email', async () => {
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 4, maxAttempts: 4 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchThatAlwaysFails('provider unreachable: connection reset'),
    });

    expect(h.deadCalls).toHaveLength(1);
    expect(incidentRecorder).toHaveBeenCalledTimes(1);
    expect(incidentRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outbound_delivery_provider',
        integration: 'email',
        errorClass: 'provider_send_failed',
      }),
    );
  });

  it('дано: тот же временный отказ, но попытки ЕЩЁ НЕ исчерпаны → когда обработка → тогда reschedule по короткой лестнице (не dead) и БЕЗ инцидента', async () => {
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 1, maxAttempts: 4 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchThatAlwaysFails('provider unreachable: connection reset'),
    });

    expect(h.deadCalls).toHaveLength(0);
    expect(h.rescheduleCalls).toHaveLength(1);
    // Fast ladder (shared with inbound_reply): first failed attempt → 15 seconds.
    expect(h.rescheduleCalls[0]!.delaySeconds).toBe(15);
    expect(incidentRecorder).not.toHaveBeenCalled();
  });
});
