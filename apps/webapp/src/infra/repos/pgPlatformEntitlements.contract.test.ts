/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = readFileSync(new URL("./pgPlatformEntitlements.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../../db/drizzle-migrations/0224_saas_tariff_quotas_trial.sql", import.meta.url),
  "utf8",
);

describe("platform commercial persistence boundary", () => {
  it("uses the single Drizzle chokepoint and exact-org principals for org mutations", () => {
    expect(repo).toContain('import { getDrizzle } from "@/app-layer/db/drizzle"');
    expect(repo).toContain("runWithDbOrganizationPrincipal(organizationId");
    expect(repo).toContain("runWithDbOrganizationPrincipal(input.organizationId");
    expect(repo).not.toMatch(/\bpg\b.*Pool|runWebappPgText|\.execute\(sql\.raw/);
    expect(repo).toContain("principal?.kind !== \"bootstrap\"");
    expect(repo).toContain('principal?.kind !== "platform"');
    expect(repo).toContain("principal.source !== PLATFORM_OPERATIONS_DB_SOURCE");
    expect(repo).toContain("createPgOrganizationTrialProvisioningPort");
  });

  it("appends immutable before/after/reason audit entries for platform changes", () => {
    expect(repo).toContain("tx.insert(adminAuditLog)");
    expect(repo).toContain("reason: input.audit.reason, before: input.before, after: input.after");
    expect(repo).toContain('action: "saas_trial_extend"');
    expect(repo).toContain('action: "saas_entitlement_override_upsert"');
  });

  it("makes trials unique per organization and protects hot org/time columns", () => {
    expect(migration).toContain('CONSTRAINT "saas_organization_trials_organization_uidx" UNIQUE ("organization_id")');
    expect(migration).toContain('"idx_saas_organization_trials_lifecycle"');
    expect(migration).toContain('"idx_saas_organization_quota_usage_org_updated"');
    expect(migration).toContain('"idx_saas_org_entitlement_overrides_org_expiry"');
    expect(migration).toContain("app.current_org_id()");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
  });
});
