#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  adr: "docs/_TODO/SAAS_FOUNDATION/SAAS_C0_LOCKED_TOPOLOGY_ADR.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  smoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-c0-locked-topology.mjs",
  packageJson: "package.json",
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) {
      fail(`${label} must not contain forbidden fragment: ${fragment}`);
    }
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.roadmap, loaded.roadmap, [
    "### Phase C0",
    "app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS",
    "app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS",
    "not a SECURITY DEFINER role-switch bridge",
    "bootstrap DML is exactly allowlisted",
  ]);

  requireFragments(files.adr, loaded.adr, [
    "# C0 locked topology ADR",
    "Use two runtime login roles and two pools",
    "`app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS`",
    "`app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS`",
    "Do not use a `SECURITY DEFINER` role-switch bridge.",
    "Owner and migrator roles remain maintenance-only.",
    "bootstrap DML is exactly allowlisted",
    "pnpm run smoke:saas-c0-locked-topology",
    "No app pool provider changes.",
  ]);

  requireFragments(files.smoke, loaded.smoke, [
    "const staffLoginRole = \"app_runtime_staff_login\";",
    "const nonstaffLoginRole = \"app_runtime_nonstaff_login\";",
    "LOGIN NOINHERIT NOBYPASSRLS",
    "GRANT app_staff TO app_runtime_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;",
    "GRANT app_patient TO app_runtime_nonstaff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;",
    "NOT pg_has_role('app_runtime_staff_login', 'app_patient', 'MEMBER')",
    "NOT pg_has_role('app_runtime_nonstaff_login', 'app_staff', 'MEMBER')",
    "SET ROLE app_staff;",
    "SET ROLE app_patient;",
    "expectSetRoleRejected(\"c0_owner_role\"",
    "expectSetRoleRejected(\"c0_migrator_role\"",
    "c0_bootstrap_allowed",
    "c0_scoped_denied",
    "sanitizedChildEnv",
    "DATABASE_URL",
    "test-patient-identity-capability-gate.sql",
    "patient_identity_runtime_login_role",
  ]);

  forbidFragments(files.smoke, loaded.smoke, [
    "process.env.DATABASE_URL",
    "process.env.PGDATABASE",
    "SECURITY DEFINER",
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const scripts = packageJson.scripts ?? {};
  if (
    scripts["check:saas-c0-locked-topology"] !==
    "node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-c0-locked-topology-contract.mjs && node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-c0-locked-topology.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c0-locked-topology-contract.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c0-locked-topology-contract.mjs --self-test"
  ) {
    fail("package.json has an unexpected check:saas-c0-locked-topology script");
  }
  if (scripts["smoke:saas-c0-locked-topology"] !== "node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-c0-locked-topology.mjs") {
    fail("package.json has an unexpected smoke:saas-c0-locked-topology script");
  }
}

if (process.argv.includes("--self-test")) {
  const smoke = read(files.smoke).replace(
    "NOT pg_has_role('app_runtime_staff_login', 'app_patient', 'MEMBER')",
    "pg_has_role('app_runtime_staff_login', 'app_patient', 'MEMBER')",
  );
  try {
    runChecks({ smoke });
  } catch {
    console.log("check-c0-locked-topology-contract self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect a broken staff/nonstaff membership assertion");
}

try {
  runChecks();
  console.log("check-c0-locked-topology-contract: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-c0-locked-topology-contract: ${message}`);
  process.exit(1);
}
