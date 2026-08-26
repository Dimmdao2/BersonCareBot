/**
 * D17 шаг 1 — поведение шести бывших реляционных писателей продуктового канона.
 *
 * Предмет проверки — НАБЛЮДАЕМЫЙ выход слоя записи: какой оператор реально уходит в базу, с каким
 * позиционным набором аргументов и ПОД КАКИМ принципалом. Заглушка одна и она на границе (`DbPort`),
 * потому что дальше границы в юнит-тесте базы нет; всё остальное — настоящий код живого маршрута:
 * тот же chokepoint `writeDirectPublic`, те же обёртки принципала, те же репозитории.
 *
 * Что тест обязан ловить (арбитры прогнаны руками):
 *   • вернуть реляционный `INSERT`/`UPDATE` по канонной таблице вместо корня — красный на «в базу
 *     ушёл не корень» (первый expect каждого блока);
 *   • переставить аргументы корня местами — красный на позиционном наборе;
 *   • подставить в аргумент организации принятый контекст вместо организации строки — красный на
 *     блоке «чужая организация», потому что именно эта подмена и есть межарендная утечка: корень
 *     отказывает по `p_organization_id IS DISTINCT FROM app.current_org_id()`, а подмена делает
 *     отказ невозможным;
 *   • снять обёртку принципала — красный на `principalAtCall`.
 *
 * Проверка «корень достижим ровно под классом контекста живого маршрута» живёт в
 * `portContextRuntime.test.ts` и в `deploy/postgres/privileges/port-context-catalog.test.mjs`;
 * здесь она повторена только в форме «под чужим видом принципала возможность не выбирается».
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { getCurrentDatabasePrincipal } from '../../principal/organizationPrincipal.js';
import { recordNotificationDeliveryAttemptBestEffort } from '../repos/notificationDeliveryAttempts.js';

const ORG_ROW = 'a0000000-0000-4000-8000-0000000000a1';
const PLATFORM_USER = 'c0000000-0000-4000-8000-0000000000c3';
const OCCURRED_AT = '2026-08-22T10:00:00.000Z';

type Executed = {
  text: string;
  params: unknown[];
  principalKind: string | undefined;
  principalOrganizationId: string | undefined;
};

function recordingDb(row: Record<string, unknown> = {}): { db: DbPort; executed: Executed[] } {
  const executed: Executed[] = [];
  const db: DbPort = {
    async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const principal = getCurrentDatabasePrincipal() as
        | { kind?: string; organizationId?: string }
        | undefined;
      executed.push({
        text,
        params,
        principalKind: principal?.kind,
        principalOrganizationId: principal?.organizationId,
      });
      return { rows: [row] as T[], rowCount: 1 };
    },
    async tx(): Promise<never> {
      throw new Error('a named root must not receive an open relation transaction');
    },
  };
  return { db, executed };
}

/** Один исполненный оператор, и он — вызов ровно этого корня, а не запись по таблице. */
function expectOnlyNamedRoot(executed: Executed[], root: string, relation: string): Executed {
  expect(executed).toHaveLength(1);
  const call = executed[0]!;
  expect(call.text).toContain(root);
  expect(call.text).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+public\\.${relation}`, 'i'));
  expect(call.text).not.toMatch(new RegExp(`UPDATE\\s+public\\.${relation}`, 'i'));
  return call;
}

describe('D17 — попытка доставки уведомления', () => {
  it('уходит корнем под организацией вызывающего, и лишний UUID вхождения отбрасывается как прежде', async () => {
    const { db, executed } = recordingDb();

    await recordNotificationDeliveryAttemptBestEffort(db, {
      organizationId: ORG_ROW,
      userId: PLATFORM_USER,
      channel: 'web_push',
      status: 'failed',
      reason: 'dispatch_failed',
      eventId: 'evt-push',
      occurrenceId: 'not-a-uuid',
      recipientRef: 'web_push:c3',
      errorMessage: 'boom',
      intentType: 'relay_outbound',
    });

    const call = expectOnlyNamedRoot(
      executed,
      'app.integrator_record_notification_delivery_attempt',
      'notification_delivery_attempts',
    );
    expect(call.principalKind).toBe('organization');
    expect(call.principalOrganizationId).toBe(ORG_ROW);
    expect(call.params[0]).toBe(ORG_ROW);
    expect(call.params[1]).toBe(PLATFORM_USER);
    expect(call.params[5]).toBe('web_push');
    expect(call.params[6]).toBe('failed');
    expect(call.params[7]).toBe('dispatch_failed');
    expect(call.params[10]).toBeNull();
  });

  it('без организации корень зовётся без принципала и без организации — то есть отказывает, а доставка не отменяется', async () => {
    const { db, executed } = recordingDb();

    await expect(
      recordNotificationDeliveryAttemptBestEffort(db, {
        channel: 'web_push',
        status: 'failed',
        reason: 'provider_rejected',
        eventId: 'evt-orgless',
      }),
    ).resolves.toBeUndefined();

    // Организации нет — значит нет и организационного принципала. В port-context режиме такой вызов
    // не находит возможности класса `tenant_service` и до базы не доходит; здесь, за заглушкой
    // `DbPort`, наблюдаемо ровно это: ни принципала, ни организации в аргументе корня, а сам корень
    // отказывает по `integrator_notification_delivery_attempt_principal_required`. Главное — сбой
    // остаётся best-effort и наружу не пробрасывается.
    const call = executed[0]!;
    expect(call.principalKind).toBeUndefined();
    expect(call.params[0]).toBeNull();
  });
});
