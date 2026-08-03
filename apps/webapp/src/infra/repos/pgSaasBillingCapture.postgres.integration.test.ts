/**
 * B0.3 (#1057) — exoneration proof for `captureSaasBillingPaymentSucceeded`
 * (`apps/webapp/src/infra/repos/pgSaasBilling.ts:958`) under the EXACT runtime mechanism the
 * webhook route uses (`runWithDbOrganizationPrincipal` + `getDrizzle().transaction()`), with real
 * FORCE RLS on `saas_billing_invoices`/`saas_billing_subscriptions`/`saas_billing_provider_events`
 * (migration `0259`) and `DB_PRINCIPAL_CONTEXT_MODE=locked` (the mode DEV/TEST/PROD actually run,
 * `.env.dev:20` — the default-test `legacy-guc` in `vitest.setup.ts` never exercises the signed
 * path and would prove nothing here).
 *
 * The "drizzle transactions bypass `pool.query`, so the org RLS context is never installed" theory
 * for the 04.08 live TEST failure (`saas_billing_tariff_apply_failed`) is FALSE — refuted twice
 * over, independently:
 *   1. Code review (`SAAS_BILLING_PLAN.md` B0.3, lead check 04.08): `withPrincipalAwareTransactions`
 *      (`app-layer/db/drizzle.ts:102`) already installs the principal INSIDE the transaction via
 *      `tx.execute()`, on the same connection the transaction runs on — no `pool.query` involved
 *      either way.
 *   2. This test, run against a real disposable clone of `bcb_webapp_dev` (real migrations, real
 *      `locked`-mode signed context, real FORCE RLS): both the first-payment and the tariff-upgrade
 *      branch of `captureSaasBillingPaymentSucceeded` complete cleanly under a real org principal —
 *      invoice paid, tariff applied, subscription promoted.
 *
 * The REAL cause of the 04.08 failure was a PL/pgSQL `FOUND`-clobbering bug inside
 * `app.apply_paid_saas_billing_tariff` itself (a later `UPDATE` on the empty `saas_organization_trials`
 * table silently overwrote `FOUND` before `RETURN FOUND`) — found, fixed, and proven live on DEV and
 * TEST by a parallel worktree (`wt/billing-capture-fix`, migration `0354`, commit `faa715252`,
 * merged into this branch). See `SAAS_BILLING_PLAN.md` B0.3 for the full trail. This test does not
 * duplicate that fix's own regression coverage
 * (`saasBillingPaidTariffApplyAccessor.postgres.integration.test.ts`) — it proves the drizzle-level
 * RLS/principal seam this task was asked to inspect is sound, so nobody re-chases it again.
 *
 * ⚠️ Known harness-fidelity gap, unrelated to this seam: under `pnpm test:postgres`'s from-scratch
 * build (drizzle migrations + a0-greenfield baseline only — no `deploy/postgres/*.sql` overlay), the
 * `app.apply_paid_saas_billing_tariff` accessor's `UPDATE public.be_organizations` silently matches
 * zero rows (`app_owner` has `rolbypassrls=false` there and no permissive RLS policy on
 * `be_organizations` covers it), so the first `it` below fails with `saas_billing_tariff_apply_failed`
 * in THIS harness even though the RLS/principal seam it exercises is proven sound (see above) and the
 * same write succeeds on a real `bcb_webapp_dev` clone and on live DEV/TEST. The existing
 * `saasBillingPaidTariffApplyAccessor.postgres.integration.test.ts` hits the same class one statement
 * later (`permission denied for table saas_organization_trials`) for the same reason. Not fixed here —
 * out of scope for this task and pre-existing (reproduces on an unmodified checkout).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';
import { createPgSaasBillingRepository } from '@/infra/repos/pgSaasBilling';

const orgA = randomUUID();
const tariffX = randomUUID();
const accountA = randomUUID();
const subscriptionA = randomUUID();
const invoiceA = randomUUID();
const invoiceB = randomUUID();

const fixtureTables = [
  'public.be_organizations',
  'public.saas_billing_accounts',
  'public.saas_billing_subscriptions',
  'public.saas_billing_invoices',
  'public.saas_billing_provider_events',
] as const;

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('B0.3 captureSaasBillingPaymentSucceeded under a real org principal', () => {
  const pool = getPool();
  let client: PoolClient;
  let originalSigningSecret: string | null = null;

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  async function setFixtureRls(enabled: boolean): Promise<void> {
    for (const table of fixtureTables) {
      await run(`ALTER TABLE ${table} ${enabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`);
    }
  }

  // Distinct service periods per invoice: `saas_billing_invoices_period_uidx` (migration `0308`)
  // uniquely keys `tariff_period` invoices on (subscription, period start, period end) — two
  // fixture invoices under the same subscription must not share a period.
  async function insertInvoice(input: {
    id: string;
    status: 'pending';
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
  }): Promise<void> {
    await run(
      `INSERT INTO public.saas_billing_invoices (
         id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id,
         tariff_name, invoice_kind, amount_minor, currency, tariff_billing_period, tariff_snapshot,
         service_period_starts_at, service_period_ends_at, status, provider_id,
         provider_invoice_ref, provider_idempotency_key
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         'B0.3 capture probe', 'tariff_period', 199214, 'RUB', 'month', '{}'::jsonb,
         $6::timestamptz, $7::timestamptz,
         $8::text, 'yookassa', $9::text, $10::text
       )`,
      [
        input.id,
        orgA,
        accountA,
        subscriptionA,
        tariffX,
        input.servicePeriodStartsAt,
        input.servicePeriodEndsAt,
        input.status,
        `b03-capture-probe-${input.id}`,
        `b03-capture-probe-idempotency-${input.id}`,
      ],
    );
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    const secret = await run<{ secret: string }>(
      'SELECT secret FROM app.context_signing_secrets WHERE id = true',
    );
    originalSigningSecret = secret.rows[0]?.secret ?? null;
    const disposableSigningSecret = 'b03-disposable-capture-signed-principal-secret-0123456789';
    await run(
      `INSERT INTO app.context_signing_secrets (id, secret) VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret`,
      [disposableSigningSecret],
    );
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = disposableSigningSecret;

    await setFixtureRls(false);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run(`INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1::uuid, 'B0.3 capture A', NULL)`, [
      orgA,
    ]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await run(`INSERT INTO public.saas_tariffs (id, name) VALUES ($1::uuid, 'B0.3 capture tariff X')`, [
      tariffX,
    ]);
    await run(
      `INSERT INTO public.saas_billing_accounts (id, organization_id) VALUES ($1::uuid, $2::uuid)`,
      [accountA, orgA],
    );
    await run(
      `INSERT INTO public.saas_billing_subscriptions (
         id, organization_id, saas_billing_account_id, tariff_id, source, status, lifecycle_state,
         current_period_starts_at, current_period_ends_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'manual', 'active', 'active', NULL, NULL)`,
      [subscriptionA, orgA, accountA, tariffX],
    );
    await insertInvoice({
      id: invoiceA,
      status: 'pending',
      servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
    });
    await insertInvoice({
      id: invoiceB,
      status: 'pending',
      servicePeriodStartsAt: '2026-09-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-10-01T00:00:00.000Z',
    });

    // Re-arm real RLS for the actual capture calls under test — grants come from migration 0344.
    await run('GRANT SELECT, UPDATE ON TABLE public.be_organizations TO app_staff');
    await setFixtureRls(true);
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await setFixtureRls(false);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM public.saas_billing_provider_events WHERE organization_id = $1::uuid', [
      orgA,
    ]);
    await run('DELETE FROM public.saas_billing_invoices WHERE organization_id = $1::uuid', [orgA]);
    await run('DELETE FROM public.saas_billing_subscriptions WHERE organization_id = $1::uuid', [
      orgA,
    ]);
    await run('DELETE FROM public.saas_billing_accounts WHERE organization_id = $1::uuid', [orgA]);
    await run('DELETE FROM public.saas_tariffs WHERE id = $1::uuid', [tariffX]);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM public.be_organizations WHERE id = $1::uuid', [orgA]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    if (originalSigningSecret === null) {
      await run('DELETE FROM app.context_signing_secrets WHERE id = true');
    } else {
      await run('UPDATE app.context_signing_secrets SET secret = $1 WHERE id = true', [
        originalSigningSecret,
      ]);
    }
    await setFixtureRls(true);
    client.release();
    await pool.end();
  });

  it('updates the invoice and applies the tariff under a real organization principal', async () => {
    const repository = createPgSaasBillingRepository();
    const result = await runWithDbOrganizationPrincipal(orgA, () =>
      repository.captureSaasBillingPaymentSucceeded({
        organizationId: orgA,
        saasBillingInvoiceId: invoiceA,
        paidAt: '2026-08-01T00:05:00.000Z',
        event: {
          providerId: 'yookassa',
          providerEventId: `b03-capture-succeeded-${invoiceA}`,
          type: 'payment.succeeded',
        },
        savedPaymentMethodId: null,
      }),
    );

    expect(result).toEqual({ captured: true, duplicate: false });

    await setFixtureRls(false);
    try {
      const invoice = await run<{ status: string; paid_at: string | null }>(
        'SELECT status, paid_at FROM public.saas_billing_invoices WHERE id = $1::uuid',
        [invoiceA],
      );
      expect(invoice.rows[0]).toMatchObject({ status: 'paid' });
      expect(invoice.rows[0]?.paid_at).not.toBeNull();

      const org = await run<{ tariff_id: string | null }>(
        'SELECT tariff_id FROM public.be_organizations WHERE id = $1::uuid',
        [orgA],
      );
      expect(org.rows[0]?.tariff_id).toBe(tariffX);

      const subscription = await run<{ status: string; current_period_ends_at: string | null }>(
        'SELECT status, current_period_ends_at FROM public.saas_billing_subscriptions WHERE id = $1::uuid',
        [subscriptionA],
      );
      expect(subscription.rows[0]).toMatchObject({ status: 'active' });
      expect(subscription.rows[0]?.current_period_ends_at).not.toBeNull();
    } finally {
      await setFixtureRls(true);
    }
  });

  it('fails loudly instead of silently writing zero rows when no organization context is active', async () => {
    const repository = createPgSaasBillingRepository();

    await expect(
      repository.captureSaasBillingPaymentSucceeded({
        organizationId: orgA,
        saasBillingInvoiceId: invoiceB,
        paidAt: '2026-08-01T00:05:00.000Z',
        event: {
          providerId: 'yookassa',
          providerEventId: `b03-capture-no-context-${invoiceB}`,
          type: 'payment.succeeded',
        },
        savedPaymentMethodId: null,
      }),
    ).rejects.toSatisfy((error: unknown) =>
      /principal context is required/.test(errorMessages(error)),
    );

    await setFixtureRls(false);
    try {
      const invoice = await run<{ status: string }>(
        'SELECT status FROM public.saas_billing_invoices WHERE id = $1::uuid',
        [invoiceB],
      );
      expect(invoice.rows[0]).toMatchObject({ status: 'pending' });
    } finally {
      await setFixtureRls(true);
    }
  });
});
