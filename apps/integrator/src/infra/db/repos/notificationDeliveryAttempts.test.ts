/**
 * УРОВЕНЬ 2, пункт 12 (D20_INTEGRATOR_MAP.md, `repos/notificationDeliveryAttempts.ts`) — карта
 * дословно: «best-effort запись попыток и ПРОПУСКОВ каналов (skips, not-enqueued) — это
 * единственное, что делает молчаливый пропуск видимым». Поведение под тесты:
 * • дано: канал пропущен → когда запись → тогда причина пропуска сохранена (без неё «сообщение
 *   не пришло» неразбираемо в принципе);
 * • дано: запись журнала упала → когда доставка → тогда сама доставка не отменяется.
 *
 * Заглушка — только БД (`db.query`); предмет проверки — какие параметры (канал/причина/occurrence)
 * реально доехали до INSERT, и что провал самой записи не пробрасывается наружу.
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте D20_TESTS_LEVEL2_REPORT.md.
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';
import {
  recordMessengerChannelSkipsBestEffort,
  recordMessengerNotEnqueuedSkipsBestEffort,
  recordNotificationDeliveryAttemptBestEffort,
} from './notificationDeliveryAttempts.js';

/** Позиции параметров INSERT INTO public.notification_delivery_attempts (см. исходник). */
const COL = {
  organizationId: 0,
  userId: 1,
  integratorUserId: 2,
  topicCode: 3,
  intentType: 4,
  channel: 5,
  status: 6,
  reason: 7,
  providerStatusCode: 8,
  eventId: 9,
  occurrenceId: 10,
  recipientRef: 11,
  errorMessage: 12,
} as const;

/** Достаёт индекс колонки из РЕАЛЬНОГО списка колонок в тексте выполняемого INSERT (не хардкод). */
function columnIndexFromInsertSql(sqlText: string, columnName: string): number {
  const match = sqlText.match(/INSERT INTO public\.notification_delivery_attempts\s*\(([^)]*)\)/i);
  if (!match) throw new Error('unexpected INSERT shape: column list not found in SQL text');
  const columns = match[1]!.split(',').map((c) => c.trim());
  const idx = columns.indexOf(columnName);
  if (idx === -1) throw new Error(`column "${columnName}" not found in INSERT column list`);
  return idx;
}

