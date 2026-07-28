import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL(
  '../../../db/drizzle-migrations/0259_saas_billing_foundation.sql',
  import.meta.url,
);
const journalPath = new URL('../../../db/drizzle-migrations/meta/_journal.json', import.meta.url);
const deployRuntimePath = new URL(
  '../../../../../deploy/postgres/c5a-platform-operations-runtime.sql',
  import.meta.url,
);
const deployHostPath = new URL('../../../../../deploy/host/deploy-test-saas.sh', import.meta.url);
const repositoryPath = new URL('./pgSaasBilling.ts', import.meta.url);
const principalPath = new URL('../../../../../packages/db-principal/src/index.ts', import.meta.url);
const clinicRoutePath = new URL('../../app/api/clinic/billing/route.ts', import.meta.url);

describe('0259 SaaS billing foundation migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('creates the four disjoint org-owned tables with FORCE RLS', () => {
    for (const table of [
      'saas_billing_accounts',
      'saas_billing_subscriptions',
      'saas_billing_invoices',
      'saas_billing_provider_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(sql).not.toMatch(/TO app_staff/);
  });

  it('backfills only manual tariff authority and never converts an active trial projection', () => {
    expect(sql.match(/WHERE organization\.tariff_id IS NOT NULL/g)).toHaveLength(2);
    expect(sql.match(/AND NOT EXISTS \(/g)).toHaveLength(2);
    expect(
      sql.match(
        /FROM public\.saas_organization_trials AS trial\s+WHERE trial\.organization_id = organization\.id\s+AND trial\.status = 'active'/g,
      ),
    ).toHaveLength(2);
    expect(sql).toContain("'manual'");
    expect(sql).toContain('ON CONFLICT (organization_id, source) DO UPDATE SET');
    expect(sql).not.toMatch(/UPDATE\s+public\.be_organizations\s+SET\s+tariff_id/);
  });

  it('keeps invoice snapshots and provider-event idempotency in the database', () => {
    for (const column of [
      'tariff_name text NOT NULL',
      'amount_minor integer NOT NULL',
      'currency text NOT NULL',
      'tariff_billing_period text NOT NULL',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('UNIQUE (provider_id, provider_event_id)');
    expect(sql).toContain('raw_payload jsonb NOT NULL');
    expect(sql).toContain('raw_payload - ARRAY[');
    expect(sql).toContain("'subscriptionReference'");
    expect(sql).toContain('saved_payment_method_id text');
  });

  it('seeds only the restricted global setting with mock and configured lifecycle numbers', () => {
    expect(sql).toContain("'saas_billing_payment_provider'");
    expect(sql).toContain("'defaultProviderId', 'mock'");
    expect(sql).toContain("'graceDays', 7");
    expect(sql).toContain("'chargeAttempts', 3");
    expect(sql).toContain("'readOnlyDays', 21");
    expect(sql).not.toContain('app_runtime_settings');
  });

  it('pins the required migration journal watermark', () => {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(journal.entries.find((entry) => entry.idx === 259)).toEqual({
      idx: 259,
      version: '7',
      when: 1793539200056,
      tag: '0259_saas_billing_foundation',
      breakpoints: true,
    });
  });

  it('rehydrates and asserts the exact deploy grant inventory without a new definer', () => {
    const runtime = readFileSync(deployRuntimePath, 'utf8');
    const host = readFileSync(deployHostPath, 'utf8');
    const repository = readFileSync(repositoryPath, 'utf8');
    const principal = readFileSync(principalPath, 'utf8');
    const clinicRoute = readFileSync(clinicRoutePath, 'utf8');
    expect(runtime).toContain('c5a_saas_billing_exact_wall');
    expect(runtime).toContain('CREATE ROLE app_clinic_billing NOLOGIN NOINHERIT NOBYPASSRLS');
    expect(runtime).toContain(
      'GRANT app_clinic_billing TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
    );
    expect(runtime).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO app_platform_settings',
    );
    expect(runtime).toContain('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM app_staff');
    expect(runtime).toContain('GRANT SELECT ON TABLE public.%I TO app_clinic_billing');
    expect(runtime).toContain('FOR SELECT TO app_clinic_billing');
    expect(runtime).toContain('actual_table_acl');
    expect(runtime).toContain('expected_table_acl');
    expect(runtime).toContain('actual_column_acl');
    expect(runtime).toContain('expected_policy_inventory');
    expect(runtime).toContain('relrowsecurity');
    expect(runtime).toContain('relforcerowsecurity');
    expect(host).toContain('assert_c5a_saas_billing_foundation_closure');
    expect(host).toContain('actual_table_acl');
    expect(host).toContain('expected_policy_inventory');
    expect(host).toContain('relforcerowsecurity');
    expect(principal).toContain('kind: "clinicBilling"');
    expect(principal).toContain('SET ROLE ${DB_PRINCIPAL_CLINIC_BILLING_ROLE}');
    expect(clinicRoute).toContain('enterWithDbClinicBillingPrincipal');
    expect(repository).not.toContain('SET ROLE');
    // 106 -> 107: 0267 adds the staff-name directory accessor, 0268 adds the delivery-audit
    // writer, and 0269 removes the superseded signup-slug reservation function.
    expect(host).toContain('local expected_secdef_count=109');
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
  });
});
