#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const smokePath = "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-13-db-isolation.mjs";
const checklistPath = "docs/_TODO/SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md";

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(path, text, token) {
  if (!text.includes(token)) throw new Error(`${path} missing token: ${token}`);
}

function runChecks(overrides = {}) {
  const smoke = overrides.smoke ?? read(smokePath);
  const checklist = overrides.checklist ?? read(checklistPath);

  for (const token of [
    "bcb_saas_p0_13_2_scratch_",
    "bcb_webapp_(dev|prod|test)",
    "CREATE ROLE ${appRoleIdent} NOLOGIN NOBYPASSRLS;",
    "SET ROLE ${appRoleIdent};",
    "rolbypassrls = false",
    "current_setting('app.org', true)",
    "current_setting('app.patient_user_id', true)",
    "current_setting('app.integrator_user_id', true)",
    "ALTER TABLE public.be_organization_members FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE public.org_enrollments FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE public.notification_delivery_attempts FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE integrator.content_access_grants FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE integrator.user_reminder_delivery_logs FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE p0_13_isolation.infra_rows FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE p0_13_isolation.telemetry_rows FORCE ROW LEVEL SECURITY;",
    "ALTER TABLE p0_13_isolation.legacy_rows FORCE ROW LEVEL SECURITY;",
    "USING (false)",
    "missing app.org must fail closed",
    "patient A1 must not see patient A2",
    "bootstrap global row must remain readable",
    "INFRA explicit treatment must remain readable",
    "TELEMETRY explicit treatment must remain readable",
    "LEGACY frozen treatment must deny rows",
  ]) {
    assertContains(smokePath, smoke, token);
  }

  for (const token of [
    "- [x] Run under non-bypass app role in scratch/non-prod.",
    "- [x] Correct org sees own SCOPED rows.",
    "- [x] Wrong org sees zero rows.",
    "- [x] Missing/empty org fails closed in enforce mode.",
    "- [x] Patient wall blocks cross-patient access inside the same org where patient predicate applies.",
    "- [x] Bootstrap global rows remain readable where intended.",
    "- [x] INFRA/TELEMETRY/LEGACY treatment matches descriptors.",
  ]) {
    assertContains(checklistPath, checklist, token);
  }
}

if (process.argv.includes("--self-test")) {
  const smoke = read(smokePath).replace("CREATE ROLE ${appRoleIdent} NOLOGIN NOBYPASSRLS;", "CREATE ROLE ${appRoleIdent};");

  try {
    runChecks({ smoke });
  } catch {
    console.log("check-p0-13-db-isolation self-test: OK");
    process.exit(0);
  }

  throw new Error("self-test did not detect missing NOBYPASSRLS role contract");
}

try {
  runChecks();
  console.log("check-p0-13-db-isolation: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-13-db-isolation: ${message}`);
  process.exit(1);
}
