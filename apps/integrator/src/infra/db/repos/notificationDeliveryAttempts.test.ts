/**
 * Canonical queue owns success, skips, and preparation failures. This repository records only a
 * best-effort real failed provider attempt without making delivery depend on the journal write.
 *
 * Заглушка — только БД (`db.query`); предмет проверки — какие параметры (канал/причина/occurrence)
 * реально доехали до записи, и что провал самой записи не пробрасывается наружу. С D17 запись идёт
 * не относительным `INSERT`, а именованным корнем `app.integrator_record_notification_delivery_attempt`,
 * поэтому позиции ниже — позиции АРГУМЕНТОВ корня, а не колонок `INSERT`.
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте D20_TESTS_LEVEL2_REPORT.md.
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';
import { recordNotificationDeliveryAttemptBestEffort } from './notificationDeliveryAttempts.js';

/** Позиции аргументов `app.integrator_record_notification_delivery_attempt` (см. исходник). */
const COL = {
  organizationId: 0,
  userId: 1,
  topicCode: 2,
  intentType: 3,
  channel: 4,
  status: 5,
  reason: 6,
  providerStatusCode: 7,
  eventId: 8,
  occurrenceId: 9,
  recipientRef: 10,
  errorMessage: 11,
} as const;


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
        status: 'failed',
        reason: 'provider_rejected',
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
      status: 'failed',
      reason: 'provider_rejected',
      eventId: 'evt-2',
      occurrenceId: 'not-a-real-uuid',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]![COL.occurrenceId]).toBeNull();
    expect(inserts[0]![COL.reason]).toBe('provider_rejected');
  });

  it('дано: occurrenceId — валидный UUID → когда запись → тогда он доезжает как есть', async () => {
    const { db, inserts } = harness();
    const uuid = '11111111-1111-4111-8111-111111111111';

    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'max',
      status: 'failed',
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
      status: 'failed',
      reason: 'provider_rejected',
      eventId: 'evt-org',
      organizationId: ORG,
    });

    expect(inserts[0]![COL.organizationId]).toBe(ORG);
    expect(seenOrgAtInsert).toEqual([ORG]);
  });

  it('дано: позиционный набор аргументов корня → когда запись → тогда каждое значение стоит на своей позиции, а не на соседней', async () => {
    // N3 (D20_LEVEL2_REAUDIT.md) в редакции D17. Прежняя формулировка сверяла СПИСОК КОЛОНОК в
    // тексте `INSERT` с позициями в `VALUES`; после перевода записи на именованный корень списка
    // колонок в вызывающем коде нет вовсе — колонки живут в теле
    // `app.integrator_record_notification_delivery_attempt`, а вызывающий отвечает ровно за одно:
    // за ПОРЯДОК позиционных аргументов. Тот же операторский журнал начинает врать, если
    // `status` и `reason` (обе `text`) поменять местами в этом наборе.
    // АРБИТР: переставить в вызове `input.status` и `reason` — тест краснеет на полном наборе.
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
        calls.push({ text, params: params ?? [] });
        return { rows: [] as T[] };
      },
      async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
        return fn(db);
      },
    };

    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'telegram',
      status: 'failed',
      reason: 'provider_rejected',
      eventId: 'evt-col',
    });

    const { text, params } = calls[0]!;
    expect(text).toContain('app.integrator_record_notification_delivery_attempt');
    expect(params).toEqual([
      null,
      null,
      null,
      null,
      'telegram',
      'failed',
      'provider_rejected',
      null,
      'evt-col',
      null,
      null,
      null,
      '{}',
    ]);
    expect(params[COL.status]).toBe('failed');
    expect(params[COL.reason]).toBe('provider_rejected');
  });
});
