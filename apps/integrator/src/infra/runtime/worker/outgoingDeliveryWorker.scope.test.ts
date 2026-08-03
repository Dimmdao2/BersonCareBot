/**
 * УРОВЕНЬ 0, пункт 4 (D20_INTEGRATOR_MAP.md): карантин строки очереди без разрешимого арендатора.
 * Из карты дословно: «строка без разрешимого арендатора уходит в карантин и НЕ отправляется
 * "под текущим"». Цена ошибки — сообщение с данными одной клиники, отправленное из-под другой.
 *
 * Проверяется НАБЛЮДАЕМЫЙ ИСХОД строки очереди: ушла ли отправка к провайдеру и под каким
 * принципалом. Поэтому тест подставляет фейковую БД (она отвечает за резолв арендатора и
 * принимает UPDATE'ы статуса) и фейковый `dispatchOutgoing`, который записывает, ЧТО и ПОД КАКИМ
 * принципалом до него дошло. Заглушка здесь — граница (БД и провайдер), а предмет проверки —
 * решение воркера между ними.
 *
 * Отдельный приём: тесты карантина обёрнуты в принципал ЧУЖОЙ клиники (`AMBIENT_ORG`) — так
 * гарантия «не под текущим» доказывается в самой сильной форме. Тесты штатных путей идут под тем
 * же инфра-принципалом, что и боевой тик (`runOutgoingDeliveryWorkerTick`), чтобы не закреплять
 * поведение, которого в бою не бывает.
 *
 * У каждого `it` в комментарии — свой арбитр. Арбитры прогнаны руками, вывод — в отчёте.
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => false,
}));
import type {
  DbPort,
  DbQueryResult,
  DbWriteMutation,
  DeliverySendResult,
  OutgoingIntent,
  DeliveryAdapter,
} from '../../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../../adapters/dispatchPort.js';
import { OUTBOUND_MESSAGE_POLICY_DENIED } from '../../adapters/outboundMessagePolicy.js';
import {
  getCurrentOrganizationPrincipalId,
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import {
  processClaimedOutgoingDeliveryRow,
  retrySentSpecialistTaskReminderBotMarker,
} from './outgoingDeliveryWorker.js';

/** Клиника, под которой воркер оказался «по инерции» — не она владеет строкой очереди. */
const AMBIENT_ORG = 'c0000000-0000-4000-8000-00000000000c';
/** Клиника, которой строка принадлежит на самом деле. */
const OWNER_ORG = 'd0000000-0000-4000-8000-00000000000d';

const ROW_ID = 'e0000000-0000-4000-8000-00000000000e';
const INCIDENT_ID = 'f0000000-0000-4000-8000-00000000000f';

type ScopeRow = { queue_kind: string | null; organization_id: string | null; resolution: string };

function operatorAlertIntent(): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'evt-scope',
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

function appointmentReminderIntent(channel: 'telegram' | 'max' = 'telegram'): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'appointment-reminder:event:messenger',
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: channel,
      userId: 'a0000000-0000-4000-8000-00000000000a',
      outboundMessageClass: 'routine_product',
      outboundCapability: 'essential_delivery',
    },
    payload: {
      recipient: channel === 'telegram' ? { chatId: 'tg-1' } : { userId: 'max-1' },
      message: { text: 'Напоминание о записи' },
      delivery: { channels: [channel], maxAttempts: 1 },
    },
  };
}

function queueRow(kind: string): OutgoingDeliveryQueueRow {
  return {
    id: ROW_ID,
    eventId: 'evt-scope',
    kind,
    channel: 'telegram',
    payloadJson: {
      intent: kind === 'appointment_reminder' ? appointmentReminderIntent() : operatorAlertIntent(),
      incidentId: INCIDENT_ID,
      ...(kind === 'specialist_task_reminder'
        ? {
            successOutcome: {
              type: 'specialistTask.reminder.markSent',
              taskId: 'a0000000-0000-4000-8000-00000000000a',
            },
          }
        : {}),
      ...(kind === 'appointment_reminder'
        ? {
            appointmentId: 'b0000000-0000-4000-8000-00000000000b',
            generationStartAt: '2026-08-01T10:00:00.000Z',
            dueAt: '2026-07-31T10:00:00.000Z',
            messengerStepIndex: 0,
            messengerLadder: [
              { channel: 'telegram', recipient: { chatId: 'tg-1' } },
              { channel: 'max', recipient: { userId: 'max-1' } },
            ],
          }
        : {}),
    },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 6,
    nextRetryAt: '2026-07-31T10:00:00.000Z',
    lastAttemptAt: null,
    sentAt: null,
    deadAt: null,
    lastError: null,
  };
}

