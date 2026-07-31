/**
 * УРОВЕНЬ 2, пункт 11 (D20_INTEGRATOR_MAP.md, «Резидентные процессы: воркер и планировщик»,
 * `runtime/worker/outgoingDeliveryWorker.ts`) — карта: «строка, навсегда оставшаяся в
 * `processing`; провал финализации».
 *
 * Разбор двойного отказа в `runOutgoingDeliveryWorkerTickInner`:
 *   1) обработка строки (`processClaimedOutgoingDeliveryRowInner`) кидает — тик ловит это,
 *      увеличивает `errors` и пытается финализировать через `finalizeClaimedRowFailure`
 *      (`markOutgoingDeliveryDead`/`rescheduleOutgoingDeliveryRetry`);
 *   2) если САМА финализация тоже кидает (реальная БД недоступна — то же самое, из-за чего упала
 *      обработка), это ловится ВНУТРЕННИМ catch и только логируется.
 * Строка при этом остаётся в статусе `processing` НАВСЕГДА (до отдельного механизма reclaim по
 * таймауту, который здесь не участвует) — и единственный след случившегося это лог. Ровно то,
 * что карта называет «потеря, которую не видно ничем».
 *
 * Тест доказывает: (а) двойной отказ ОДНОЙ строки не роняет тик — остальные строки очереди
 * обрабатываются как ни в чём не бывало; (б) для сорвавшейся строки НЕ происходит ни одной
 * успешной терминальной записи (ни `dead`, ни `sent`, ни `failed_retryable`) — она реально
 * зависла; (в) для контраста — если финализация НЕ падает, строка корректно уходит в `dead`,
 * а не зависает (провал финализации — это ОТДЕЛЬНОЕ условие потери, не совпадающее с обычным
 * провалом доставки).
 *
 * Заглушка здесь — только граница (БД и провайдер), предмет проверки — наблюдаемый исход строки
 * очереди и устойчивость тика. У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте.
 */
import { describe, expect, it, vi } from 'vitest';

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));

vi.mock('../../observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { ...(actual.logger as object), error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } };
});

import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { runOutgoingDeliveryWorkerTick } from './outgoingDeliveryWorker.js';

function operatorAlertIntent(eventId: string): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId,
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: 'telegram',
      outboundMessageClass: 'operator_security',
      outboundCapability: 'operator_alert',
    },
    payload: {
      recipient: { chatId: 555_000_111 },
      message: { text: 'Инцидент оператора' },
      delivery: { channels: ['telegram'] },
    },
  };
}

function claimedRow(input: {
  id: string;
  incidentId: string;
  attemptCount: number;
  maxAttempts: number;
}): {
  id: string;
  event_id: string;
  kind: string;
  channel: string;
  payload_json: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
  dead_at: string | null;
  last_error: string | null;
} {
  return {
    id: input.id,
    event_id: `evt-${input.id}`,
    kind: 'operator_alert',
    channel: 'telegram',
    payload_json: { intent: operatorAlertIntent(`evt-${input.id}`), incidentId: input.incidentId },
    status: 'processing',
    attempt_count: input.attemptCount,
    max_attempts: input.maxAttempts,
    next_retry_at: '2026-07-31T10:00:00.000Z',
    last_attempt_at: '2026-07-31T09:59:00.000Z',
    sent_at: null,
    dead_at: null,
    last_error: null,
  };
}

type ScopeRow = { queue_kind: string; organization_id: string; resolution: string };

/**
 * DbPort, отвечающий по фрагментам SQL (тот же приём, что в outgoingDeliveryWorker.scope.test.ts):
 * заглушка — сама СУБД, предмет проверки — как воркер интерпретирует её ответы/отказы.
 */
