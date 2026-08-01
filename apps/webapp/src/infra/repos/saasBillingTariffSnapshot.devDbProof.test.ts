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
import pg from 'pg';
import { getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';
import { assertStockQuotaAvailable } from '@/infra/repos/stockQuotaCheck';

const TARIFF = '7e510000-0000-4000-8000-0000002c1201';
const ORG = '7e510000-0000-4000-8000-0000002c1202';
const ACCOUNT = '7e510000-0000-4000-8000-0000002c1203';
const SUBSCRIPTION = '7e510000-0000-4000-8000-0000002c1204';

const enabled =
  process.env.RUN_SAAS_BILLING_TARIFF_SNAPSHOT_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim());

async function assertPrivilegedDevDb(client: pg.PoolClient): Promise<void> {
  const dbRow = await client.query<{ n: string }>('SELECT current_database() AS n');
  const name = dbRow.rows[0]?.n ?? '';
  if (!/_dev$/i.test(name) && name !== 'bcb_webapp_dev') {
    throw new Error(`refusing: current_database="${name}" — expected the dev DB.`);
  }
  const privRow = await client.query<{ ok: boolean }>(
    'SELECT (rolsuper OR rolbypassrls) AS ok FROM pg_roles WHERE rolname = current_user',
  );
  if (privRow.rows[0]?.ok !== true) {
    throw new Error(
      'refusing: current_user is neither superuser nor BYPASSRLS — saas_billing_subscriptions/' +
        'be_organizations are FORCE RLS and organization insert fires a seeding trigger of its own, ' +
        'so this fixture cannot be created on an ordinary login.',
    );
  }
}

async function resolveCourses(client: pg.PoolClient) {
  const result = await client.query<{ state: string; mutation_allowed: boolean }>(
    `SELECT state, mutation_allowed FROM app.resolve_organization_mechanic_access($1::uuid, 'courses')`,
    [ORG],
  );
  const row = result.rows[0];
  if (!row) throw new Error('resolve_organization_mechanic_access returned no row');
  return row;
}