type Harness = {
  db: DbPort;
  /** Аргументы каждого dispatch + организация-принципал в момент вызова. */
  dispatched: { intent: OutgoingIntent; organizationId: string | undefined }[];
  /** Строки, помеченные `dead` (карантин), с текстом причины. */
  quarantined: string[];
  /** Строки, помеченные `sent`. */
  markedSent: number;
  /** Строки, оставленные durable для retry. */
  rescheduled: number;
  /** Sent-row bookkeeping completion writes, which must never dispatch the provider. */
  bookkeepingApplied: number;
  ladderTransitions: number;
  writes: DbWriteMutation[];
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  writePort: { writeDb: (mutation: DbWriteMutation) => Promise<undefined> };
};

function harness(
  scope: ScopeRow | null,
  options: {
    materializationCurrent?: boolean;
    appointmentMaterializationCurrent?: boolean;
    botMarkerBookkeepingFailure?: boolean;
  } = {},
): Harness {
  const dispatched: Harness['dispatched'] = [];
  const quarantined: string[] = [];
  const writes: DbWriteMutation[] = [];
  const state = {
    markedSent: 0,
    rescheduled: 0,
    bookkeepingApplied: 0,
    ladderTransitions: 0,
    botMarkerFailuresRemaining: options.botMarkerBookkeepingFailure === true ? 1 : 0,
  };

  const db: DbPort = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sql.includes('app.resolve_outgoing_delivery_scope')) {
        return { rows: (scope ? [scope] : []) as T[] };
      }
      if (sql.includes('app.operator_incident_alert_already_sent')) {
        return { rows: [{ already_sent: false }] as T[] };
      }
      if (sql.includes('app.revalidate_specialist_task_reminder_materialization')) {
        return { rows: [{ current: options.materializationCurrent !== false }] as T[] };
      }
      if (sql.includes('app.revalidate_appointment_reminder_materialization')) {
        return { rows: [{ current: options.appointmentMaterializationCurrent !== false }] as T[] };
      }
      if (sql.includes('app.advance_appointment_reminder_messenger_ladder')) {
        state.ladderTransitions += 1;
        return { rows: [{ transition: 'advanced' }] as T[] };
      }
      if (
        state.botMarkerFailuresRemaining > 0 &&
        sql.includes('UPDATE public.user_channel_bindings')
      ) {
        state.botMarkerFailuresRemaining -= 1;
        throw new Error('temporary_bot_marker_bookkeeping_failure');
      }
      if (sql.includes('{bookkeeping,botMarkerAppliedAt}')) {
        state.bookkeepingApplied += 1;
        return { rows: [] as T[] };
      }
      if (sql.includes("status = 'dead'")) {
        // Второй параметр запроса markOutgoingDeliveryDead — текст last_error.
        quarantined.push(String(params?.[0] ?? ''));
        return { rows: [] as T[] };
      }
      if (sql.includes("SET status = 'sent'")) {
        state.markedSent += 1;
        return { rows: [] as T[] };
      }
      if (sql.includes("status = 'failed_retryable'")) {
        state.rescheduled += 1;
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
    quarantined,
    writes,
    get markedSent() {
      return state.markedSent;
    },
    get rescheduled() {
      return state.rescheduled;
    },
    get bookkeepingApplied() {
      return state.bookkeepingApplied;
    },
    get ladderTransitions() {
      return state.ladderTransitions;
    },
    async dispatchOutgoing(intent: OutgoingIntent) {
      dispatched.push({ intent, organizationId: getCurrentOrganizationPrincipalId() });
      return {};
    },
    writePort: {
      writeDb: async (mutation: DbWriteMutation) => {
        writes.push(mutation);
        return undefined;
      },
    },
  } as Harness;
}

function callWorker(h: Harness, row: OutgoingDeliveryQueueRow): Promise<void> {
  return processClaimedOutgoingDeliveryRow(row, {
    db: h.db,
    writePort: h.writePort as never,
    dispatchOutgoing: h.dispatchOutgoing as never,
  });
}

/**
 * Худший случай: воркер уже находится под принципалом ЧУЖОЙ клиники. Если строка всё равно
 * не отправится — гарантия «не под текущим» доказана в самой сильной форме.
 */
