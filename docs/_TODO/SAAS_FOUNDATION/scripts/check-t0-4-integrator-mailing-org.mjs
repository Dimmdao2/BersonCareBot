#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  orgHelper: "apps/integrator/src/infra/db/repos/integratorUserOrganizationSql.ts",
  subscriptions: "apps/integrator/src/infra/db/repos/subscriptions.ts",
  subscriptionsTest: "apps/integrator/src/infra/db/repos/subscriptions.test.ts",
  mailingLogs: "apps/integrator/src/infra/db/repos/mailingLogs.ts",
  mailingLogsTest: "apps/integrator/src/infra/db/repos/mailingLogs.test.ts",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const orgHelper = overrides.orgHelper ?? read(files.orgHelper);
  const subscriptions = overrides.subscriptions ?? read(files.subscriptions);
  const subscriptionsTest = overrides.subscriptionsTest ?? read(files.subscriptionsTest);
  const mailingLogs = overrides.mailingLogs ?? read(files.mailingLogs);
  const mailingLogsTest = overrides.mailingLogsTest ?? read(files.mailingLogsTest);

  for (const needle of [
    "export function organizationIdForIntegratorUserSql",
    "getCurrentOrganizationPrincipalId() ?? null",
    "public.platform_users platform_user",
    "public.org_enrollments",
    "public.be_organization_members",
    "count(DISTINCT active_user_orgs.organization_id) = 1",
  ]) {
    assertContains(files.orgHelper, orgHelper, needle);
  }

  for (const needle of [
    "organizationId: organizationIdExpression",
    "organizationId: sql`COALESCE(${organizationIdExpression}, ${userSubscriptions.organizationId})`",
  ]) {
    assertContains(files.subscriptions, subscriptions, needle);
  }

  for (const needle of [
    "organizationId: organizationIdExpression",
    "organizationId: sql`COALESCE(${organizationIdExpression}, ${mailingLogs.organizationId})`",
  ]) {
    assertContains(files.mailingLogs, mailingLogs, needle);
  }

  for (const needle of [
    "upserts subscription by canonical user_id with organization context",
    "public.org_enrollments",
    "public.be_organization_members",
    "count(DISTINCT active_user_orgs.organization_id) = 1",
  ]) {
    assertContains(files.subscriptionsTest, subscriptionsTest, needle);
  }

  for (const needle of [
    "insertMailingLog upserts by (user_id, mailing_id) with status/sentAt/error and organization context",
    "public.org_enrollments",
    "public.be_organization_members",
    "count(DISTINCT active_user_orgs.organization_id) = 1",
  ]) {
    assertContains(files.mailingLogsTest, mailingLogsTest, needle);
  }
}

if (process.argv.includes("--self-test")) {
  const subscriptions = read(files.subscriptions).replace(
    "organizationId: organizationIdExpression",
    "organizationId: null",
  );
  try {
    runChecks({ subscriptions });
  } catch {
    console.log("check-t0-4-integrator-mailing-org self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect missing subscription organization_id insert expression");
}

try {
  runChecks();
  console.log("check-t0-4-integrator-mailing-org: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-integrator-mailing-org: ${message}`);
  process.exit(1);
}
