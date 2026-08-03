/**
 * B0.3 (#1057): live TEST proved the SaaS tariff payment webhook's first query — resolving the
 * invoice by provider ref, before the organization principal is known — runs under the bootstrap
 * login and 500s with `permission denied for table saas_billing_invoices` (migration 0311 only
 * ever granted `app_clinic_billing`, which the bootstrap connection never becomes; see
 * `packages/db-principal/src/index.ts`'s `bootstrap`/`infra` case).
 *
 * This proves migration 0342's fix directly against real PostgreSQL, at the same "SET ROLE to a
 * narrow probe, exercise it" level `reminderCallbackCapabilities.postgres.integration.test.ts`
 * uses. `app_config_reader` stands in for the real bootstrap login: it is a real, pre-existing
 * NOLOGIN role this harness provisions with zero relationship to `saas_billing_*` anywhere in the
 * migration chain (grep confirms no migration ever grants it billing access), so temporarily
 * handing it ONLY the new EXECUTE reproduces the bootstrap login's exact privilege shape (this
 * disposable clone's connecting role cannot CREATE ROLE, so a throwaway role is not an option).
 * The plain table read the webhook used to issue stays denied under the same role throughout —
 * proof the fix is one narrow EXECUTE grant, not a widened table grant.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const PROBE_ROLE = 'app_config_reader';

const organizationId = randomUUID();
const tariffId = randomUUID();
const accountId = randomUUID();
const subscriptionId = randomUUID();
const invoiceId = randomUUID();
const PROVIDER_ID = 'yookassa';
const PROVIDER_INVOICE_REF = `b03-probe-${randomUUID()}`;

const fixtureTables = [
  'public.be_organizations',
  'public.saas_billing_accounts',
  'public.saas_billing_subscriptions',
  'public.saas_billing_invoices',
] as const;

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('B0.3 saas billing webhook bootstrap invoice resolver', () => {
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

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    const probeExists = await run<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
      [PROBE_ROLE],
    );
    expect(probeExists.rows[0]?.exists).toBe(true);
    const probeHasBillingAccess = await run<{ has: boolean }>(
      `SELECT has_table_privilege($1, 'public.saas_billing_invoices', 'SELECT') AS has`,
      [PROBE_ROLE],
    );
    expect(probeHasBillingAccess.rows[0]?.has).toBe(false);

    await setFixtureRls(false);
    // The org-insert trigger seeds the reference catalog under app_owner; disabling it here
    // mirrors reminderCallbackCapabilities.postgres.integration.test.ts's own fixture setup and
    // keeps this probe scoped to saas_billing_*, not the unrelated reference-catalog seam.
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run(`INSERT INTO public.be_organizations (id, title) VALUES ($1::uuid, 'B0.3 probe org')`, [
      organizationId,
    ]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');

    await run(`INSERT INTO public.saas_tariffs (id, name) VALUES ($1::uuid, 'B0.3 probe tariff')`, [
      tariffId,
    ]);
    await run(
      `INSERT INTO public.saas_billing_accounts (id, organization_id) VALUES ($1::uuid, $2::uuid)`,
      [accountId, organizationId],
    );
    await run(
      `INSERT INTO public.saas_billing_subscriptions (
         id, organization_id, saas_billing_account_id, tariff_id, source, status, lifecycle_state
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'manual', 'active', 'active')`,
      [subscriptionId, organizationId, accountId, tariffId],
    );
    await run(
      `INSERT INTO public.saas_billing_invoices (
         id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id,
         tariff_name, invoice_kind, amount_minor, currency, tariff_billing_period,
         service_period_starts_at, service_period_ends_at, status, provider_id,
         provider_invoice_ref, provider_idempotency_key
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         'B0.3 probe tariff', 'tariff_period', 50000, 'RUB', 'month',
         '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'pending', $6::text,
         $7::text, $8::text
       )`,
      [
        invoiceId,
        organizationId,
        accountId,
        subscriptionId,
        tariffId,
        PROVIDER_ID,
        PROVIDER_INVOICE_REF,
        `b03-probe-idempotency-${invoiceId}`,
      ],
    );

    await run(
      `GRANT EXECUTE ON FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) TO ${PROBE_ROLE}`,
    );
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await run(
      `REVOKE EXECUTE ON FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) FROM ${PROBE_ROLE}`,
    );
    await run('DELETE FROM public.saas_billing_invoices WHERE id = $1::uuid', [invoiceId]);
    await run('DELETE FROM public.saas_billing_subscriptions WHERE id = $1::uuid', [subscriptionId]);
    await run('DELETE FROM public.saas_billing_accounts WHERE id = $1::uuid', [accountId]);
    await run('DELETE FROM public.saas_tariffs WHERE id = $1::uuid', [tariffId]);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM public.be_organizations WHERE id = $1::uuid', [organizationId]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await setFixtureRls(true);
    client.release();
    await pool.end();
  });

  it('denies the plain table read the webhook used to issue under this role', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      await expect(
        run('SELECT * FROM public.saas_billing_invoices LIMIT 1'),
      ).rejects.toSatisfy((error: unknown) => /permission denied/.test(errorMessages(error)));
    } finally {
      await run('RESET ROLE');
    }
  });

  it('reaches the exact invoice through the narrow resolver without raising 42501', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      const resolved = await run<{
        id: string;
        organization_id: string;
        amount_minor: number;
        currency: string;
      }>(
        `SELECT * FROM app.resolve_saas_billing_invoice_for_webhook($1::text, $2::text)`,
        [PROVIDER_ID, PROVIDER_INVOICE_REF],
      );
      expect(resolved.rows).toEqual([
        {
          id: invoiceId,
          organization_id: organizationId,
          amount_minor: 50000,
          currency: 'RUB',
        },
      ]);
    } finally {
      await run('RESET ROLE');
    }
  });

  it('returns no rows (not an error) for an unknown provider reference', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      const resolved = await run(
        `SELECT * FROM app.resolve_saas_billing_invoice_for_webhook($1::text, $2::text)`,
        [PROVIDER_ID, 'does-not-exist'],
      );
      expect(resolved.rows).toEqual([]);
    } finally {
      await run('RESET ROLE');
    }
  });
});
