/**
 * D35 (docs/_TODO/runs/integrator-cleanup/D35_DELIVERY_FAILURE_POLICY_BRIEF.md) — гейт приёмки,
 * пункты 1, 2 и 5, применительно к новому виду очереди `inbound_reply` (ответ на входящее):
 *
 *   1) постоянный отказ (бот заблокирован) — без ретрая и БЕЗ инцидента, канал помечается;
 *   2) временный отказ живого канала, исчерпавший короткую лестницу, — обязан породить инцидент;
 *   3) пока лестница не исчерпана — реальная задержка следующей попытки берётся из короткой
 *      `inbound_reply`-лестницы (см. deliveryContract.d35.test.ts), а не из общей.
 *
 * Заглушка — только граница (БД и провайдер), как в соседних тестах этого воркера
 * (outgoingDeliveryWorker.scope.test.ts, outgoingDeliveryWorker.finalize.test.ts).
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте.
 */
import { describe, expect, it, vi } from 'vitest';

const incidentRecorder = vi.hoisted(() => vi.fn(async () => ({ id: 'inc-1', occurrenceCount: 1 })));

vi.mock('../../operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: incidentRecorder,
}));

import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processClaimedOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

function replyIntent(eventId: string): OutgoingIntent {
  return {
    type: 'message.send',
    meta: { eventId, occurredAt: '2026-07-31T10:00:00.000Z', source: 'telegram' },
    payload: {
      recipient: { chatId: 111_222_333 },
      message: { text: 'этот вид сообщений не поддерживается' },
      delivery: { channels: ['telegram'] },
    },
  };
}

function row(overrides: Partial<OutgoingDeliveryQueueRow> = {}): OutgoingDeliveryQueueRow {
  return {
    id: 'a0000000-0000-4000-8000-00000000000a',
    eventId: 'evt-inbound-reply:queued:0',
    kind: 'inbound_reply',
    channel: 'telegram',
    payloadJson: { intent: replyIntent('evt-inbound-reply:queued:0') },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 4,
    nextRetryAt: '2026-07-31T10:00:00.000Z',
    lastAttemptAt: '2026-07-31T09:59:00.000Z',
    sentAt: null,
    deadAt: null,
    lastError: null,
    ...overrides,
  };
}

type Harness = {
  db: DbPort;
  deadCalls: { lastError: unknown; failureClass: unknown }[];
  rescheduleCalls: { delaySeconds: unknown }[];
};

function harness(): Harness {
  const deadCalls: Harness['deadCalls'] = [];
  const rescheduleCalls: Harness['rescheduleCalls'] = [];

  const db: DbPort = {
    async query<T>(sqlText: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sqlText.includes('app.resolve_outgoing_delivery_scope')) {
        return {
          rows: [
            { queue_kind: 'inbound_reply', organization_id: null, resolution: 'operator_global' },
          ] as T[],
        };
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

  return { db, deadCalls, rescheduleCalls };
}

function dispatchThatAlwaysFails(message: string): (intent: OutgoingIntent) => Promise<never> {
  return async () => {
    throw new Error(message);
  };
}

describe('inbound_reply: постоянный отказ (бот заблокирован) — без ретрая и без инцидента', () => {
  it('дано: провайдер вернул "bot was blocked by the user" → когда обработка → тогда строка dead БЕЗ инцидента и без reschedule', async () => {
    // АРБИТР: в handleDispatchFailure() убрать ветку classifyRecipientBlockedBotError для
    // row.kind !== 'operator_alert' (например, добавить `row.kind === INBOUND_REPLY_QUEUE_KIND` в
    // исключения рядом с 'operator_alert') — строка попадёт в обычный retryable-путь, incidentRecorder
    // окажется вызван (нарушая п.1 «не порождает инцидента»), тест покраснеет.
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 1, maxAttempts: 4 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchThatAlwaysFails('bot was blocked by the user'),
    });

    expect(h.deadCalls).toHaveLength(1);
    expect(h.deadCalls[0]!.failureClass).toBe('recipient_blocked_bot');
    expect(h.rescheduleCalls).toHaveLength(0);
    expect(incidentRecorder).not.toHaveBeenCalled();
  });
});

describe('inbound_reply: временный отказ, исчерпавший короткую лестницу, — инцидент оператора', () => {
  it('дано: сетевой сбой и attemptCount уже равен maxAttempts → когда обработка → тогда строка dead И recordOperatorFailureIncident вызван с direction=inbound_reply', async () => {
    // АРБИТР: закомментировать вызов recordInboundReplyDeliveryDeadIncident() внутри
    // finalizeOutgoingDeliveryDead() — incidentRecorder перестанет вызываться, тест покраснеет.
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
      expect.objectContaining({ direction: 'inbound_reply', integration: 'telegram' }),
    );
  });

  it('дано: тот же временный отказ, но попытки ЕЩЁ НЕ исчерпаны → когда обработка → тогда reschedule (не dead) и БЕЗ инцидента', async () => {
    // Контраст к предыдущему тесту: инцидент — только на исчерпании, не на каждой неудачной попытке.
    // АРБИТР: убрать проверку `attempts >= row.maxAttempts` в handleDispatchFailure() (всегда dead) —
    // строка на первой попытке уйдёт в dead с инцидентом вместо reschedule, тест покраснеет.
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 1, maxAttempts: 4 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchThatAlwaysFails('provider unreachable: connection reset'),
    });

    expect(h.deadCalls).toHaveLength(0);
    expect(h.rescheduleCalls).toHaveLength(1);
    // Короткая лестница: первая неудачная попытка → 15 секунд (см. deliveryContract.d35.test.ts).
    expect(h.rescheduleCalls[0]!.delaySeconds).toBe(15);
    expect(incidentRecorder).not.toHaveBeenCalled();
  });
});
