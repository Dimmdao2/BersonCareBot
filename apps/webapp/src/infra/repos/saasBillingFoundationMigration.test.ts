import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../../../db/drizzle-migrations/0259_saas_billing_foundation.sql",
  import.meta.url,
);
const journalPath = new URL(
  "../../../db/drizzle-migrations/meta/_journal.json",
  import.meta.url,
);
const deployRuntimePath = new URL(
  "../../../../../deploy/postgres/c5a-platform-operations-runtime.sql",
  import.meta.url,
);
const deployHostPath = new URL(
  "../../../../../deploy/host/deploy-test-saas.sh",
  import.meta.url,
);

describe("0259 SaaS billing foundation migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates the four disjoint org-owned tables with FORCE RLS", () => {
    for (const table of [
      "saas_billing_accounts",
      "saas_billing_subscriptions",
      "saas_billing_invoices",
      "saas_billing_provider_events",
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`CREATE POLICY ${table}_staff_select`);
    }
  });

  it("backfills only manual tariff authority and never converts an active trial projection", () => {
    expect(sql.match(/WHERE organization\.tariff_id IS NOT NULL/g)).toHaveLength(2);
    expect(sql.match(/AND NOT EXISTS \(/g)).toHaveLength(2);
    expect(
      sql.match(
        /FROM public\.saas_organization_trials AS trial\s+WHERE trial\.organization_id = organization\.id\s+AND trial\.status = 'active'/g,
      ),
    ).toHaveLength(2);
    expect(sql).toContain("'manual'");
    expect(sql).toContain("ON CONFLICT (organization_id, source) DO UPDATE SET");
    expect(sql).not.toMatch(/UPDATE\s+public\.be_organizations\s+SET\s+tariff_id/);
  });

  it("keeps invoice snapshots and provider-event idempotency in the database", () => {
    for (const column of [
      "tariff_name text NOT NULL",
      "amount_minor integer NOT NULL",
      "currency text NOT NULL",
      "tariff_billing_period text NOT NULL",
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("UNIQUE (provider_id, provider_event_id)");
    expect(sql).toContain("raw_payload jsonb NOT NULL");
    expect(sql).toContain("raw_payload - ARRAY[");
    expect(sql).toContain("'subscriptionReference'");
    expect(sql).toContain("saved_payment_method_id text");
  });

  it("seeds only the restricted global setting with mock and configured lifecycle numbers", () => {
    expect(sql).toContain("'saas_billing_payment_provider'");
    expect(sql).toContain("'defaultProviderId', 'mock'");
    expect(sql).toContain("'graceDays', 7");
    expect(sql).toContain("'chargeAttempts', 3");
    expect(sql).toContain("'readOnlyDays', 21");
    expect(sql).not.toContain("app_runtime_settings");
  });

  it("pins the required migration journal watermark", () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(journal.entries.find((entry) => entry.idx === 259)).toEqual({
      idx: 259,
      version: "7",
      when: 1793539200056,
      tag: "0259_saas_billing_foundation",
      breakpoints: true,
    });
  });

  it("rehydrates and asserts the exact deploy grant inventory without a new definer", () => {
    const runtime = readFileSync(deployRuntimePath, "utf8");
    const host = readFileSync(deployHostPath, "utf8");
    expect(runtime).toContain("c5a_saas_billing_exact_wall");
    expect(runtime).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO app_platform_settings");
    expect(runtime).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM app_staff");
    expect(runtime).toContain("actual_table_acl");
    expect(runtime).toContain("expected_table_acl");
    expect(runtime).toContain("actual_column_acl");
    expect(runtime).toContain("expected_policy_inventory");
    expect(runtime).toContain("relrowsecurity");
    expect(runtime).toContain("relforcerowsecurity");
    expect(host).toContain("assert_c5a_saas_billing_foundation_closure");
    expect(host).toContain("actual_table_acl");
    expect(host).toContain("expected_policy_inventory");
    expect(host).toContain("relforcerowsecurity");
    // 105 -> 106: migration 0261 adds the single reviewed
    // app.is_platform_registration_analytics_user_excluded(uuid) SECURITY DEFINER.
    expect(host).toContain("local expected_secdef_count=106");
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
  });
});
