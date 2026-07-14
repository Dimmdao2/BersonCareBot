#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const scriptPath = "docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs";

function usage() {
  return [
    "Usage:",
    `  node ${scriptPath}`,
    `  node ${scriptPath} --self-test`,
    `  node ${scriptPath} --print-sql`,
    `  node ${scriptPath} --execute --database-url='<disposable-fresh-copy-runtime-url>'`,
    "",
    "Safety: execution refuses prod/test/dev-shaped DB names and requires scratch/rehearsal/copy in the DB name.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    printSql: false,
    execute: false,
    databaseUrl: null,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--self-test") {
      options.selfTest = true;
      continue;
    }
    if (arg === "--print-sql") {
      options.printSql = true;
      continue;
    }
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg.startsWith("--database-url=")) {
      options.databaseUrl = arg.slice("--database-url=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

function unsafeDbNameReason(name) {
  const normalized = name.toLowerCase();
  const forbiddenExact = new Set([
    "bcb_webapp_prod",
    "bcb_webapp_test",
    "bcb_webapp_dev",
    "bersoncarebot",
    "bersoncarebot_prod",
    "bersoncarebot_test",
    "bersoncarebot_dev",
    "production",
    "prod",
    "test",
    "dev",
  ]);

  if (!normalized) return "empty database name";
  if (forbiddenExact.has(normalized)) return `forbidden database name ${name}`;
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    return `prod/test/dev-shaped database name ${name}`;
  }
  if (!/(^|[_-])(scratch|rehearsal|copy)([_-]|$)/.test(normalized)) {
    return `database name must include scratch/rehearsal/copy, got ${name}`;
  }
  return null;
}

function assertSafeDatabaseUrl(databaseUrl) {
  assert(databaseUrl, "execution requires --database-url");
  const dbName = databaseNameFromUrl(databaseUrl);
  assert(dbName, "could not parse database name from URL");
  const reason = unsafeDbNameReason(dbName);
  assert(!reason, reason);
}

function buildSql() {
  return String.raw`
WITH constants AS (
  SELECT
    '+79643805480'::text AS doctor_phone,
    '+79189000782'::text AS client_phone,
    'dimmdao@yandex.ru'::text AS doctor_email,
    'dimmdao@gmail.com'::text AS admin_email,
    'a0000000-0000-4000-8000-000000000001'::uuid AS expected_org_id
),
doctor_live AS (
  SELECT pu.id, pu.role, pu.email_normalized, pu.is_archived
  FROM public.platform_users pu, constants c
  WHERE pu.phone_normalized = c.doctor_phone AND pu.merged_into_id IS NULL
),
gmail_admin AS (
  SELECT pu.id, pu.role, pu.email_normalized, pu.is_archived
  FROM public.platform_users pu, constants c
  WHERE pu.email_normalized = c.admin_email AND pu.role = 'admin' AND pu.merged_into_id IS NULL
),
active_admins AS (
  SELECT pu.id
  FROM public.platform_users pu
  WHERE pu.role = 'admin' AND pu.merged_into_id IS NULL AND pu.is_archived IS FALSE
),
doctor_memberships AS (
  SELECT m.role, m.status, m.organization_id, m.specialist_id
  FROM public.be_organization_members m
  JOIN doctor_live d ON d.id = m.platform_user_id
),
admin_memberships AS (
  SELECT m.role, m.status, m.organization_id, m.specialist_id
  FROM public.be_organization_members m
  JOIN gmail_admin a ON a.id = m.platform_user_id
),
admin_phone_setting AS (
  SELECT value_json
  FROM public.system_settings
  WHERE key = 'admin_phones' AND scope = 'admin' AND organization_id IS NULL
  LIMIT 1
),
facts AS (
  SELECT jsonb_build_object(
    'doctorLiveRows', (SELECT count(*) FROM doctor_live),
    'doctorRoleOk', EXISTS (
      SELECT 1 FROM doctor_live d, constants c
      WHERE d.role = 'doctor' AND d.email_normalized = c.doctor_email AND d.is_archived IS FALSE
    ),
    'doctorActiveMemberships', (
      SELECT count(*) FROM doctor_memberships m, constants c
      WHERE m.role = 'doctor' AND m.status = 'active' AND m.organization_id = c.expected_org_id AND m.specialist_id IS NOT NULL
    ),
    'activeAdminRows', (SELECT count(*) FROM active_admins),
    'gmailAdminRows', (SELECT count(*) FROM gmail_admin WHERE is_archived IS FALSE),
    'adminActiveMemberships', (
      SELECT count(*) FROM admin_memberships m, constants c
      WHERE m.role = 'admin' AND m.status = 'active' AND m.organization_id = c.expected_org_id AND m.specialist_id IS NULL
    ),
    'clientHasDoctorEmail', EXISTS (
      SELECT 1 FROM public.platform_users pu, constants c
      WHERE pu.phone_normalized = c.client_phone AND pu.merged_into_id IS NULL AND pu.email_normalized = c.doctor_email
    ),
    'adminPhonesGlobalValue', COALESCE((SELECT value_json FROM admin_phone_setting), 'null'::jsonb)
  ) AS value
)
SELECT value::text FROM facts;
`;
}

function classifyFacts(facts) {
  const failures = [];

  if (facts.doctorLiveRows !== 1) failures.push("doctor_phone_live_row_count");
  if (facts.clientHasDoctorEmail === true) failures.push("client_still_holds_doctor_email");
  if (facts.doctorRoleOk !== true) failures.push("data_fix_not_applied_or_partial");
  if (facts.activeAdminRows !== 1 || facts.gmailAdminRows !== 1) failures.push("admin_shape_not_normalized");
  if (facts.doctorActiveMemberships !== 1) failures.push("doctor_membership_missing_or_wrong");
  if (facts.adminActiveMemberships !== 1) failures.push("admin_membership_missing_or_wrong");

  const ok = failures.length === 0;
  return {
    ok,
    failureReasons: failures,
    nextDiagnosis: ok
      ? "db_identity_shape_ok_run_a1_doctor_admin_smoke_to_check_session_or_route_failure"
      : "fix_datafix_or_membership_seed_before_app_smoke",
  };
}

function parsePsqlJson(stdout) {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert(lines.length > 0, "psql returned no JSON facts");
  return JSON.parse(lines.at(-1));
}

function runPsql(databaseUrl) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--no-align", "--tuples-only"], {
    input: buildSql(),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`failed to start psql: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`psql failed with status ${result.status ?? "unknown"}: ${result.stderr.trim()}`);
  }
  return parsePsqlJson(result.stdout);
}

function validateContract() {
  const sql = buildSql();
  for (const needle of [
    "doctorLiveRows",
    "doctorRoleOk",
    "doctorActiveMemberships",
    "activeAdminRows",
    "gmailAdminRows",
    "adminActiveMemberships",
    "clientHasDoctorEmail",
    "adminPhonesGlobalValue",
  ]) {
    assert(sql.includes(needle), `SQL missing ${needle}`);
  }
}

function runSelfTest() {
  validateContract();

  assert(unsafeDbNameReason("bcb_webapp_prod"), "self-test expected prod DB refusal");
  assert(unsafeDbNameReason("bersoncarebot_test"), "self-test expected test DB refusal");
  assert(unsafeDbNameReason("bcb_webapp_dev"), "self-test expected dev DB refusal");
  assert(!unsafeDbNameReason("bcb_saas_rehearsal_20260714"), "self-test expected rehearsal DB allow");
  assert(!unsafeDbNameReason("bcb_saas_scratch_b1"), "self-test expected scratch DB allow");

  const okFacts = {
    doctorLiveRows: 1,
    doctorRoleOk: true,
    doctorActiveMemberships: 1,
    activeAdminRows: 1,
    gmailAdminRows: 1,
    adminActiveMemberships: 1,
    clientHasDoctorEmail: false,
    adminPhonesGlobalValue: { value: [] },
  };
  assert(classifyFacts(okFacts).ok, "self-test expected ok facts to pass");

  const badFacts = { ...okFacts, doctorRoleOk: false, doctorActiveMemberships: 0 };
  const classified = classifyFacts(badFacts);
  assert(!classified.ok, "self-test expected bad facts to fail");
  assert(
    classified.failureReasons.includes("data_fix_not_applied_or_partial") &&
      classified.failureReasons.includes("doctor_membership_missing_or_wrong"),
    "self-test expected data-fix and membership failure reasons",
  );

  console.log("check-b1-doctor-admin-identity self-test: OK");
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
  } else if (options.printSql) {
    validateContract();
    console.log(buildSql());
  } else if (options.execute) {
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    assertSafeDatabaseUrl(databaseUrl);
    const facts = runPsql(databaseUrl);
    const classification = classifyFacts(facts);
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          phase: "B1",
          checkedAt: new Date().toISOString(),
          facts,
          classification,
        },
        null,
        2,
      ),
    );
    if (!classification.ok) process.exit(1);
  } else {
    validateContract();
    console.log("check-b1-doctor-admin-identity contract: OK");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-b1-doctor-admin-identity: ${message}`);
  process.exit(1);
}