function harness(input: {
  claimed: ReturnType<typeof claimedRow>[];
  scopeByRowId: Record<string, ScopeRow>;
  /** id строк, для которых КАЖДАЯ терминальная запись (dead/sent/failed_retryable) обязана упасть. */
  writeFailsForRowIds: Set<string>;
}): {
  db: DbPort;
  dispatched: string[];
  deadOk: string[];
  deadAttempts: string[];
  sentOk: string[];
  rescheduledOk: string[];
} {
  const dispatched: string[] = [];
  const deadOk: string[] = [];
  const deadAttempts: string[] = [];
  const sentOk: string[] = [];
  const rescheduledOk: string[] = [];

  function rowIdFromDeadOrRescheduleParams(params: unknown[] | undefined): string | undefined {
    // markOutgoingDeliveryDead/rescheduleOutgoingDeliveryRetry bind `id` as the LAST parameter
    // (`WHERE id = ${id}`); markOutgoingDeliverySent likewise.
    const last = params?.[params.length - 1];
    return typeof last === 'string' ? last : undefined;
  }

  const db: DbPort = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sql.includes('public.system_settings')) {
        return { rows: [] as T[] }; // reclaim config falls back to safe defaults
      }
      if (sql.includes('SET reclaim_count = q.reclaim_count + 1')) {
        return { rows: [] as T[] }; // no stale rows to reclaim in this tick
      }
      if (sql.includes("SET status = 'processing'")) {
        return { rows: input.claimed as unknown as T[] };
      }
      if (sql.includes('app.resolve_outgoing_delivery_scope')) {
        const rowId = String(params?.[0] ?? '');
        const scope = input.scopeByRowId[rowId];
        return { rows: (scope ? [scope] : []) as T[] };
      }
      if (sql.includes('app.operator_incident_alert_already_sent')) {
        return { rows: [{ already_sent: false }] as T[] };
      }
      if (sql.includes("status = 'dead'")) {
        const rowId = rowIdFromDeadOrRescheduleParams(params);
        if (rowId) deadAttempts.push(rowId);
        if (rowId && input.writeFailsForRowIds.has(rowId)) {
          throw new Error(`simulated DB outage while finalizing row ${rowId}`);
        }
        if (rowId) deadOk.push(rowId);
        return { rows: [] as T[] };
      }
      if (sql.includes("status = 'sent'")) {
        const rowId = rowIdFromDeadOrRescheduleParams(params);
        if (rowId && input.writeFailsForRowIds.has(rowId)) {
          throw new Error(`simulated DB outage while finalizing row ${rowId}`);
        }
        if (rowId) sentOk.push(rowId);
        return { rows: [] as T[] };
      }
      if (sql.includes("status = 'failed_retryable'")) {
        const rowId = rowIdFromDeadOrRescheduleParams(params);
        if (rowId && input.writeFailsForRowIds.has(rowId)) {
          throw new Error(`simulated DB outage while finalizing row ${rowId}`);
        }
        if (rowId) rescheduledOk.push(rowId);
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };

  return {
    db,
    dispatched,
    deadOk,
    deadAttempts,
    sentOk,
    rescheduledOk,
  };
}

function dispatchOutgoing(
  dispatched: string[],
  failEventIds: Set<string>,
): (intent: OutgoingIntent) => Promise<Record<string, never>> {
  return async (intent: OutgoingIntent) => {
    dispatched.push(intent.meta.eventId);
    if (failEventIds.has(intent.meta.eventId)) {
      throw new Error('provider unreachable: connection reset');
    }
    return {};
  };
}

