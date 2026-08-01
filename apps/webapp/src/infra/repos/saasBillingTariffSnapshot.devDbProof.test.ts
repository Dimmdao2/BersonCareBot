/**
 * §2.12 — executable proof, real DB, opt-in (never CI). Owner ruling 01.08, verbatim: «при оплате
 * тарифа все настройки оплаченного тарифа фиксируются на оплаченный период для конкретной клиники.
 * Не важно что меняется после - клиника уже оплатила и пока оплата не закончилась - имеет доступ к
 * оплаченному». These hit the REAL, migrated `app.resolve_organization_mechanic_access` door
 * (migration 0295_tariff_paid_period_snapshot_local.sql) and the real `assertStockQuotaAvailable`
 * (`stockQuotaCheck.ts`), not a mock:
 *
 *   1. editing the LIVE tariff mid-period does not take away what the clinic already paid for.
 *   2. round 2 (#1069 FAIL, migration 0296) — shrinking a LIVE tariff QUOTA mid-period does not
 *      reach the frozen limit either; the bug was numbers bypassing the freeze the doors already had.
 *   3. once the paid period ends, the clinic moves onto whatever the tariff looks like NOW.
 *
 * `saas_billing_subscriptions`/`be_organizations` are FORCE RLS with no policy for an ordinary
 * login (0259: "ambient app_staff receives no billing table privilege") and organization insert
 * fires a reference-catalog seed trigger that itself hits RLS under its own SECURITY DEFINER path —
 * so, same as `orgBrandRevisionGuard.devDb.integration.test.ts`, this fixture can only be built on a
 * superuser/BYPASSRLS connection:
 *
 *   USE_REAL_DATABASE=1 RUN_SAAS_BILLING_TARIFF_SNAPSHOT_DB=1 \
 *   DATABASE_URL=postgres://postgres:<password>@127.0.0.1:5432/bcb_webapp_dev \
 *   pnpm exec vitest run src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { getWebappSqlFromPgClient, type WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { assertStockQuotaAvailable } from '@/infra/repos/stockQuotaCheck';

const TARIFF = '7e510000-0000-4000-8000-0000002c1201';
const ORG = '7e510000-0000-4000-8000-0000002c1202';
const ACCOUNT = '7e510000-0000-4000-8000-0000002c1203';
const SUBSCRIPTION = '7e510000-0000-4000-8000-0000002c1204';

const enabled =
  process.env.RUN_SAAS_BILLING_TARIFF_SNAPSHOT_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim());

async function assertPrivilegedDevDb(db: WebappSqlExecutor): Promise<void> {
  const dbRow = await db.execute(sql`SELECT current_database() AS n`);
  const name = (dbRow.rows as { n: string }[])[0]?.n ?? '';
  if (!/_dev$/i.test(name) && name !== 'bcb_webapp_dev') {
    throw new Error(`refusing: current_database="${name}" — expected the dev DB.`);
  }
  const privRow = await db.execute(
    sql`SELECT (rolsuper OR rolbypassrls) AS ok FROM pg_roles WHERE rolname = current_user`,
  );
  if ((privRow.rows as { ok: boolean }[])[0]?.ok !== true) {
    throw new Error(
      'refusing: current_user is neither superuser nor BYPASSRLS — saas_billing_subscriptions/' +
        'be_organizations are FORCE RLS and organization insert fires a seeding trigger of its own, ' +
        'so this fixture cannot be created on an ordinary login.',
    );
  }
}

async function resolveCourses(db: WebappSqlExecutor) {
  const result = await db.execute(
    sql`SELECT state, mutation_allowed
        FROM app.resolve_organization_mechanic_access(${ORG}::uuid, 'courses')`,
  );
  const row = (result.rows as { state: string; mutation_allowed: boolean }[])[0];
  if (!row) throw new Error('resolve_organization_mechanic_access returned no row');
  return row;
}

describe.skipIf(!enabled)('§2.12 tariff paid-period snapshot (real DB, opt-in)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  let client: pg.PoolClient;
  let db: WebappSqlExecutor;

  async function cleanup(): Promise<void> {
    await db.execute(sql`DELETE FROM public.saas_billing_subscriptions WHERE id = ${SUBSCRIPTION}::uuid`);
    await db.execute(sql`DELETE FROM public.saas_billing_accounts WHERE id = ${ACCOUNT}::uuid`);
    await db.execute(sql`ALTER TABLE public.be_organizations DISABLE TRIGGER ALL`);
    await db.execute(sql`DELETE FROM public.be_organizations WHERE id = ${ORG}::uuid`);
    await db.execute(sql`ALTER TABLE public.be_organizations ENABLE TRIGGER ALL`);
    await db.execute(sql`DELETE FROM public.saas_tariffs WHERE id = ${TARIFF}::uuid`);
  }

  beforeAll(async () => {
    client = await pool.connect();
    db = getWebappSqlFromPgClient(client);
    await assertPrivilegedDevDb(db);
    await cleanup();

    // `resolve_organization_mechanic_access` reads its caller's org from `app.current_org_id()`,
    // which is backed by `app.principal_context` keyed on `pg_backend_pid()` — the same mechanism
    // a real staff request installs before calling this door. This connection keeps ONE backend for
    // the whole file (`pool.connect()` above, never released between queries), so installing it
    // once here is enough for every call below.
    await db.execute(
      sql`INSERT INTO app.principal_context (backend_pid, org_id, nonce, expires_epoch)
          VALUES (pg_backend_pid(), ${ORG}::uuid, 'saas-billing-tariff-snapshot-proof',
                  extract(epoch FROM clock_timestamp())::bigint + 600)`,
    );

    await db.execute(
      sql`INSERT INTO public.saas_tariffs (id, name, mechanics, quotas, billing_period, included_seats)
          VALUES (
            ${TARIFF}::uuid, 'Ч2.12 proof tariff', '{"courses": true}'::jsonb,
            '{"patient_count": {"kind": "numeric", "limit": 10}}'::jsonb, 'month', 5
          )`,
    );
    // Seeding trigger on organization insert hits RLS under its own SECURITY DEFINER path even for
    // a BYPASSRLS session (it runs as the trigger function's non-BYPASSRLS owner) — same obstacle
    // `orgBrandRevisionGuard.devDb.integration.test.ts` does not have to work around because it
    // never inserts an organization row itself.
    await db.execute(sql`ALTER TABLE public.be_organizations DISABLE TRIGGER ALL`);
    await db.execute(
      sql`INSERT INTO public.be_organizations (id, title, tariff_id, is_active)
          VALUES (${ORG}::uuid, 'Ч2.12 proof clinic', ${TARIFF}::uuid, true)`,
    );
    await db.execute(sql`ALTER TABLE public.be_organizations ENABLE TRIGGER ALL`);
    await db.execute(
      sql`INSERT INTO public.saas_billing_accounts (id, organization_id)
          VALUES (${ACCOUNT}::uuid, ${ORG}::uuid)`,
    );
    // A live paid period, snapshot taken from the tariff as it is RIGHT NOW — exactly what
    // `activateSaasBillingSubscriptionPeriod`/`setManualSaasBillingSubscription` do in application
    // code (`pgSaasBilling.ts`).
    await db.execute(
      sql`INSERT INTO public.saas_billing_subscriptions
            (id, organization_id, saas_billing_account_id, tariff_id, source, status, lifecycle_state,
             current_period_starts_at, current_period_ends_at, tariff_snapshot)
          VALUES
            (${SUBSCRIPTION}::uuid, ${ORG}::uuid, ${ACCOUNT}::uuid, ${TARIFF}::uuid,
             'paid_subscription', 'active', 'active', now() - interval '1 day', now() + interval '29 days',
             (SELECT to_jsonb(t) FROM public.saas_tariffs AS t WHERE t.id = ${TARIFF}::uuid))`,
    );
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid()`);
    await cleanup();
    client.release();
    await pool.end();
  });

  it('an operator disabling the mechanic on the LIVE tariff mid-period does not take it from a clinic that already paid for it', async () => {
    expect(await resolveCourses(db)).toMatchObject({ state: 'full_access', mutation_allowed: true });

    await db.execute(
      sql`UPDATE public.saas_tariffs
          SET mechanics = '{"courses": false}'::jsonb
          WHERE id = ${TARIFF}::uuid`,
    );

    expect(await resolveCourses(db)).toMatchObject({ state: 'full_access', mutation_allowed: true });
  });

  it('§2.12 round 2 — shrinking the LIVE tariff quota mid-period does not reach the frozen limit (stockQuotaCheck.ts)', async () => {
    // Frozen snapshot still says limit 10 — 9 used + 1 more fits.
    await expect(
      assertStockQuotaAvailable(db, ORG, 'patient_count', async () => 9),
    ).resolves.toBeUndefined();

    await db.execute(
      sql`UPDATE public.saas_tariffs
          SET quotas = '{"patient_count": {"kind": "numeric", "limit": 3}}'::jsonb
          WHERE id = ${TARIFF}::uuid`,
    );

    // Before the round-2 fix this read the LIVE tariff (limit 3) and threw here; the frozen
    // snapshot still says 10, so 9 used + 1 more still fits for the rest of the paid period.
    await expect(
      assertStockQuotaAvailable(db, ORG, 'patient_count', async () => 9),
    ).resolves.toBeUndefined();
  });

  it('once the paid period ends, the clinic moves onto whatever the tariff looks like now', async () => {
    // The previous test already turned the live tariff's `courses` mechanic off; the paid period
    // ending is what makes that edit finally reach this clinic.
    await db.execute(
      sql`UPDATE public.saas_billing_subscriptions
          SET status = 'expired', current_period_ends_at = now() - interval '1 minute'
          WHERE id = ${SUBSCRIPTION}::uuid`,
    );

    expect(await resolveCourses(db)).toMatchObject({ state: 'disabled', mutation_allowed: false });
  });
});
