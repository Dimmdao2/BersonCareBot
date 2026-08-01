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
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import {
  getCurrentOrganizationPrincipalId,
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processClaimedOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

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

function queueRow(kind: string): OutgoingDeliveryQueueRow {
  return {
    id: ROW_ID,
    eventId: 'evt-scope',
    kind,
    channel: 'telegram',
    payloadJson: { intent: operatorAlertIntent(), incidentId: INCIDENT_ID },
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
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<Record<string, never>>;
  writePort: { writeDb: () => Promise<undefined> };
};

function harness(scope: ScopeRow | null): Harness {
  const dispatched: Harness['dispatched'] = [];
  const quarantined: string[] = [];
  const state = { markedSent: 0 };

  const db: DbPort = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sql.includes('app.resolve_outgoing_delivery_scope')) {
        return { rows: (scope ? [scope] : []) as T[] };
      }
      if (sql.includes('app.operator_incident_alert_already_sent')) {
        return { rows: [{ already_sent: false }] as T[] };
      }
      if (sql.includes("status = 'dead'")) {
        // Второй параметр запроса markOutgoingDeliveryDead — текст last_error.
        quarantined.push(String(params?.[0] ?? ''));
        return { rows: [] as T[] };
      }
      if (sql.includes("status = 'sent'")) {
        state.markedSent += 1;
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
    get markedSent() {
      return state.markedSent;
    },
    async dispatchOutgoing(intent: OutgoingIntent) {
      dispatched.push({ intent, organizationId: getCurrentOrganizationPrincipalId() });
      return {};
    },
    writePort: { writeDb: async () => undefined },
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
  it('дано: арендатор строки не резолвится → когда обработка → тогда карантин и НИ ОДНОЙ отправки', async () => {
    // Ровно требование карты. Без этой ветки сообщение ушло бы из-под ambient-принципала чужой клиники.
    // АРБИТР: в processClaimedOutgoingDeliveryRowInner() убрать блок `if (scope.kind === 'invalid')`
    // — dispatchOutgoing будет вызван, `dispatched` перестанет быть пустым, тест покраснеет.
    const h = harness({ queue_kind: 'operator_alert', organization_id: null, resolution: 'unresolved' });

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