describe.skipIf(!enabled)('§2.12 tariff paid-period snapshot (real DB, opt-in)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  let client: pg.PoolClient;

  async function cleanup(): Promise<void> {
    await client.query('DELETE FROM public.saas_billing_subscriptions WHERE id = $1::uuid', [
      SUBSCRIPTION,
    ]);
    await client.query('DELETE FROM public.saas_billing_accounts WHERE id = $1::uuid', [ACCOUNT]);
    await client.query('ALTER TABLE public.be_organizations DISABLE TRIGGER ALL');
    await client.query('DELETE FROM public.be_organizations WHERE id = $1::uuid', [ORG]);
    await client.query('ALTER TABLE public.be_organizations ENABLE TRIGGER ALL');
    await client.query('DELETE FROM public.saas_tariffs WHERE id = $1::uuid', [TARIFF]);
  }

  beforeAll(async () => {
    client = await pool.connect();
    await assertPrivilegedDevDb(client);
    await cleanup();

    // `resolve_organization_mechanic_access` reads its caller's org from `app.current_org_id()`,
    // which is backed by `app.principal_context` keyed on `pg_backend_pid()` — the same mechanism
    // a real staff request installs before calling this door. This connection keeps ONE backend for
    // the whole file (`pool.connect()` above, never released between queries), so installing it
    // once here is enough for every call below.
    await client.query(
      `INSERT INTO app.principal_context (backend_pid, org_id, nonce, expires_epoch)
       VALUES (pg_backend_pid(), $1::uuid, 'saas-billing-tariff-snapshot-proof',
               extract(epoch FROM clock_timestamp())::bigint + 600)`,
      [ORG],
    );

    await client.query(
      `INSERT INTO public.saas_tariffs (id, name, mechanics, quotas, billing_period, included_seats)
       VALUES (
         $1::uuid, 'Ч2.12 proof tariff', '{"courses": true}'::jsonb,
         '{"patient_count": {"kind": "numeric", "limit": 10}}'::jsonb, 'month', 5
       )`,
      [TARIFF],
    );
    // Seeding trigger on organization insert hits RLS under its own SECURITY DEFINER path even for
    // a BYPASSRLS session (it runs as the trigger function's non-BYPASSRLS owner) — same obstacle
    // `orgBrandRevisionGuard.devDb.integration.test.ts` does not have to work around because it
    // never inserts an organization row itself.
    await client.query('ALTER TABLE public.be_organizations DISABLE TRIGGER ALL');
    await client.query(
      `INSERT INTO public.be_organizations (id, title, tariff_id, commercial_access_state, is_active)
       VALUES ($1::uuid, 'Ч2.12 proof clinic', $2::uuid, 'active', true)`,
      [ORG, TARIFF],
    );
    await client.query('ALTER TABLE public.be_organizations ENABLE TRIGGER ALL');
    await client.query(
      `INSERT INTO public.saas_billing_accounts (id, organization_id) VALUES ($1::uuid, $2::uuid)`,
      [ACCOUNT, ORG],
    );
    // A live paid period, snapshot taken from the tariff as it is RIGHT NOW — exactly what
    // `activateSaasBillingSubscriptionPeriod`/`setManualSaasBillingSubscription` do in application
    // code (`pgSaasBilling.ts`).
    await client.query(
      `INSERT INTO public.saas_billing_subscriptions
         (id, organization_id, saas_billing_account_id, tariff_id, source, status, lifecycle_state,
          current_period_starts_at, current_period_ends_at, tariff_snapshot)
       VALUES
         ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'paid_subscription', 'active', 'active',
          now() - interval '1 day', now() + interval '29 days',
          (SELECT to_jsonb(t) FROM public.saas_tariffs AS t WHERE t.id = $4::uuid))`,
      [SUBSCRIPTION, ORG, ACCOUNT, TARIFF],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid()');
    await cleanup();
    client.release();
    await pool.end();
  });

  it('an operator disabling the mechanic on the LIVE tariff mid-period does not take it from a clinic that already paid for it', async () => {
    expect(await resolveCourses(client)).toMatchObject({ state: 'full_access', mutation_allowed: true });

    await client.query(`UPDATE public.saas_tariffs SET mechanics = '{"courses": false}'::jsonb WHERE id = $1::uuid`, [
      TARIFF,
    ]);

    expect(await resolveCourses(client)).toMatchObject({ state: 'full_access', mutation_allowed: true });
  });

  it('§2.12 round 2 — shrinking the LIVE tariff quota mid-period does not reach the frozen limit (stockQuotaCheck.ts)', async () => {
    const tx = getWebappSqlFromPgClient(client);
    // Frozen snapshot still says limit 10 — 9 used + 1 more fits.
    await expect(
      assertStockQuotaAvailable(tx, ORG, 'patient_count', async () => 9),
    ).resolves.toBeUndefined();

    await client.query(
      `UPDATE public.saas_tariffs SET quotas = '{"patient_count": {"kind": "numeric", "limit": 3}}'::jsonb
       WHERE id = $1::uuid`,
      [TARIFF],
    );

    // Before the round-2 fix this read the LIVE tariff (limit 3) and threw here; the frozen
    // snapshot still says 10, so 9 used + 1 more still fits for the rest of the paid period.
    await expect(
      assertStockQuotaAvailable(tx, ORG, 'patient_count', async () => 9),
    ).resolves.toBeUndefined();
  });

  it('once the paid period ends, the clinic moves onto whatever the tariff looks like now', async () => {
    // The previous test already turned the live tariff's `courses` mechanic off; the paid period
    // ending is what makes that edit finally reach this clinic.
    await client.query(
      `UPDATE public.saas_billing_subscriptions
       SET status = 'expired', current_period_ends_at = now() - interval '1 minute'
       WHERE id = $1::uuid`,
      [SUBSCRIPTION],
    );

    expect(await resolveCourses(client)).toMatchObject({ state: 'disabled', mutation_allowed: false });
  });
});
