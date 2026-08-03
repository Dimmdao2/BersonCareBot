/**
 * B0.3 (#1057): live TEST proved the capture path's tariff apply (`promotePaidInvoice` and the
 * tariff-upgrade branch of `captureSaasBillingPaymentSucceeded`,
 * `apps/webapp/src/infra/repos/pgSaasBilling.ts`) runs under `SET ROLE app_staff`
 * (`runWithDbOrganizationPrincipal`) and is unconditionally rejected by the guard trigger
 * `app.reject_staff_commercial_organization_update()` (`0225`/`0297`):
 * `platform_commercial_capability_required`.
 *
 * This proves migration 0346's fix directly against real PostgreSQL, at the same "SET ROLE to the
 * exact runtime role, exercise it" level `saasBillingWebhookBootstrapInvoiceResolver.postgres.integration.test.ts`
 * uses for the sibling `0343` resolver. `app_staff` here is the real runtime role (not a stand-in):
 * it is the role the new EXECUTE grant actually targets, and it already holds no other privilege on
 * `be_organizations.tariff_id` (the guard trigger exists precisely because it does not).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const orgA = randomUUID();
const orgB = randomUUID();
const tariffX = randomUUID();
const tariffY = randomUUID();
const accountA = randomUUID();
const accountB = randomUUID();
const subscriptionA = randomUUID();
const subscriptionB = randomUUID();
const paidInvoice = randomUUID();
const unpaidInvoice = randomUUID();
const foreignInvoice = randomUUID();

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

const fixtureTables = [
  'public.be_organizations',
  'public.saas_billing_accounts',
  'public.saas_billing_subscriptions',
  'public.saas_billing_invoices',
] as const;

describe('B0.3 saas billing paid tariff apply accessor', () => {
  const pool = getPool();
  let client: PoolClient;

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  async function setFixtureRls(enabled: boolean): Promise<void> {
    for (const table of fixtureTables) {
      await run(`ALTER TABLE ${table} ${enabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`);
    }
  }

  async function insertInvoice(input: {
    id: string;
    organizationId: string;
    accountId: string;
    subscriptionId: string;
    tariffId: string;
    status: 'pending' | 'paid';
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
  }): Promise<void> {
    await run(
      `INSERT INTO public.saas_billing_invoices (
         id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id,
         tariff_name, invoice_kind, amount_minor, currency, tariff_billing_period,
         service_period_starts_at, service_period_ends_at, status, provider_id,
         provider_invoice_ref, provider_idempotency_key
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         'B0.3 probe tariff', 'tariff_period', 50000, 'RUB', 'month',
         $6::timestamptz, $7::timestamptz, $8::text, 'yookassa',
         $9::text, $10::text
       )`,
      [
        input.id,
        input.organizationId,
        input.accountId,
        input.subscriptionId,
        input.tariffId,
        input.servicePeriodStartsAt,
        input.servicePeriodEndsAt,
        input.status,
        `b03-apply-probe-${input.id}`,
        `b03-apply-probe-idempotency-${input.id}`,
      ],
    );
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    const grantedToStaff = await run<{ has: boolean }>(
      `SELECT has_function_privilege('app_staff', 'app.apply_paid_saas_billing_tariff(uuid, uuid)', 'EXECUTE') AS has`,
    );
    expect(grantedToStaff.rows[0]?.has).toBe(true);

    // On real DEV/TEST, app_staff already holds table-level UPDATE on be_organizations (a
    // host-applied deploy/postgres overlay, not part of this migration-only harness's baseline --
    // see 0346's own header comment on the equivalent app_owner gap). Grant it here, test-scoped,
    // so "the guard trigger still refuses a direct app_staff write" is proven against the real
    // failure mode (the trigger raising) rather than a false pass caused by a missing base ACL this
    // harness happens not to carry.
    await run('GRANT SELECT, UPDATE (tariff_id) ON TABLE public.be_organizations TO app_staff');

    await setFixtureRls(false);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run(
      `INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1::uuid, 'B0.3 apply A', NULL), ($2::uuid, 'B0.3 apply B', NULL)`,
      [orgA, orgB],
    );
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');

    await run(
      `INSERT INTO public.saas_tariffs (id, name) VALUES ($1::uuid, 'B0.3 tariff X'), ($2::uuid, 'B0.3 tariff Y')`,
      [tariffX, tariffY],
    );
    await run(
      `INSERT INTO public.saas_billing_accounts (id, organization_id) VALUES ($1::uuid, $2::uuid), ($3::uuid, $4::uuid)`,
      [accountA, orgA, accountB, orgB],
    );
    await run(
      `INSERT INTO public.saas_billing_subscriptions (
         id, organization_id, saas_billing_account_id, tariff_id, source, status, lifecycle_state
       ) VALUES
         ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'manual', 'active', 'active'),
         ($5::uuid, $6::uuid, $7::uuid, $8::uuid, 'manual', 'active', 'active')`,
      [subscriptionA, orgA, accountA, tariffX, subscriptionB, orgB, accountB, tariffY],
    );

    await insertInvoice({
      id: paidInvoice,
      organizationId: orgA,
      accountId: accountA,
      subscriptionId: subscriptionA,
      tariffId: tariffX,
      status: 'paid',
      servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
    });
    await insertInvoice({
      id: unpaidInvoice,
      organizationId: orgA,
      accountId: accountA,
      subscriptionId: subscriptionA,
      tariffId: tariffX,
      status: 'pending',
      servicePeriodStartsAt: '2026-09-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-10-01T00:00:00.000Z',
    });
    await insertInvoice({
      id: foreignInvoice,
      organizationId: orgB,
      accountId: accountB,
      subscriptionId: subscriptionB,
      tariffId: tariffY,
      status: 'paid',
      servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
    });
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await run('REVOKE SELECT, UPDATE (tariff_id) ON TABLE public.be_organizations FROM app_staff');
    await run('DELETE FROM public.saas_billing_invoices WHERE organization_id = ANY($1::uuid[])', [
      [orgA, orgB],
    ]);
    await run('DELETE FROM public.saas_billing_subscriptions WHERE organization_id = ANY($1::uuid[])', [
      [orgA, orgB],
    ]);
    await run('DELETE FROM public.saas_billing_accounts WHERE organization_id = ANY($1::uuid[])', [
      [orgA, orgB],
    ]);
    await run('DELETE FROM public.saas_tariffs WHERE id = ANY($1::uuid[])', [[tariffX, tariffY]]);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM public.be_organizations WHERE id = ANY($1::uuid[])', [[orgA, orgB]]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await setFixtureRls(true);
    client.release();
    await pool.end();
  });

  it('applies the tariff for an invoice that is actually paid, under app_staff', async () => {
    await run('SET ROLE app_staff');
    try {
      const applied = await run<{ applied: boolean }>(
        'SELECT app.apply_paid_saas_billing_tariff($1::uuid, $2::uuid) AS applied',
        [paidInvoice, orgA],
      );
      expect(applied.rows[0]?.applied).toBe(true);
    } finally {
      await run('RESET ROLE');
    }
    const org = await run<{ tariff_id: string | null }>(
      'SELECT tariff_id FROM public.be_organizations WHERE id = $1::uuid',
      [orgA],
    );
    expect(org.rows[0]?.tariff_id).toBe(tariffX);
  });

  it('refuses an unpaid invoice (no-op, not an error)', async () => {
    await run('SET ROLE app_staff');
    try {
      const applied = await run<{ applied: boolean }>(
        'SELECT app.apply_paid_saas_billing_tariff($1::uuid, $2::uuid) AS applied',
        [unpaidInvoice, orgA],
      );
      expect(applied.rows[0]?.applied).toBe(false);
    } finally {
      await run('RESET ROLE');
    }
  });

  it('refuses a paid invoice presented against a foreign organization', async () => {
    await run('SET ROLE app_staff');
    try {
      const applied = await run<{ applied: boolean }>(
        'SELECT app.apply_paid_saas_billing_tariff($1::uuid, $2::uuid) AS applied',
        [paidInvoice, orgB],
      );
      expect(applied.rows[0]?.applied).toBe(false);
    } finally {
      await run('RESET ROLE');
    }
    const org = await run<{ tariff_id: string | null }>(
      'SELECT tariff_id FROM public.be_organizations WHERE id = $1::uuid',
      [orgB],
    );
    expect(org.rows[0]?.tariff_id).toBeNull();
  });

  it('leaves the direct app_staff guard trigger refusing tariff_id writes', async () => {
    await run('SET ROLE app_staff');
    try {
      await expect(
        run('UPDATE public.be_organizations SET tariff_id = $1::uuid WHERE id = $2::uuid', [
          tariffY,
          orgB,
        ]),
      ).rejects.toSatisfy((error: unknown) =>
        /platform_commercial_capability_required/.test(errorMessages(error)),
      );
    } finally {
      await run('RESET ROLE');
    }
  });

  it('applies the tariff for the second, still-foreign-organization-owned paid invoice under its own org', async () => {
    await run('SET ROLE app_staff');
    try {
      const applied = await run<{ applied: boolean }>(
        'SELECT app.apply_paid_saas_billing_tariff($1::uuid, $2::uuid) AS applied',
        [foreignInvoice, orgB],
      );
      expect(applied.rows[0]?.applied).toBe(true);
    } finally {
      await run('RESET ROLE');
    }
    const org = await run<{ tariff_id: string | null }>(
      'SELECT tariff_id FROM public.be_organizations WHERE id = $1::uuid',
      [orgB],
    );
    expect(org.rows[0]?.tariff_id).toBe(tariffY);
  });
});