describe('outgoingDeliveryWorker: двойной отказ (обработка + финализация) не роняет тик, но строка зависает в processing', () => {
  it('дано: обработка строки падает И финализация тоже падает → когда тик → тогда тик не падает, соседняя строка обработана, а сорвавшаяся строка не получает НИ ОДНОЙ успешной терминальной записи', async () => {
    // АРБИТР 1: в runOutgoingDeliveryWorkerTickInner() убрать `try { await finalizeClaimedRowFailure(...) }
    // catch (finalizeError) { ... }` (вызывать finalizeClaimedRowFailure без защиты) — исключение
    // финализации выйдет из тика НЕОБРАБОТАННЫМ, весь `for (const row of rows)` оборвётся, и
    // ROW_OK (обрабатываемая ПОСЛЕ ROW_BAD) вообще не будет обработана — тест покраснеет на
    // `dispatched`/`sentOk` для ROW_OK.
    const ROW_BAD = 'b0000000-0000-4000-8000-00000000000b';
    const ROW_OK = 'a0000000-0000-4000-8000-00000000000a';
    const ORG = 'd0000000-0000-4000-8000-00000000000d';

    const h = harness({
      // ROW_BAD идёт ПЕРВОЙ — так тест доказывает устойчивость тика к порядку.
      claimed: [
        claimedRow({ id: ROW_BAD, incidentId: 'inc-bad', attemptCount: 6, maxAttempts: 6 }),
        claimedRow({ id: ROW_OK, incidentId: 'inc-ok', attemptCount: 1, maxAttempts: 6 }),
      ],
      scopeByRowId: {
        [ROW_BAD]: { queue_kind: 'operator_alert', organization_id: ORG, resolution: 'tenant' },
        [ROW_OK]: { queue_kind: 'operator_alert', organization_id: ORG, resolution: 'tenant' },
      },
      writeFailsForRowIds: new Set([ROW_BAD]),
    });

    const result = await runOutgoingDeliveryWorkerTick({
      db: h.db,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchOutgoing(h.dispatched, new Set([`evt-${ROW_BAD}`])),
      batchSize: 10,
    });

    // Соседняя строка обработана как ни в чём не бывало.
    expect(h.dispatched).toContain(`evt-${ROW_OK}`);
    expect(h.sentOk).toEqual([ROW_OK]);
    expect(result).toEqual({ claimed: 2, processed: 1, errors: 1 });

    // Финализация для сорвавшейся строки была ПОПЫТАНА (дважды — внутри handleDispatchFailure и
    // ещё раз в finalizeClaimedRowFailure тика), но ни разу не УДАЛАСЬ.
    expect(h.deadAttempts.filter((id) => id === ROW_BAD).length).toBeGreaterThanOrEqual(1);
    expect(h.deadOk).not.toContain(ROW_BAD);
    expect(h.sentOk).not.toContain(ROW_BAD);

    // Единственный оставшийся след — лог, а не состояние строки.
    const loggedMessages = loggerError.mock.calls.map((c) => c[1]);
    expect(loggedMessages).toContain('outgoing_delivery_worker_row_failed');
    expect(loggedMessages).toContain('outgoing_delivery_worker_row_failure_finalize_failed');
  });

  it('дано: обработка падает, но финализация НЕ падает → когда тик → тогда строка корректно уходит в dead, а не зависает', async () => {
    // Контраст: провал финализации — самостоятельное условие потери, отдельное от обычного
    // провала доставки. Если пишущая часть БД жива, строка получает терминальный статус.
    // АРБИТР 2: в finalizeClaimedRowFailure() всегда вызывать queueReschedule (никогда не
    // queueMarkDead) — при attemptCount>=maxAttempts строка не получит `dead`, тест покраснеет.
    const ROW_ID = 'c0000000-0000-4000-8000-00000000000c';
    const ORG = 'd0000000-0000-4000-8000-00000000000d';

    const h = harness({
      claimed: [claimedRow({ id: ROW_ID, incidentId: 'inc-c', attemptCount: 6, maxAttempts: 6 })],
      scopeByRowId: { [ROW_ID]: { queue_kind: 'operator_alert', organization_id: ORG, resolution: 'tenant' } },
      writeFailsForRowIds: new Set(), // финализация проходит успешно
    });

    // Сама обработка всё равно падает мимо processClaimedOutgoingDeliveryRowInner: имитируем это
    // отказом резолва инцидента (operator_incident_alert_already_sent недоступен).
    const dbWithScopeThrow: DbPort = {
      ...h.db,
      async query<T>(sql: string, params?: unknown[]) {
        if (sql.includes('app.operator_incident_alert_already_sent')) {
          throw new Error('advisory function unavailable');
        }
        return h.db.query<T>(sql, params);
      },
    };

    const result = await runOutgoingDeliveryWorkerTick({
      db: dbWithScopeThrow,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchOutgoing(h.dispatched, new Set()),
      batchSize: 10,
    });

    expect(result).toEqual({ claimed: 1, processed: 0, errors: 1 });
    expect(h.deadOk).toEqual([ROW_ID]);
  });

  it('дано: обработка падает, финализация жива, попыток ещё не исчерпано (attemptCount < maxAttempts) → когда тик → тогда строка уходит в повтор (failed_retryable), а НЕ в dead', async () => {
    // ЧАСТЫЙ случай карты: первая попытка из шести. Если finalizeClaimedRowFailure() всегда звал
    // бы queueMarkDead вместо queueReschedule, строка на первой попытке умерла бы навсегда вместо
    // повтора — это и есть отсутствие покрытия ветки reschedule, названное в аудите.
    // АРБИТР: в finalizeClaimedRowFailure() убрать ветку `if (attemptCount >= maxAttempts)` и
    // всегда вызывать queueMarkDead — ROW_ID получит `dead` вместо `failed_retryable`, тест
    // покраснеет на `h.rescheduledOk`/`h.deadOk`.
    const ROW_ID = 'e0000000-0000-4000-8000-00000000000e';
    const ORG = 'd0000000-0000-4000-8000-00000000000d';

    const h = harness({
      claimed: [claimedRow({ id: ROW_ID, incidentId: 'inc-e', attemptCount: 1, maxAttempts: 6 })],
      scopeByRowId: { [ROW_ID]: { queue_kind: 'operator_alert', organization_id: ORG, resolution: 'tenant' } },
      writeFailsForRowIds: new Set(), // финализация проходит успешно
    });

    // Обработка всё равно падает мимо processClaimedOutgoingDeliveryRowInner, как во втором тесте.
    const dbWithScopeThrow: DbPort = {
      ...h.db,
      async query<T>(sql: string, params?: unknown[]) {
        if (sql.includes('app.operator_incident_alert_already_sent')) {
          throw new Error('advisory function unavailable');
        }
        return h.db.query<T>(sql, params);
      },
    };

    const result = await runOutgoingDeliveryWorkerTick({
      db: dbWithScopeThrow,
      writePort: { writeDb: async () => undefined } as never,
      dispatchOutgoing: dispatchOutgoing(h.dispatched, new Set()),
      batchSize: 10,
    });

    expect(result).toEqual({ claimed: 1, processed: 0, errors: 1 });
    expect(h.rescheduledOk).toEqual([ROW_ID]);
    expect(h.deadOk).not.toContain(ROW_ID);
  });
});