function processUnderForeignTenant(h: Harness, row: OutgoingDeliveryQueueRow): Promise<void> {
  return runWithOrganizationPrincipal(AMBIENT_ORG, () => callWorker(h, row));
}

/**
 * Как это устроено в бою: `runOutgoingDeliveryWorkerTick` оборачивает тик в инфра-принципал
 * воркера, арендатора в этот момент нет.
 */
function processUnderWorkerTick(h: Harness, row: OutgoingDeliveryQueueRow): Promise<void> {
  return runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
    callWorker(h, row),
  );
}

describe('воркер доставки: строка без разрешимого арендатора не отправляется «под текущим»', () => {
  it('appointment messenger success finishes the stable row without trying MAX', async () => {
    const h = harness({
      queue_kind: 'appointment_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    await processUnderWorkerTick(h, queueRow('appointment_reminder'));
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]?.intent.payload.delivery).toMatchObject({ channels: ['telegram'] });
    expect(h.markedSent).toBe(1);
    expect(h.ladderTransitions).toBe(0);
  });

  it('appointment reminder without exact product-policy markers never reaches a provider', async () => {
    const send = vi.fn(async () => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const dispatch = createDefaultDispatchPort({ adapters: [adapter] });
    const h = harness({
      queue_kind: 'appointment_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    h.dispatchOutgoing = dispatch.dispatchOutgoing.bind(dispatch);
    const row = queueRow('appointment_reminder');
    const original = appointmentReminderIntent();
    const {
      outboundMessageClass: _outboundMessageClass,
      outboundCapability: _outboundCapability,
      ...metaWithoutPolicy
    } = original.meta;
    void _outboundMessageClass;
    void _outboundCapability;

    await processUnderWorkerTick(h, {
      ...row,
      payloadJson: {
        ...row.payloadJson,
        intent: { ...original, meta: metaWithoutPolicy },
      },
    });

    expect(send).not.toHaveBeenCalled();
    expect(h.quarantined).toEqual([OUTBOUND_MESSAGE_POLICY_DENIED]);
    expect(h.markedSent).toBe(0);
    expect(h.ladderTransitions).toBe(0);
  });

  it('appointment retryable failure advances the persisted ladder exactly once', async () => {
    const h = harness({
      queue_kind: 'appointment_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    h.dispatchOutgoing = async () => {
      throw new Error('temporary_provider_failure');
    };
    await processUnderWorkerTick(h, queueRow('appointment_reminder'));
    expect(h.ladderTransitions).toBe(1);
    expect(h.markedSent).toBe(0);
    expect(h.rescheduled).toBe(0);
  });

  it('stale appointment generation is terminalized before provider dispatch', async () => {
    const h = harness(
      {
        queue_kind: 'appointment_reminder',
        organization_id: OWNER_ORG,
        resolution: 'tenant',
      },
      { appointmentMaterializationCurrent: false },
    );
    await processUnderWorkerTick(h, queueRow('appointment_reminder'));
    expect(h.dispatched).toEqual([]);
    expect(h.markedSent).toBe(0);
    expect(h.ladderTransitions).toBe(0);
  });

  it('delivers a ready specialist-task transport intent under its row tenant without product-policy reads', async () => {
    const h = harness({
      queue_kind: 'specialist_task_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    const row = queueRow('specialist_task_reminder');

    await processUnderWorkerTick(h, row);

    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]?.organizationId).toBe(OWNER_ORG);
    expect(h.writes).toEqual([
      {
        type: 'specialistTask.reminder.markSent',
        params: {
          queueId: ROW_ID,
        },
      },
    ]);
    expect(h.markedSent).toBe(1);
  });

  it('keeps retryable generic transport failure durable and dead-letters permanent failure', async () => {
    const retry = harness({
      queue_kind: 'specialist_task_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    retry.dispatchOutgoing = async () => {
      throw new Error('temporary_provider_failure');
    };
    await processUnderWorkerTick(retry, queueRow('specialist_task_reminder'));
    expect(retry.rescheduled).toBe(1);
    expect(retry.writes).toEqual([]);
    expect(retry.markedSent).toBe(0);

    const permanent = harness({
      queue_kind: 'specialist_task_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    permanent.dispatchOutgoing = async () => {
      throw new Error('CHANNEL_NOT_SUPPORTED:telegram');
    };
    await processUnderWorkerTick(permanent, queueRow('specialist_task_reminder'));
    expect(permanent.quarantined).toEqual(['CHANNEL_NOT_SUPPORTED:telegram']);
    expect(permanent.writes).toEqual([]);
    expect(permanent.rescheduled).toBe(0);
  });

  it('delivers operator health digest globally without incidentId and preserves generic retry/dead behavior', async () => {
    const digestRow = {
      ...queueRow('operator_health_digest'),
      payloadJson: { intent: operatorAlertIntent() },
    };
    const success = harness({
      queue_kind: 'operator_health_digest',
      organization_id: null,
      resolution: 'operator_global',
    });
    await processUnderWorkerTick(success, digestRow);
    expect(success.dispatched).toHaveLength(1);
    expect(success.dispatched[0]?.organizationId).toBeUndefined();
    expect(success.markedSent).toBe(1);
    expect(success.writes).toEqual([]);

    const retry = harness({
      queue_kind: 'operator_health_digest',
      organization_id: null,
      resolution: 'operator_global',
    });
    retry.dispatchOutgoing = async () => {
      throw new Error('temporary_provider_failure');
    };
    await processUnderWorkerTick(retry, digestRow);
    expect(retry.rescheduled).toBe(1);

    const dead = harness({
      queue_kind: 'operator_health_digest',
      organization_id: null,
      resolution: 'operator_global',
    });
    dead.dispatchOutgoing = async () => {
      throw new Error('CHANNEL_NOT_SUPPORTED:telegram');
    };
    await processUnderWorkerTick(dead, digestRow);
    expect(dead.quarantined).toEqual(['CHANNEL_NOT_SUPPORTED:telegram']);
  });

  it('preserves digest policy markers into real egress policy and fails closed for missing or wrong markers', async () => {
    const send = vi.fn(async () => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const dispatch = createDefaultDispatchPort({ adapters: [adapter] });
    const scope = {
      queue_kind: 'operator_health_digest',
      organization_id: null,
      resolution: 'operator_global',
    };
    const valid = harness(scope);
    valid.dispatchOutgoing = dispatch.dispatchOutgoing.bind(dispatch);
    const base = queueRow('operator_health_digest');
    const validRow = { ...base, payloadJson: { intent: operatorAlertIntent() } };

    await processUnderWorkerTick(valid, validRow);

    expect(send).toHaveBeenCalledTimes(1);
    expect(valid.markedSent).toBe(1);

    for (const markerCase of ['missing', 'wrong'] as const) {
      const denied = harness(scope);
      denied.dispatchOutgoing = dispatch.dispatchOutgoing.bind(dispatch);
      const original = operatorAlertIntent();
      const deniedIntent: OutgoingIntent = {
        ...original,
        meta: {
          eventId: original.meta.eventId,
          occurredAt: original.meta.occurredAt,
          source: original.meta.source,
          ...(markerCase === 'wrong'
            ? {
                outboundMessageClass: 'routine_product' as const,
                outboundCapability: 'operator_alert' as const,
              }
            : {}),
        },
      };
      await processUnderWorkerTick(denied, {
        ...base,
        eventId: `evt-${markerCase}`,
        payloadJson: { intent: deniedIntent },
      });
      expect(denied.quarantined).toEqual([OUTBOUND_MESSAGE_POLICY_DENIED]);
      expect(denied.markedSent).toBe(0);
    }
    const invalid = harness(scope);
    invalid.dispatchOutgoing = dispatch.dispatchOutgoing.bind(dispatch);
    const rawInvalidIntent = operatorAlertIntent() as unknown as {
      meta: Record<string, unknown>;
    };
    rawInvalidIntent.meta.outboundMessageClass = 'untrusted_external_value';
    await processUnderWorkerTick(invalid, {
      ...base,
      eventId: 'evt-invalid-marker',
      payloadJson: { intent: rawInvalidIntent },
    });
    expect(invalid.quarantined).toEqual(['BAD_PAYLOAD']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not reschedule transport after an external success when product receipt bookkeeping fails', async () => {
    const h = harness({
      queue_kind: 'specialist_task_reminder',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });
    h.writePort.writeDb = async (mutation: DbWriteMutation) => {
      h.writes.push(mutation);
      throw new Error('temporary_outcome_store_failure');
    };

    await processUnderWorkerTick(h, queueRow('specialist_task_reminder'));

    expect(h.dispatched).toHaveLength(1);
    expect(h.markedSent).toBe(1);
    expect(h.rescheduled).toBe(0);
    expect(h.quarantined).toEqual([]);
    expect(h.writes).toEqual([
      {
        type: 'specialistTask.reminder.markSent',
        params: { queueId: ROW_ID },
      },
    ]);
  });

  it('does not repeat an external specialist reminder when bot-marker bookkeeping fails after send', async () => {
    const h = harness(
      {
        queue_kind: 'specialist_task_reminder',
        organization_id: OWNER_ORG,
        resolution: 'tenant',
      },
      { botMarkerBookkeepingFailure: true },
    );

    await processUnderWorkerTick(h, queueRow('specialist_task_reminder'));

    expect(h.dispatched).toHaveLength(1);
    expect(h.markedSent).toBe(1);
    expect(h.rescheduled).toBe(0);

    await retrySentSpecialistTaskReminderBotMarker(h.db, {
      ...queueRow('specialist_task_reminder'),
      status: 'sent',
      sentAt: '2026-07-31T10:00:01.000Z',
    });

    expect(h.dispatched).toHaveLength(1);
    expect(h.bookkeepingApplied).toBe(1);
  });

  for (const mutation of ['topic/channel disabled', 'messenger recipient rebound'] as const) {
    it(`does not dispatch stale materialization within the 5s worker window after ${mutation}`, async () => {
      const h = harness(
        {
          queue_kind: 'specialist_task_reminder',
          organization_id: OWNER_ORG,
          resolution: 'tenant',
        },
        { materializationCurrent: false },
      );

      await processUnderWorkerTick(h, queueRow('specialist_task_reminder'));

      expect(h.dispatched).toEqual([]);
      expect(h.markedSent).toBe(0);
      expect(h.rescheduled).toBe(0);
      expect(h.writes).toEqual([]);
    });
  }

  it('дано: арендатор строки не резолвится → когда обработка → тогда карантин и НИ ОДНОЙ отправки', async () => {
    // Ровно требование карты. Без этой ветки сообщение ушло бы из-под ambient-принципала чужой клиники.
    // АРБИТР: в processClaimedOutgoingDeliveryRowInner() убрать блок `if (scope.kind === 'invalid')`
    // — dispatchOutgoing будет вызван, `dispatched` перестанет быть пустым, тест покраснеет.
    const h = harness({
      queue_kind: 'operator_alert',
      organization_id: null,
      resolution: 'unresolved',
    });

    await processUnderForeignTenant(h, queueRow('operator_alert'));

    expect(h.dispatched).toEqual([]);
    expect(h.quarantined).toEqual(['TENANT_SCOPE_UNRESOLVED']);
    expect(h.markedSent).toBe(0);
  });

  it('дано: строки очереди вообще нет → когда обработка → тогда карантин, а не отправка вслепую', async () => {
    // ЗАФИКСИРОВАННАЯ ОСОБЕННОСТЬ (найдена этим тестом, см. отчёт): безопасный исход правильный —
    // отправки нет. Но точная причина `queue_not_found` до журнала НЕ доезжает: `resolve…Scope`
    // отдаёт `queueKind: null`, и первым срабатывает более ранний контроль `scope.queueKind !== row.kind`,
    // записывающий TENANT_SCOPE_QUEUE_KIND_MISMATCH. Оператор увидит «не тот вид очереди» вместо
    // «строки нет». Тест закрепляет фактическое поведение, чтобы расхождение диагноза было видно
    // как решение, а не как случайность.
    // АРБИТР: в resolveOutgoingDeliveryScope() при пустом результате вернуть
    // `{ kind: 'tenant', queueKind: 'operator_alert', organizationId: <любой uuid> }` — появится
    // отправка, `dispatched` перестанет быть пустым, тест покраснеет.
    const h = harness(null);

    await processUnderForeignTenant(h, queueRow('operator_alert'));

    expect(h.dispatched).toEqual([]);
    expect(h.quarantined).toEqual(['TENANT_SCOPE_QUEUE_KIND_MISMATCH']);
  });

  it('дано: организация в резолве — не UUID → когда обработка → тогда карантин, а не отправка под мусорным арендатором', async () => {
    // Строка `resolution='tenant'`, но organization_id не похож на идентификатор — принимать такое
    // за арендатора значит выполнить работу неизвестно под кем.
    // АРБИТР: в resolveOutgoingDeliveryScope() убрать `UUID_RE.test(organizationId)` из условия —
    // тест покраснеет: появится отправка под организацией 'не-uuid'.
    const h = harness({
      queue_kind: 'operator_alert',
      organization_id: 'не-uuid',
      resolution: 'tenant',
    });

    await processUnderForeignTenant(h, queueRow('operator_alert'));

    expect(h.dispatched).toEqual([]);
    expect(h.quarantined).toEqual(['TENANT_SCOPE_TENANT']);
  });

  it('дано: заявленный вид строки не совпал с резолвленным → когда обработка → тогда карантин', async () => {
    // Расхождение вида очереди означает, что claim и резолв смотрят на разные строки: обрабатывать
    // такое — значит выполнить чужую работу.
    // АРБИТР: убрать блок `if (scope.queueKind !== row.kind)` — строка уйдёт в обработку как
    // reminder_dispatch с полями operator_alert, `quarantined` опустеет, тест покраснеет.
    const h = harness({
      queue_kind: 'reminder_dispatch',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });

    await processUnderForeignTenant(h, queueRow('operator_alert'));

    expect(h.dispatched).toEqual([]);
    expect(h.quarantined).toEqual(['TENANT_SCOPE_QUEUE_KIND_MISMATCH']);
  });

  it('дано: арендатор строки — клиника D, а воркер работает под клиникой C → когда отправка → тогда она идёт под D', async () => {
    // Обратная сторона карантина: когда арендатор ЕСТЬ, работа обязана переключиться на него.
    // Иначе сообщение уйдёт с данными и правами чужой клиники — тот же класс дефекта.
    // АРБИТР: в processClaimedOutgoingDeliveryRowInner() заменить
    // `runWithOrganizationPrincipal(scope.organizationId, () => processOutgoingDeliveryRow(row, deps))`
    // на прямой `processOutgoingDeliveryRow(row, deps)` — organizationId в момент отправки станет
    // AMBIENT_ORG (клиника C), и тест покраснеет.
    const h = harness({
      queue_kind: 'operator_alert',
      organization_id: OWNER_ORG,
      resolution: 'tenant',
    });

    await processUnderForeignTenant(h, queueRow('operator_alert'));

    expect(h.quarantined).toEqual([]);
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]!.organizationId).toBe(OWNER_ORG);
  });

  it('дано: глобальный операторский алерт в боевом тике → когда отправка → тогда арендатора нет и в карантин строка не уходит', async () => {
    // operator_global — единственный законный случай «без организации»: алерт не принадлежит клинике.
    // Прогон идёт под тем же инфра-принципалом, что и боевой тик.
    // ⚠️ Найдено этим тестом (см. отчёт): ветка operator вызывает processOutgoingDeliveryRow НАПРЯМУЮ
    // и сама не снимает арендатора — она полагается на то, что вызывающий тик его не установил.
    // Здесь это не дефект (в бою тик действительно оборачивается в infra), но и не гарантия модуля.
    // АРБИТР: в processClaimedOutgoingDeliveryRowInner() убрать ветку `if (scope.kind === 'operator')`
    // — строка провалится в tenant-ветку, где organizationId пуст, `runWithOrganizationPrincipal('')`
    // изменит наблюдаемый принципал; тест покраснеет.
    const h = harness({
      queue_kind: 'operator_alert',
      organization_id: null,
      resolution: 'operator_global',
    });

    await processUnderWorkerTick(h, queueRow('operator_alert'));

    expect(h.quarantined).toEqual([]);
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]!.organizationId).toBeUndefined();
  });

  it('D35: дано: строка вида inbound_reply резолвится как operator_global → когда обработка → тогда арендатора нет и в карантин строка не уходит', async () => {
    // Тот же законный случай «без организации», что и у operator_alert выше, но для нового вида
    // очереди `inbound_reply` (D35: ответ на входящее). Ответ адресован конкретному получателю по
    // chatId/userId, а не клинике — резолвер не обязан искать организацию.
    // АРБИТР: в resolveOutgoingDeliveryScope() убрать `row.queue_kind === 'inbound_reply'` из
    // условия operator_global — строка провалится в tenant-ветку и уйдёт в карантин
    // (TENANT_SCOPE_...), `dispatched` останется пустым, тест покраснеет.
    const h = harness({
      queue_kind: 'inbound_reply',
      organization_id: null,
      resolution: 'operator_global',
    });

    await processUnderWorkerTick(h, queueRow('inbound_reply'));

    expect(h.quarantined).toEqual([]);
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]!.organizationId).toBeUndefined();
  });
});
