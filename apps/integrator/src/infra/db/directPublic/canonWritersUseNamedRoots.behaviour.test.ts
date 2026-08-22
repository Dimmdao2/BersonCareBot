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
import {
  getCurrentDatabasePrincipal,
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';
import {
  integratorPortContextPrincipal,
  runWithIntegratorPortOperation,
  type IntegratorPortCapabilityDescriptor,
} from '../portContextRuntime.js';
import { writeDirectPublic } from './writePort.js';
import { upsertReminderRuleDirect } from './writeReminderRulesDirect.js';
import {
  appendReminderDeliveryEventDirect,
  upsertContentAccessGrantDirect,
} from './writeReminderProjectionDirect.js';
import { appendSupportDeliveryEventDirect } from './writeSupportQuestionsDirect.js';
import { recordNotificationDeliveryAttemptBestEffort } from '../repos/notificationDeliveryAttempts.js';

const ORG_ROW = 'a0000000-0000-4000-8000-0000000000a1';
const ORG_OTHER = 'b0000000-0000-4000-8000-0000000000b2';
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

function reminderRuleInput(resolvedOrganizationId: string) {
  return {
    integratorUserId: '42',
    integratorRuleId: 'rule-d17',
    category: 'custom',
    isEnabled: true,
    scheduleType: 'daily',
    timezone: 'Europe/Moscow',
    intervalMinutes: 60,
    windowStartMinute: 540,
    windowEndMinute: 1200,
    daysMask: '1111111',
    contentMode: 'text',
    linkedObjectType: null,
    linkedObjectId: null,
    customTitle: null,
    customText: 'пора на разминку',
    scheduleData: { kind: 'daily' },
    reminderIntent: null,
    quietHoursStartMinute: null,
    quietHoursEndMinute: null,
    notificationTopicCode: undefined,
    resolvedPlatformUserId: PLATFORM_USER,
    resolvedOrganizationId,
  };
}

describe('D17 — правило напоминаний', () => {
  it('уходит одним именованным корнем под организационным принципалом живого маршрута', async () => {
    const { db, executed } = recordingDb({ updated_at: '2026-08-22T10:00:00+00:00' });

    const result = await runWithOrganizationPrincipal(ORG_ROW, () =>
      writeDirectPublic('reminder-rule-upsert', () =>
        upsertReminderRuleDirect(db, reminderRuleInput(ORG_ROW)),
      ),
    );

    const call = expectOnlyNamedRoot(executed, 'app.integrator_upsert_reminder_rule', 'reminder_rules');
    expect(call.principalKind).toBe('organization');
    expect(call.principalOrganizationId).toBe(ORG_ROW);
    expect(call.params.slice(0, 6)).toEqual([
      'rule-d17',
      PLATFORM_USER,
      ORG_ROW,
      '42',
      'custom',
      true,
    ]);
    // Последние два аргумента несут «код темы не передан → сохранить прежний», а не «очистить».
    expect(call.params.slice(-2)).toEqual([null, false]);
    expect(result).toEqual({
      platformUserId: PLATFORM_USER,
      organizationId: ORG_ROW,
      updatedAt: '2026-08-22T10:00:00+00:00',
    });
  });

  it('чужой организации не достаётся: корень получает организацию СТРОКИ, а не принятый контекст', async () => {
    const { db, executed } = recordingDb({ updated_at: '2026-08-22T10:00:00+00:00' });

    await runWithOrganizationPrincipal(ORG_OTHER, () =>
      writeDirectPublic('reminder-rule-upsert', () =>
        upsertReminderRuleDirect(db, reminderRuleInput(ORG_ROW)),
      ),
    );

    const call = executed[0]!;
    expect(call.params[2]).toBe(ORG_ROW);
    expect(call.principalOrganizationId).toBe(ORG_OTHER);
    // Ровно это расхождение корень и отвергает (`p_organization_id IS DISTINCT FROM
    // app.current_org_id()` → 42501). Если бы писатель подставил принятый контекст, строка чужой
    // клиники приземлилась бы под видом своей.
    expect(call.params[2]).not.toBe(call.principalOrganizationId);
  });
});

describe('D17 — событие доставки напоминания и доступ к контенту', () => {
  it('оба уходят корнями под инфра-принципалом воркера повторов, без транзакции отношений', async () => {
    const { db, executed } = recordingDb();

    await runWithInfraPrincipal(
      { source: 'worker:direct-public-write-retry-tick', portCapability: 'delivery' },
      async () => {
        await writeDirectPublic('reminder-delivery-append', () =>
          appendReminderDeliveryEventDirect(db, {
            organizationId: ORG_ROW,
            integratorDeliveryLogId: 'log-1',
            integratorOccurrenceId: 'occ-1',
            integratorRuleId: 'rule-d17',
            integratorUserId: '42',
            channel: 'telegram',
            status: 'success',
            errorCode: null,
            payloadJson: { chatId: '777' },
            createdAt: OCCURRED_AT,
          }),
        );
      },
    );

    const call = expectOnlyNamedRoot(
      executed,
      'app.integrator_append_reminder_delivery_event',
      'reminder_delivery_events',
    );
    expect(call.principalKind).toBe('infra');
    expect(call.params).toEqual([
      ORG_ROW,
      'log-1',
      'occ-1',
      'rule-d17',
      '42',
      'telegram',
      'success',
      null,
      '{"chatId":"777"}',
      OCCURRED_AT,
    ]);
  });

  it('доступ к контенту уходит корнем и несёт организацию строки', async () => {
    const { db, executed } = recordingDb();

    await runWithInfraPrincipal(
      { source: 'worker:direct-public-write-retry-tick', portCapability: 'delivery' },
      () =>
        writeDirectPublic('content-access-grant-upsert', () =>
          upsertContentAccessGrantDirect(db, {
            organizationId: ORG_ROW,
            integratorGrantId: 'grant-1',
            integratorUserId: '42',
            platformUserId: PLATFORM_USER,
            contentId: 'content-1',
            purpose: 'lfk',
            tokenHash: null,
            expiresAt: OCCURRED_AT,
            revokedAt: null,
            metaJson: {},
            createdAt: OCCURRED_AT,
          }),
        ),
    );

    const call = expectOnlyNamedRoot(
      executed,
      'app.integrator_upsert_content_access_grant',
      'content_access_grants_webapp',
    );
    expect(call.principalKind).toBe('infra');
    expect(call.params[0]).toBe(ORG_ROW);
    expect(call.params[2]).toBe(PLATFORM_USER);
  });
});

describe('D17 — событие доставки поддержки', () => {
  it('переиспользует уже существующий корень канона поддержки, второй двери не заводит', async () => {
    const { db, executed } = recordingDb({ payload: { ok: true, id: 'evt-1', created: true } });

    const result = await writeDirectPublic(
      'support-delivery-append',
      () =>
        appendSupportDeliveryEventDirect(db, {
          organizationId: ORG_ROW,
          conversationMessageId: null,
          integratorIntentEventId: 'intent-1',
          correlationId: 'corr-1',
          channelCode: 'telegram',
          status: 'success',
          attempt: 1,
          reason: null,
          payloadJson: { text: 'ок' },
          occurredAt: OCCURRED_AT,
        }),
      { organizationId: ORG_ROW },
    );

    const call = expectOnlyNamedRoot(
      executed,
      'app.record_integrator_support_delivery_attempt',
      'support_delivery_events',
    );
    expect(call.principalKind).toBe('organization');
    expect(call.principalOrganizationId).toBe(ORG_ROW);
    expect(call.params).toEqual([
      ORG_ROW,
      'intent-1',
      'corr-1',
      'telegram',
      'success',
      1,
      null,
      '{"text":"ок"}',
      OCCURRED_AT,
    ]);
    expect(result).toEqual({ id: 'evt-1' });
  });

  it('отказ корня по организации снова становится ошибкой, то есть долговечным повтором', async () => {
    const { db } = recordingDb({
      payload: { ok: false, code: 'organization_context_required' },
    });

    await expect(
      writeDirectPublic(
        'support-delivery-append',
        () =>
          appendSupportDeliveryEventDirect(db, {
            organizationId: ORG_ROW,
            conversationMessageId: null,
            integratorIntentEventId: 'intent-2',
            correlationId: null,
            channelCode: 'telegram',
            status: 'failed',
            attempt: 2,
            reason: 'provider_rejected',
            payloadJson: {},
            occurredAt: OCCURRED_AT,
          }),
        { organizationId: ORG_ROW },
      ),
    ).rejects.toThrow('organization_context_required');
  });
});

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
        status: 'skipped',
        reason: 'no_provider_outcome',
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

describe('D17 — выбор возможности под корень', () => {
  const ROOT = 'app.integrator_upsert_reminder_rule(text)';
  const tenantCapability: IntegratorPortCapabilityDescriptor = {
    capabilityId: '00000000-0000-4000-8000-000000000901',
    targetRole: 'app_tenant_service',
    contextClass: 'tenant_service',
    purpose: 'integrator.reminder-rule.upsert',
    functionIdentity: ROOT,
  };
  const caps = { tenantCapability };

  it('корень tenant-класса выбирается организационным принципалом', () => {
    const selected = runWithIntegratorPortOperation({ functionIdentity: ROOT, typedArgs: [] }, () =>
      integratorPortContextPrincipal({ kind: 'organization', organizationId: ORG_ROW }, caps),
    );
    expect(selected).toMatchObject({
      targetRole: 'app_tenant_service',
      contextClass: 'tenant_service',
      organizationId: ORG_ROW,
    });
  });

  it('и не выбирается никаким другим видом принципала — корень остаётся недостижим', () => {
    expect(() =>
      runWithIntegratorPortOperation({ functionIdentity: ROOT, typedArgs: [] }, () =>
        integratorPortContextPrincipal(
          { kind: 'infra', source: 'worker:outgoing-delivery-tick' },
          caps,
        ),
      ),
    ).toThrow(/Missing unique declared integrator port capability/);
  });
});
