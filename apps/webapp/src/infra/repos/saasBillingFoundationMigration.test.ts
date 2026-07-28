import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  sourceTextIncludes,
  sourceTextSliceBetween,
} from '../../../../../docs/_TODO/SAAS_FOUNDATION/scripts/source-text-guard.mjs';

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

function expectSourceContains(source: string, fragment: string, path: URL): void {
  expect(sourceTextIncludes(source, fragment, path.pathname)).toBe(true);
}

function expectSourceNotContains(source: string, fragment: string, path: URL): void {
  expect(sourceTextIncludes(source, fragment, path.pathname)).toBe(false);
}

describe('0259 SaaS billing foundation migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('creates the four disjoint org-owned tables with FORCE RLS', () => {
    for (const table of [
      'saas_billing_accounts',
      'saas_billing_subscriptions',
      'saas_billing_invoices',
      'saas_billing_provider_events',
    ]) {
      expectSourceContains(sql, `CREATE TABLE public.${table}`, migrationPath);
      expectSourceContains(
        sql,
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
        migrationPath,
      );
      expectSourceContains(
        sql,
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
        migrationPath,
      );
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
    expectSourceContains(sql, "'manual'", migrationPath);
    expectSourceContains(sql, 'ON CONFLICT (organization_id, source) DO UPDATE SET', migrationPath);
    expect(sql).not.toMatch(/UPDATE\s+public\.be_organizations\s+SET\s+tariff_id/);
  });

  it('keeps invoice snapshots and provider-event idempotency in the database', () => {
    for (const column of [
      'tariff_name text NOT NULL',
      'amount_minor integer NOT NULL',
      'currency text NOT NULL',
      'tariff_billing_period text NOT NULL',
    ]) {
      expectSourceContains(sql, column, migrationPath);
    }
    expectSourceContains(sql, 'UNIQUE (provider_id, provider_event_id)', migrationPath);
    expectSourceContains(sql, 'raw_payload jsonb NOT NULL', migrationPath);
    expectSourceContains(sql, 'raw_payload - ARRAY[', migrationPath);
    expectSourceContains(sql, "'subscriptionReference'", migrationPath);
    expectSourceContains(sql, 'saved_payment_method_id text', migrationPath);
  });

  it('seeds only the restricted global setting with mock and configured lifecycle numbers', () => {
    expectSourceContains(sql, "'saas_billing_payment_provider'", migrationPath);
    expectSourceContains(sql, "'defaultProviderId', 'mock'", migrationPath);
    expectSourceContains(sql, "'graceDays', 7", migrationPath);
    expectSourceContains(sql, "'chargeAttempts', 3", migrationPath);
    expectSourceContains(sql, "'readOnlyDays', 21", migrationPath);
    expectSourceNotContains(sql, 'app_runtime_settings', migrationPath);
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

  it('rehydrates and asserts the exact deploy grant inventory', () => {
    const runtime = readFileSync(deployRuntimePath, 'utf8');
    const host = readFileSync(deployHostPath, 'utf8');
    const repository = readFileSync(repositoryPath, 'utf8');
    const principal = readFileSync(principalPath, 'utf8');
    const clinicRoute = readFileSync(clinicRoutePath, 'utf8');
    const billingDeployGate = sourceTextSliceBetween(
      host,
      'assert_c5a_saas_billing_foundation_closure(){',
      'assert_db_owner_and_telemetry_owner_secdef_anon_surface_pinned(){',
      deployHostPath.pathname,
    );
    expect(billingDeployGate).not.toBeNull();
    expectSourceContains(runtime, 'c5a_saas_billing_exact_wall', deployRuntimePath);
    expectSourceContains(
      runtime,
      'CREATE ROLE app_clinic_billing NOLOGIN NOINHERIT NOBYPASSRLS',
      deployRuntimePath,
    );
    expectSourceContains(
      runtime,
      'GRANT app_clinic_billing TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
      deployRuntimePath,
    );
    expectSourceContains(
      runtime,
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO app_platform_settings',
      deployRuntimePath,
    );
    expectSourceContains(
      runtime,
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM app_staff',
      deployRuntimePath,
    );
    expectSourceContains(
      runtime,
      'GRANT SELECT ON TABLE public.%I TO app_clinic_billing',
      deployRuntimePath,
    );
    expectSourceContains(runtime, 'FOR SELECT TO app_clinic_billing', deployRuntimePath);
    expectSourceContains(
      runtime,
      'app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)',
      deployRuntimePath,
    );
    for (const fragment of [
      'actual_table_acl',
      'expected_table_acl',
      'actual_column_acl',
      'expected_policy_inventory',
      'relrowsecurity',
      'relforcerowsecurity',
    ]) {
      expectSourceContains(runtime, fragment, deployRuntimePath);
    }
    for (const fragment of [
      'assert_c5a_saas_billing_foundation_closure',
      'actual_table_acl',
      'expected_policy_inventory',
      'relforcerowsecurity',
    ]) {
      expectSourceContains(host, fragment, deployHostPath);
    }
    expectSourceContains(
      billingDeployGate ?? '',
      "'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)'",
      deployHostPath,
    );
    expectSourceContains(principal, 'kind: "clinicBilling"', principalPath);
    expectSourceContains(principal, 'SET ROLE ${DB_PRINCIPAL_CLINIC_BILLING_ROLE}', principalPath);
    expectSourceContains(clinicRoute, 'runWithDbClinicBillingPrincipal', clinicRoutePath);
    expectSourceNotContains(repository, 'SET ROLE', repositoryPath);
    // 106 -> 107: 0267 adds the staff-name directory accessor, 0268 adds the delivery-audit
    // writer, and 0269 removes the superseded signup-slug reservation function.
    expectSourceContains(host, 'local expected_secdef_count=110', deployHostPath);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
  });
});
