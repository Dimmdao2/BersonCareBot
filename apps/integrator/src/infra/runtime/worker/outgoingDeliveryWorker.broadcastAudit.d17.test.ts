/**
 * D17 — шестой писатель канона: счётчики `public.broadcast_audit`.
 *
 * Почему тест существует. Три подъёма счётчика сведены в один именованный корень с ИМЕНЕМ СЧЁТЧИКА
 * В ПАРАМЕТРЕ — один chokepoint, а не три двери. Плата за это в том, что различие между «отправлено»,
 * «ошибка» и «заблокировал бота» держится теперь одной строковой константой на каждом маршруте.
 * Подмена `'sent_count'` → `'error_count'` в успешной ветке не ломает ни типы, ни SQL, ни одну другую
 * проверку: журнал рассылок врача просто начинает показывать 0 отправленных и N ошибок при полностью
 * успешной рассылке. Отказ дорогой (человек видит выдуманные числа и принимает по ним решения) и
 * молчаливый — то есть §10a ступень 2, тест здесь обязателен.
 *
 * Предмет проверки — НАБЛЮДАЕМЫЙ выход: какой оператор ушёл в базу, с каким позиционным набором
 * аргументов и под каким принципалом. Заглушка одна и она на границе `DbPort`; выше границы бежит
 * настоящий маршрут воркера (`processClaimedOutgoingDeliveryRow`), включая разрешение области,
 * финализацию строки очереди и классификацию отказа.
 *
 * Арбитры (прогнаны руками, продукт возвращён побайтно):
 *   • `'sent_count'` → `'error_count'` на успехе (`outgoingDeliveryWorker.ts:993`) — КРАСНЫЙ;
 *   • `'error_count'` → `'sent_count'` в `finalizeOutgoingDeliveryDead` — КРАСНЫЙ;
 *   • `'blocked_recipient_count'` → `'error_count'` в `finalizeRecipientBlockedBotDelivery` — КРАСНЫЙ.
 */
import { describe, expect, it, vi } from 'vitest';

const incidentRecorder = vi.hoisted(() => vi.fn(async () => ({ id: 'inc-1', occurrenceCount: 1 })));

vi.mock('../../operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: incidentRecorder,
}));

import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import { getCurrentDatabasePrincipal } from '../../principal/organizationPrincipal.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processClaimedOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

const ORG_ID = 'b0000000-0000-4000-8000-0000000000b0';
const AUDIT_ID = 'd0000000-0000-4000-8000-0000000000d1';
const COUNTER_ROOT = 'app.integrator_increment_broadcast_audit_counter';
const BROADCAST_AUDIT_RELATION = /(INSERT\s+INTO|UPDATE)\s+(public\.)?broadcast_audit/i;

function broadcastIntent(): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'doctor.broadcast:evt-1',
      occurredAt: '2026-08-22T10:00:00.000Z',
      source: 'telegram',
      correlationId: 'doctor.broadcast:evt-1',
      userId: 'c0000000-0000-4000-8000-0000000000c3',
    },
    payload: {
      recipient: { chatId: '777000111' },
      message: { text: 'Клиника закрыта в пятницу.' },
      delivery: { channels: ['telegram'] },
    },
  };
}

function row(overrides: Partial<OutgoingDeliveryQueueRow> = {}): OutgoingDeliveryQueueRow {
  return {
    id: 'a0000000-0000-4000-8000-00000000000a',
    eventId: 'doctor.broadcast:evt-1',
    kind: 'doctor_broadcast_intent',
    channel: 'telegram',
    payloadJson: { intent: broadcastIntent(), broadcastAuditId: AUDIT_ID },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 6,
    nextRetryAt: '2026-08-22T10:00:00.000Z',
    lastAttemptAt: '2026-08-22T09:59:00.000Z',
    sentAt: null,
    deadAt: null,
    lastError: null,
    priority: 0,
    ...overrides,
  };
}

