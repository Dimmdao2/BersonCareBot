/**
 * `outbound_message` — универсальный вид очереди (решение владельца 19.08: «должно быть
 * универсальным по сути механизмом… Не 100 функций на каждое отправляемое событие»).
 *
 * Что здесь доказывается, и почему именно это:
 *  1. .ics-вложение доходит до диспатча БАЙТ В БАЙТ. Ровно этот дефект уже был: приёмник молча
 *     ронял необъявленное поле, и письмо приходило без календарного файла.
 *  2. Мёртвая строка НЕ молчит. Продюсер (создание записи) вернулся человеку задолго до тика
 *     воркера — операторский инцидент здесь единственный сигнал, что письма не будет.
 *  3. КАРАНТИН не молчит. Строка с нерезолвящейся областью хоронится без отправки и без ретрая; до
 *     этой правки это была одна строка лога. 04.08 так похоронили каждый код входа.
 *
 * Харнесс — копия outgoingDeliveryWorker.authEmailOtp.d27c.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

const incidentRecorder = vi.hoisted(() => vi.fn(async () => ({ id: 'inc-1', occurrenceCount: 1 })));

vi.mock('../../operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: incidentRecorder,
}));

import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processClaimedOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

const ORG_ID = 'b0000000-0000-4000-8000-0000000000b0';
const ICS_BASE64 = Buffer.from(
  'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:booking-1\r\nEND:VEVENT\r\nEND:VCALENDAR',
  'utf-8',
).toString('base64');

/** Ровно та форма payload, которую собирает `app.enqueue_outbound_message` для канала email. */
function bookingConfirmationIntent(eventId: string): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId,
      occurredAt: '2026-08-19T10:00:00.000Z',
      source: 'email',
      correlationId: eventId,
      outboundMessageClass: 'routine_product',
      outboundCapability: 'essential_delivery',
    },
    payload: {
      recipient: { email: 'person@example.test' },
      message: { text: 'Ваша запись подтверждена.' },
      html: '<p>Ваша запись <strong>подтверждена</strong>.</p>',
      subject: 'Запись подтверждена: Массаж',
      icsContent: ICS_BASE64,
      icsFilename: 'bersoncare-booking-booking-1.ics',
      delivery: { channels: ['email'] },
    },
  };
}

function row(overrides: Partial<OutgoingDeliveryQueueRow> = {}): OutgoingDeliveryQueueRow {
  return {
    id: 'a0000000-0000-4000-8000-00000000000a',
    eventId: 'booking.confirmation:booking-1',
    kind: 'outbound_message',
    channel: 'email',
    payloadJson: { intent: bookingConfirmationIntent('booking.confirmation:booking-1') },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 6,
    nextRetryAt: '2026-08-19T10:00:00.000Z',
    lastAttemptAt: '2026-08-19T09:59:00.000Z',
    sentAt: null,
    deadAt: null,
    lastError: null,
    priority: 0,
    ...overrides,
  };
}

type ScopeRow = { queue_kind: string | null; organization_id: string | null; resolution: string };

type Harness = {
  db: DbPort;
  sentCalls: number;
  deadCalls: { lastError: unknown }[];
};

function harness(scope: ScopeRow): Harness {
  const deadCalls: Harness['deadCalls'] = [];
  let sentCalls = 0;

  const db: DbPort = {
    async query<T>(sqlText: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sqlText.includes('app.resolve_outgoing_delivery_scope')) {
        return { rows: [scope] as T[] };
      }
      if (sqlText.includes("status = 'sent'")) {
        sentCalls += 1;
        return { rows: [] as T[] };
      }
      if (sqlText.includes("status = 'dead'")) {
        deadCalls.push({ lastError: params?.[0] });
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };

  return { db, get sentCalls() { return sentCalls; }, deadCalls };
}

const TENANT_SCOPE: ScopeRow = {
  queue_kind: 'outbound_message',
  organization_id: ORG_ID,
  resolution: 'tenant',
};

describe('outbound_message: арендаторская строка доходит до диспатча как готовое намерение', () => {
  it('дано: строка с organization_id → когда обработка → тогда dispatchOutgoing получил намерение с .ics БАЙТ В БАЙТ, строка sent, инцидента нет', async () => {
    incidentRecorder.mockClear();
    const h = harness(TENANT_SCOPE);
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
    const payload = dispatched[0]!.payload as Record<string, unknown>;
    // Байт в байт: не «поле присутствует», а именно то же содержимое, что положил отправитель.
    expect(payload.icsContent).toBe(ICS_BASE64);
    expect(payload.icsFilename).toBe('bersoncare-booking-booking-1.ics');
    expect(Buffer.from(String(payload.icsContent), 'base64').toString('utf-8')).toContain(
      'UID:booking-1',
    );
    expect(dispatched[0]!.meta.outboundMessageClass).toBe('routine_product');
    expect(dispatched[0]!.meta.outboundCapability).toBe('essential_delivery');
    expect(h.sentCalls).toBe(1);
    expect(h.deadCalls).toHaveLength(0);
    expect(incidentRecorder).not.toHaveBeenCalled();
  });
});

describe('outbound_message: исчерпанные попытки — видимый операторский инцидент, а не тишина', () => {
  it('дано: провайдер недоступен и попытки исчерпаны → когда обработка → тогда строка dead И инцидент direction=outbound_delivery_provider', async () => {
    incidentRecorder.mockClear();
    const h = harness(TENANT_SCOPE);

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 6, maxAttempts: 6 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => {
        throw new Error('provider unreachable: connection reset');
      },
    });

    expect(h.deadCalls).toHaveLength(1);
    expect(incidentRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outbound_delivery_provider',
        integration: 'email',
      }),
    );
  });
});

describe('карантин области доставки перестал быть тихим', () => {
  it('дано: резолвер вернул invalid → когда обработка → тогда строка dead БЕЗ отправки И инцидент direction=outbound_delivery_quarantine с причиной резолвера', async () => {
    incidentRecorder.mockClear();
    const h = harness({
      queue_kind: 'outbound_message',
      organization_id: null,
      resolution: 'unsupported_queue_kind',
    });
    let dispatchCalls = 0;

    await processClaimedOutgoingDeliveryRow(row(), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => {
        dispatchCalls += 1;
        return {};
      },
    });

    expect(dispatchCalls).toBe(0);
    expect(h.deadCalls).toHaveLength(1);
    expect(incidentRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outbound_delivery_quarantine',
        integration: 'outbound_message',
        errorClass: 'unsupported_queue_kind',
      }),
    );
  });

  it('дано: резолвер вернул ДРУГОЙ вид, чем в строке → когда обработка → тогда dead и инцидент queue_kind_mismatch', async () => {
    incidentRecorder.mockClear();
    const h = harness({
      queue_kind: 'reminder_dispatch',
      organization_id: ORG_ID,
      resolution: 'tenant',
    });

    await processClaimedOutgoingDeliveryRow(row(), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => ({}),
    });

    expect(h.deadCalls).toHaveLength(1);
    expect(incidentRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outbound_delivery_quarantine',
        errorClass: 'queue_kind_mismatch',
      }),
    );
  });
});