function harness(): { db: DbPort; inserts: unknown[][] } {
  const inserts: unknown[][] = [];
  const db: DbPort = {
    async query<T>(_text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      inserts.push(params ?? []);
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return { db, inserts };
}

describe('recordMessengerChannelSkipsBestEffort — пропуск канала с причиной', () => {
  it('дано: пропущены telegram, max и НЕ-мессенджерский канал → когда запись → тогда причина сохранена для telegram/max, лишний канал не даёт мусора в журнал мессенджера', async () => {
    // АРБИТР: убрать `if (!isMessengerChannel(s.channel)) continue;` в recordMessengerChannelSkipsBestEffort
    // — 'email' появится в списке записанных каналов, тест покраснеет на составе множества каналов.
    const { db, inserts } = harness();

    await recordMessengerChannelSkipsBestEffort(db, {
      integratorUserId: 'user-1',
      occurrenceId: 'occ-1',
      topicCode: 'appointment_reminders',
      skippedChannels: [
        { channel: 'telegram', reason: 'muted' },
        { channel: 'max', reason: 'disabled_by_user_topic_channel' },
        { channel: 'email', reason: 'missing_email' },
      ],
      organizationId: null,
    });

    const recorded = inserts.map((p) => ({
      channel: p[COL.channel],
      status: p[COL.status],
      reason: p[COL.reason],
    }));
    expect(recorded).toEqual([
      { channel: 'telegram', status: 'skipped', reason: 'muted' },
      { channel: 'max', status: 'skipped', reason: 'disabled_by_user_topic_channel' },
    ]);
  });
});

describe('recordMessengerNotEnqueuedSkipsBestEffort — канал не поставлен в очередь без явного skip-повода', () => {
  it('дано: telegram уже записан как skip выше по стеку, max не в sendChannels и не отмечен → когда запись → тогда max получает reason=missing_binding РОВНО один раз, telegram не дублируется', async () => {
    // АРБИТР 1: убрать `if (input.alreadySkippedChannels.has(ch)) continue;` — telegram получит
    // ВТОРУЮ (лишнюю) запись со своей уже записанной причиной размытой в missing_binding, тест
    // покраснеет на количестве/составе записей.
    const { db, inserts } = harness();

    await recordMessengerNotEnqueuedSkipsBestEffort(db, {
      integratorUserId: 'user-1',
      occurrenceId: 'occ-1',
      topicCode: 'appointment_reminders',
      sendChannels: [],
      alreadySkippedChannels: new Set(['telegram']),
      organizationId: null,
    });

    const recorded = inserts.map((p) => ({
      channel: p[COL.channel],
      status: p[COL.status],
      reason: p[COL.reason],
    }));
    expect(recorded).toEqual([{ channel: 'max', status: 'skipped', reason: 'missing_binding' }]);
  });

  it('дано: max реально уходит в этот тик (есть в sendChannels) → когда запись → тогда канал, который ДЕЙСТВИТЕЛЬНО отправляется, не помечается как пропущенный', async () => {
    // Если это условие снять, канал, который реально уйдёт получателю, будет одновременно записан
    // в журнал как «пропущен по missing_binding» — ложный сигнал, который сломает разбор инцидента
    // ровно наоборот («мне не пришло», хотя пришло).
    // АРБИТР 2: убрать `if (input.sendChannels.some((s) => s.channel === ch)) continue;` — max
    // попадёт в записанные пропуски, тест покраснеет.
    const { db, inserts } = harness();

    await recordMessengerNotEnqueuedSkipsBestEffort(db, {
      integratorUserId: 'user-1',
      occurrenceId: 'occ-1',
      topicCode: 'appointment_reminders',
      sendChannels: [{ channel: 'max' }],
      alreadySkippedChannels: new Set(),
      organizationId: null,
    });

    const recordedChannels = inserts.map((p) => p[COL.channel]);
    expect(recordedChannels).toEqual(['telegram']);
  });
});

describe('recordNotificationDeliveryAttemptBestEffort — best-effort запись не должна отменять доставку', () => {
  it('дано: сама запись в БД упала → когда вызов → тогда функция НЕ пробрасывает исключение наружу (доставка не отменяется из-за журнала)', async () => {
    // АРБИТР: убрать `try { ... } catch (err) { logger.warn(...) }` (оставить голый await) —
    // промис начнёт реджектиться, `.resolves` в тесте упадёт.
    const db: DbPort = {
      async query() {
        throw new Error('journal table unavailable');
      },
      async tx(fn) {
        return fn(db);
      },
    };

    await expect(
      recordNotificationDeliveryAttemptBestEffort(db, {
        channel: 'telegram',
        status: 'skipped',
        reason: 'muted',
        eventId: 'evt-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('дано: occurrenceId — мусорная строка (не UUID) → когда запись → тогда в БД уходит NULL, а не мусор, который обвалит INSERT целиком и утопит саму причину пропуска', async () => {
    // Если мусор доедет до `::uuid`, PostgreSQL кинет "invalid input syntax for uuid" — это попадёт
    // в тот же catch, что и «БД недоступна», и ВЕСЬ пропуск (включая валидный channel/reason)
    // будет молча потерян из-за постороннего мусора в одном поле.
    // АРБИТР: заменить `parseOccurrenceUuid(input.occurrenceId)` на голый `input.occurrenceId ?? null`
    // — тест поймает мусорную строку на месте NULL.
    const { db, inserts } = harness();

    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'telegram',
      status: 'skipped',
      reason: 'missing_binding',
      eventId: 'evt-2',
      occurrenceId: 'not-a-real-uuid',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]![COL.occurrenceId]).toBeNull();
    expect(inserts[0]![COL.reason]).toBe('missing_binding');
  });

  it('дано: occurrenceId — валидный UUID → когда запись → тогда он доезжает как есть', async () => {
    const { db, inserts } = harness();
    const uuid = '11111111-1111-4111-8111-111111111111';

    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'max',
      status: 'success',
      eventId: 'evt-3',
      occurrenceId: uuid,
    });

    expect(inserts[0]![COL.occurrenceId]).toBe(uuid);
  });

  it('дано: пропуск подан с непустым organizationId → когда запись → тогда он доезжает в колонку organization_id И сам INSERT выполняется под принципалом ИМЕННО этой организации', async () => {
    // N2 (D20_LEVEL2_REAUDIT.md): раньше все три теста скипов подавали organizationId: null, поэтому
    // ветка `organizationId && db.integratorDrizzle === undefined` (принципал арендатора) не
    // исполнялась НИ РАЗУ. Таблица под FORCE RLS с политикой
    // `WITH CHECK (app.is_staff() AND app.current_org_id() = organization_id ...)`
    // (deploy/postgres/phase4-locked-helper-rls-policies.sql:913-917) — без верного принципала
    // такой INSERT в проде отвергается RLS и попадает в тот же best-effort catch, то есть пропуск
    // исчезает целиком.
    // АРБИТР: заменить обёртку принципала на голый `fn(db)` (или подставить чужой org, или всегда
    // писать organization_id = NULL) — тест покраснеет либо на значении колонки, либо на принципале,
    // видимом внутри самого INSERT.
    const ORG = '22222222-2222-4222-8222-222222222222';
    const inserts: unknown[][] = [];
    const seenOrgAtInsert: Array<string | undefined> = [];
    const db: DbPort = {
      async query<T>(_text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
        seenOrgAtInsert.push(getCurrentOrganizationPrincipalId());
        inserts.push(params ?? []);
        return { rows: [] as T[] };
      },
      async tx<T>(fn: (txDb: DbPort) => Promise<T>): Promise<T> {
        return fn(db);
      },
    };

    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'telegram',
      status: 'skipped',
      reason: 'muted',
      eventId: 'evt-org',
      organizationId: ORG,
    });

    expect(inserts[0]![COL.organizationId]).toBe(ORG);
    expect(seenOrgAtInsert).toEqual([ORG]);
  });

  it('дано: реальный текст выполняемого INSERT → когда запись → тогда значения status/reason попадают ИМЕННО в те колонки, что названы в СПИСКЕ КОЛОНОК запроса, а не в захардкоженную позицию', async () => {
    // N3 (D20_LEVEL2_REAUDIT.md): переставить `status` и `reason` МЕСТАМИ В СПИСКЕ КОЛОНОК, не
    // трогая VALUES, раньше проходило незамеченным — весь набор сверял только ПОЗИЦИЮ параметра
    // (COL.status/COL.reason — хардкод), а не то, в какую колонку эта позиция реально попадёт. В
    // проде такая перестановка молча пишет status='muted' (текст причины), reason='skipped'
    // (статус) — операторский журнал начинает врать.
    // АРБИТР: в INSERT поменять местами `status` и `reason` в СПИСКЕ КОЛОНОК (VALUES не трогать) —
    // тест покраснеет: колонка 'status' в тексте запроса окажется на позиции, где VALUES несёт
    // значение reason, и наоборот.
    const inserts: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
        inserts.push({ text, params: params ?? [] });
        return { rows: [] as T[] };
      },
      async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
        return fn(db);
      },
    };

    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'telegram',
      status: 'skipped',
      reason: 'muted',
      eventId: 'evt-col',
    });

    const { text, params } = inserts[0]!;
    const statusIdx = columnIndexFromInsertSql(text, 'status');
    const reasonIdx = columnIndexFromInsertSql(text, 'reason');
    expect(params[statusIdx]).toBe('skipped');
    expect(params[reasonIdx]).toBe('muted');
  });
});