type Executed = { text: string; params: unknown[]; principalOrganizationId: string | undefined };

type Harness = { db: DbPort; executed: Executed[] };

function harness(): Harness {
  const executed: Executed[] = [];
  const db: DbPort = {
    async query<T>(sqlText: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const principal = getCurrentDatabasePrincipal() as { organizationId?: string } | undefined;
      executed.push({ text: sqlText, params, principalOrganizationId: principal?.organizationId });
      if (sqlText.includes('app.resolve_outgoing_delivery_scope')) {
        return {
          rows: [
            {
              queue_kind: 'doctor_broadcast_intent',
              organization_id: ORG_ID,
              resolution: 'tenant',
            },
          ] as T[],
        };
      }
      // Организация счётчика читается со строки самой рассылки, а не берётся из контекста воркера.
      if (sqlText.includes('broadcast_audit') && /SELECT/i.test(sqlText)) {
        return { rows: [{ organization_id: ORG_ID }] as T[] };
      }
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return { db, executed };
}

/** Единственный подъём счётчика, и он — вызов корня, а не запись по таблице журнала. */
function onlyCounterBump(executed: Executed[]): Executed {
  const bumps = executed.filter((call) => call.text.includes(COUNTER_ROOT));
  expect(bumps).toHaveLength(1);
  expect(executed.some((call) => BROADCAST_AUDIT_RELATION.test(call.text))).toBe(false);
  return bumps[0]!;
}

describe('D17 — журнал рассылки врача: имя счётчика различает исход, а не только факт записи', () => {
  it('дано: рассылка ушла адресату → когда обработка → тогда поднят РОВНО sent_count, корнем, под организацией строки рассылки', async () => {
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row(), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => ({}),
    });

    const bump = onlyCounterBump(h.executed);
    expect(bump.params).toEqual([AUDIT_ID, ORG_ID, 'sent_count']);
    expect(bump.principalOrganizationId).toBe(ORG_ID);
    // Строка очереди при этом закрыта как отправленная: журнал и очередь рассказывают одно и то же.
    expect(h.executed.some((call) => call.text.includes("status = 'sent'"))).toBe(true);
  });

  it('дано: провайдер отказал и попытки исчерпаны → когда обработка → тогда поднят РОВНО error_count', async () => {
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 6, maxAttempts: 6 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => {
        throw new Error('provider unreachable: connection reset');
      },
    });

    const bump = onlyCounterBump(h.executed);
    expect(bump.params).toEqual([AUDIT_ID, ORG_ID, 'error_count']);
    expect(bump.principalOrganizationId).toBe(ORG_ID);
  });

  it('дано: адресат заблокировал бота → когда обработка → тогда поднят РОВНО blocked_recipient_count, а не error_count', async () => {
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row(), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => {
        throw new Error('Forbidden: bot was blocked by the user');
      },
    });

    // Заблокировавший бота адресат — нормальное состояние, а не отказ доставки: в журнале врача это
    // отдельное число, и слить его с ошибками значит показать врачу поломку там, где её нет.
    const bump = onlyCounterBump(h.executed);
    expect(bump.params).toEqual([AUDIT_ID, ORG_ID, 'blocked_recipient_count']);
    expect(bump.principalOrganizationId).toBe(ORG_ID);
  });

  it('дано: попытка не последняя и отказ повторяемый → когда обработка → тогда счётчик НЕ поднимается вовсе', async () => {
    incidentRecorder.mockClear();
    const h = harness();

    await processClaimedOutgoingDeliveryRow(row({ attemptCount: 1, maxAttempts: 6 }), {
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: async () => {
        throw new Error('provider unreachable: connection reset');
      },
    });

    // Иначе одна и та же рассылка сосчиталась бы ошибкой столько раз, сколько было ретраев.
    expect(h.executed.filter((call) => call.text.includes(COUNTER_ROOT))).toHaveLength(0);
  });
});
