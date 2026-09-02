import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  runWithDbInfraPrincipal: vi.fn(async (_principal, run: () => Promise<unknown>) => run()),
  drizzle: { select: vi.fn(), insert: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  runWithDbInfraPrincipal: fakes.runWithDbInfraPrincipal,
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { createPgStaffUsersPort } from '@/infra/repos/pgStaffUsers';
import { createPgGlobalAdminWebPushRecipientsPort } from '@/infra/repos/pgGlobalAdminWebPushRecipients';
import { createPgSaasBillingRepository } from '@/infra/repos/pgSaasBilling';
import { pgOperatorHealthWritePort } from '@/infra/repos/pgOperatorHealthWrite';
import { CRITICAL_ALERT_CADENCE_INTEGRATION } from '@/modules/operator-health/ports';

beforeEach(() => {
  vi.clearAllMocks();
});

it('операторский алерт находит, кому слать веб-пуш, а не молчит на отказе таблицы', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [
      {
        recipients: [
          { userId: 'user-doctor', organizationId: 'org-1' },
          { userId: 'user-admin', organizationId: 'org-2' },
        ],
      },
    ],
  });

  const recipients = await createPgStaffUsersPort().listActiveStaffOrganizationRecipients?.();

  expect(recipients).toEqual([
    { userId: 'user-doctor', organizationId: 'org-1' },
    { userId: 'user-admin', organizationId: 'org-2' },
  ]);
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.list_operator_web_push_recipients(text)',
    ['staff'],
  ]);
  // Прямое чтение `be_organization_members` здесь — это 42501 под `app_worker`, отказ гасится
  // `.catch` диспетчера, и канал веб-пуша молча не срабатывает, пока тик пишет `success`.
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('никого не нашлось — это пустая аудитория, а не выдуманный получатель', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ recipients: [] }] });

  await expect(createPgStaffUsersPort().listActiveStaffOrganizationRecipients?.()).resolves.toEqual(
    [],
  );
});

it('суточная сводка получает готовых к веб-пушу глобальных администраторов через узкий корень', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [{ recipients: [{ userId: 'global-admin', organizationId: null }] }],
  });

  await expect(
    createPgGlobalAdminWebPushRecipientsPort().listEligibleGlobalAdminUserIds(),
  ).resolves.toEqual(['global-admin']);
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.list_operator_web_push_recipients(text)',
    ['global_admin'],
  ]);
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('успех и ошибка фоновой задачи проходят через один рабочий контекст записи статуса', async () => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  fakes.drizzle.transaction.mockImplementation(async (run) => run({ insert }));

  await pgOperatorHealthWritePort.recordOperatorJobTickSuccess({
    jobFamily: 'health',
    jobKey: 'health.test',
    startedAtIso: '2026-08-28T00:00:00.000Z',
    durationMs: 1,
    metaJson: {},
  });
  await pgOperatorHealthWritePort.recordOperatorJobTickFailure({
    jobFamily: 'health',
    jobKey: 'health.test',
    startedAtIso: '2026-08-28T00:00:00.000Z',
    durationMs: 2,
    error: 'probe failed',
    metaJson: {},
  });

  expect(fakes.runWithDbInfraPrincipal).toHaveBeenCalledTimes(2);
  expect(fakes.runWithDbInfraPrincipal).toHaveBeenNthCalledWith(
    1,
    { source: 'operator-cron-job-status:write' },
    expect.any(Function),
  );
  expect(fakes.runWithDbInfraPrincipal).toHaveBeenNthCalledWith(
    2,
    { source: 'operator-cron-job-status:write' },
    expect.any(Function),
  );
  expect(insert).toHaveBeenCalledTimes(2);
});

it('тик продления видит подписку, у которой кончился оплаченный период', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [
      {
        due: [
          {
            saasBillingSubscriptionId: 'sub-1',
            organizationId: 'org-1',
            tariffId: 'tariff-pending',
            pendingTariffId: 'tariff-pending',
            currentPeriodEndsAt: '2026-08-19T07:00:00.000Z',
            savedPaymentMethodId: 'pm-1',
            autopayConsentedAt: '2026-08-01T07:00:00.000Z',
            autopayRevokedAt: null,
            billingPeriod: 'month',
          },
        ],
      },
    ],
  });

  const due = await createPgSaasBillingRepository().listSaasBillingSubscriptionsDueForRenewal({
    asOf: '2026-08-19T08:00:00.000Z',
    limit: 50,
  });

  expect(due).toEqual([
    {
      saasBillingSubscriptionId: 'sub-1',
      organizationId: 'org-1',
      // Правило «за какой тариф платят» одно: запланированный тариф вытесняет текущий.
      tariffId: 'tariff-pending',
      pendingTariffId: 'tariff-pending',
      billingPeriod: 'month',
      currentPeriodEndsAt: '2026-08-19T07:00:00.000Z',
      savedPaymentMethodId: 'pm-1',
      autopayConsentedAt: '2026-08-01T07:00:00.000Z',
      autopayRevokedAt: null,
    },
  ]);
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)',
    ['2026-08-19T08:00:00.000Z', 50],
  ]);
  // Прямое чтение подписок здесь — межарендный запрос под `app_worker`: RLS сузила бы его до
  // `app.current_org_id()`, которого у машинного тика нет вовсе.
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('замеченный критический сбой открывает инцидент, который человек увидит на панели здоровья', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [{ incident: { id: 'incident-1', openedAt: '2026-08-19T08:37:00+00:00' } }],
  });

  const opened = await pgOperatorHealthWritePort.openOrTouchCriticalAlertIncident({
    dedupKey: 'tenant_isolation',
    direction: 'tenant_isolation',
    integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
    nowIso: '2026-08-19T08:37:00.000Z',
    errorDetail: 'канарейка изоляции арендаторов молчит',
  });

  // Строка инцидента — это то, что человек открывает на /app/admin/system-health, и то, по чему
  // каденция считает T0 -> +1ч. Без `id` и `openedAt` тик не заметил бы, что записи не появилось.
  expect(opened).toEqual({ id: 'incident-1', openedAt: '2026-08-19T08:37:00.000Z' });
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.open_or_touch_operator_critical_incident(text,text,text,timestamp with time zone,text)',
    [
      'tenant_isolation',
      'tenant_isolation',
      CRITICAL_ALERT_CADENCE_INTEGRATION,
      '2026-08-19T08:37:00.000Z',
      'канарейка изоляции арендаторов молчит',
    ],
  ]);
  // Прямая вставка отношением здесь — это 42501 под `app_worker`: drizzle перечисляет ВСЕ колонки
  // таблицы, а рабочей роли выданы не все, и тик падает целиком ровно тогда, когда что-то заметил.
  expect(fakes.drizzle.insert).not.toHaveBeenCalled();
});

it('дверь ответила без строки инцидента — это отказ, а не открытый инцидент', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ incident: null }] });

  await expect(
    pgOperatorHealthWritePort.openOrTouchCriticalAlertIncident({
      dedupKey: 'webapp_db_down',
      direction: 'webapp_db',
      integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
      nowIso: '2026-08-19T08:37:00.000Z',
    }),
  ).rejects.toThrow('operator_critical_incident_open_invalid');
});
