/**
 * L-8 — владелец клиники не мог ни сменить тариф, ни выставить счёт: обе записи падали с 42501.
 *
 * Причина — не «мало прав вообще», а РАСХОЖДЕНИЕ ДВУХ ИСПОЛНЯЕМЫХ КОНТРАКТОВ. Drizzle в INSERT
 * именует КАЖДУЮ колонку таблицы, включая те, что уходят как `default`; PostgreSQL проверяет
 * привилегию на каждую НАЗВАННУЮ колонку. Поэтому колоночный грант, суженный до «что мы реально
 * пишем», отказывает, хотя выглядит достаточным.
 *
 * Тест сравнивает ровно эти два исполняемых артефакта и ничего больше:
 *   слева  — SQL, который drizzle СОБИРАЕТ для двух живых write-путей `pgSaasBilling.ts`
 *            (`appendManualAssignmentAudit` и `insertSaasBillingInvoiceIdempotent`);
 *   справа — SQL, который деплой ПРИМЕНЯЕТ к базе (`deploy/postgres/generated/privileges.*.sql`,
 *            он же предмет ассерта reconcile-access `--check`).
 *
 * Он краснеет, если: у таблицы появилась колонка, а грант не расширили; грант сузили; drizzle
 * сменил форму INSERT; из декларации пропала стена клиники на журнале. Ни одна из этих поломок
 * не видна ни типами, ни моками — только живым отказом движка, который и стоил владельцу L-8.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { adminAuditLog } from '../../../db/schema/schema';
import { saasBillingInvoices } from '../../../db/schema/saasBilling';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const MANAGED_DATABASES = ['bcb_webapp_dev', 'bersoncarebot_test'] as const;
const CLINIC_BILLING_ROLE = 'app_clinic_billing';

/** Никакого соединения: `.toSQL()` собирает тот же текст, что уходит в движок в проде. */
const db = drizzle({ client: { query: async () => ({ rows: [] }) } as never });

function insertedColumns(sql: string): string[] {
  const match = /^insert into "[^"]+" \(([^)]+)\)/u.exec(sql);
  if (!match) throw new Error(`не разобрал INSERT: ${sql.slice(0, 120)}`);
  return match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
}

function deployedSql(database: (typeof MANAGED_DATABASES)[number]): string {
  return readFileSync(
    resolve(REPO_ROOT, `deploy/postgres/generated/privileges.${database}.sql`),
    'utf8',
  );
}

function grantedColumns(
  artifact: string,
  table: string,
  operation: 'INSERT' | 'SELECT' | 'UPDATE',
): string[] | null {
  const pattern = new RegExp(
    `^GRANT ${operation} \\(([^)]+)\\) ON TABLE "public"\\."${table}" TO "${CLINIC_BILLING_ROLE}";$`,
    'mu',
  );
  const match = pattern.exec(artifact);
  if (!match) return null;
  return match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
}

function tableWideGrants(artifact: string, table: string): string[] {
  const pattern = new RegExp(
    `^GRANT ([A-Z, ]+) ON TABLE "public"\\."${table}" TO "${CLINIC_BILLING_ROLE}";$`,
    'gmu',
  );
  return [...artifact.matchAll(pattern)].flatMap((match) =>
    match[1].split(',').map((operation) => operation.trim()),
  );
}

/** Ровно те значения, что кладут два живых write-пути `pgSaasBilling.ts`. */
const auditInsertSql = db
  .insert(adminAuditLog)
  .values({
    organizationId: '00000000-0000-4000-8000-000000000001',
    actorId: '00000000-0000-4000-8000-000000000002',
    action: 'saas_tariff_downgrade_scheduled',
    targetId: '00000000-0000-4000-8000-000000000001',
    details: { reason: 'clinic_tariff_downgrade_scheduled' },
    status: 'ok',
  })
  .toSQL().sql;

const invoiceInsertSql = db
  .insert(saasBillingInvoices)
  .values({
    organizationId: '00000000-0000-4000-8000-000000000001',
    saasBillingAccountId: '00000000-0000-4000-8000-000000000003',
    saasBillingSubscriptionId: '00000000-0000-4000-8000-000000000004',
    tariffId: '00000000-0000-4000-8000-000000000005',
    tariffName: 'СТАРТ',
    invoiceKind: 'tariff_period',
    additionalSeatQuantity: 0,
    amountMinor: 80000,
    currency: 'RUB',
    tariffBillingPeriod: 'month',
    tariffSnapshot: {},
    servicePeriodStartsAt: '2026-08-18T00:00:00.000Z',
    servicePeriodEndsAt: '2026-09-18T00:00:00.000Z',
    status: 'draft',
    providerId: 'yookassa',
    providerIdempotencyKey: 'saas_tariff_renewal:test',
  })
  .onConflictDoNothing({
    target: [saasBillingInvoices.providerId, saasBillingInvoices.providerIdempotencyKey],
  })
  .toSQL().sql;

describe('clinic-billing write surface: drizzle INSERT ⊆ гранты, которые ставит деплой', () => {
  it('drizzle именует и DEFAULT-колонки — иначе объяснение отказа было бы другим', () => {
    expect(insertedColumns(auditInsertSql)).toContain('conflict_key');
    expect(insertedColumns(invoiceInsertSql)).toContain('paid_at');
    expect(auditInsertSql).toContain('default');
    expect(invoiceInsertSql).toContain('default');
  });

  for (const database of MANAGED_DATABASES) {
    const artifact = deployedSql(database);

    it(`${database}: смена тарифа пишет в admin_audit_log только названные разрешённые колонки`, () => {
      const granted = grantedColumns(artifact, 'admin_audit_log', 'INSERT');
      expect(granted, `нет GRANT INSERT на admin_audit_log для ${CLINIC_BILLING_ROLE}`).not.toBeNull();
      for (const column of insertedColumns(auditInsertSql)) {
        expect(granted, `admin_audit_log.${column}`).toContain(column);
      }
    });

    it(`${database}: выставление счёта пишет в saas_billing_invoices только названные разрешённые колонки`, () => {
      const granted = grantedColumns(artifact, 'saas_billing_invoices', 'INSERT');
      expect(granted, `нет GRANT INSERT на saas_billing_invoices для ${CLINIC_BILLING_ROLE}`).not.toBeNull();
      for (const column of insertedColumns(invoiceInsertSql)) {
        expect(granted, `saas_billing_invoices.${column}`).toContain(column);
      }
    });

    it(`${database}: журнал остаётся на запись — арендатор его не читает и не правит`, () => {
      expect(grantedColumns(artifact, 'admin_audit_log', 'SELECT')).toBeNull();
      expect(grantedColumns(artifact, 'admin_audit_log', 'UPDATE')).toBeNull();
      expect(tableWideGrants(artifact, 'admin_audit_log')).toEqual([]);
    });

    it(`${database}: строка журнала заперта на организацию текущего принципала`, () => {
      const policy =
        /^CREATE POLICY "rev10_admin_audit_clinic_insert_\d+" ON "public"\."admin_audit_log" AS PERMISSIVE FOR INSERT TO "app_clinic_billing" WITH CHECK \((.+)\);$/mu.exec(
          artifact,
        );
      expect(policy, 'нет стены клиники на INSERT в admin_audit_log').not.toBeNull();
      expect(policy?.[1]).toContain('organization_id = (SELECT app.current_org_id())');
      expect(policy?.[1]).toContain("current_user = 'app_clinic_billing'::name");
    });
  }
});
