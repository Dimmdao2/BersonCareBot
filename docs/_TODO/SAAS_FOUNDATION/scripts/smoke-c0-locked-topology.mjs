#!/usr/bin/env node
/**
 * C0 locked topology proof.
 *
 * Scratch-only proof for the Tenant Hard Mode decision: two runtime login roles and two pools.
 * Creates a private local PostgreSQL cluster under /tmp, applies the real P0.5b app_staff/app_patient
 * role-wall SQL, proves the C0 runtime login membership boundaries, and removes the cluster.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const pgBinDir = "/usr/lib/postgresql/16/bin";
const roleWallSql = path.join(repoRoot, "deploy/postgres/p0-5b-role-split-staff-patient.sql");
const protectedContextSql = path.join(repoRoot, "deploy/postgres/p2-b-protected-principal-context.sql");
const isolationDiagnosticsSql = path.join(
  repoRoot,
  "apps/webapp/db/drizzle-migrations/0185_saas_isolation_diagnostics.sql",
);
const patientIdentitySql = path.join(
  repoRoot,
  "apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql",
);
const patientIdentityGateSql = path.join(
  repoRoot,
  "deploy/postgres/test-patient-identity-capability-gate.sql",
);

const scratchSuffix = `p${process.pid}_${randomBytes(4).toString("hex")}`.toLowerCase();
const dbName = `bcb_saas_c0_topology_scratch_${scratchSuffix}`;
const tempClusterRoot = `/tmp/${dbName}_pg`;
const tempClusterDataDir = path.join(tempClusterRoot, "data");
const tempClusterSocketDir = path.join(tempClusterRoot, "socket");
const tempClusterPort = String(56432 + (process.pid % 1000));

const staffLoginRole = "app_runtime_staff_login";
const nonstaffLoginRole = "app_runtime_nonstaff_login";

assertSafeScratchName(dbName);
installSignalCleanup();

function assertSafeScratchName(name) {
  if (!/^bcb_saas_[a-z0-9_]+_scratch_[a-z0-9_]+$/.test(name)) {
    throw new Error(`refusing unsafe scratch resource name: ${name}`);
  }
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(name.toLowerCase())) {
    throw new Error(`refusing prod/test/dev-shaped scratch resource name: ${name}`);
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPASSWORD",
    "PGPASSFILE",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGUSER",
  ]) {
    delete env[key];
  }
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed with ${result.status ?? "unknown status"}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function safeRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function psql(args, input, label) {
  run(path.join(pgBinDir, "psql"), [
    "-h",
    tempClusterSocketDir,
    "-p",
    tempClusterPort,
    "-v",
    "ON_ERROR_STOP=1",
    ...args,
  ], { input, label });
}

function psqlExpectFailure(args, input, label) {
  const result = spawnSync(path.join(pgBinDir, "psql"), [
    "-h",
    tempClusterSocketDir,
    "-p",
    tempClusterPort,
    "-v",
    "ON_ERROR_STOP=1",
    ...args,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.status === 0) throw new Error(`${label} unexpectedly succeeded`);
}

function psqlSuper(sql, { database = dbName, label = "psql superuser" } = {}) {
  psql(["-d", database], sql, label);
}

function psqlRole(role, sql, { label = `psql as ${role}` } = {}) {
  psql(["-U", role, "-d", dbName], sql, label);
}

function fatal(assertionVar, message) {
  return [
    `\\if :${assertionVar}`,
    "\\else",
    `\\echo 'FATAL: ${message}'`,
    "SELECT 1/0;",
    "\\endif",
  ].join("\n");
}

function expectSetRoleRejected(roleName, label) {
  return String.raw`
\set ON_ERROR_STOP off
SET ROLE ${roleName};
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: ${label} rejected SET ROLE ${roleName}.'
\else
\echo 'FATAL: ${label} unexpectedly SET ROLE ${roleName}.'
SELECT 1/0;
\endif
`;
}

function createPrivateCluster() {
  mkdirSync(tempClusterDataDir, { recursive: true });
  mkdirSync(tempClusterSocketDir, { recursive: true });
  run(path.join(pgBinDir, "initdb"), ["-D", tempClusterDataDir, "-A", "trust", "--no-locale"]);
  run(path.join(pgBinDir, "pg_ctl"), [
    "-D",
    tempClusterDataDir,
    "-o",
    `-k ${tempClusterSocketDir} -p ${tempClusterPort} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  run(path.join(pgBinDir, "createdb"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, dbName]);
}

function cleanupPrivateCluster() {
  safeRun(path.join(pgBinDir, "pg_ctl"), ["-D", tempClusterDataDir, "-m", "fast", "-w", "stop"]);
  if (tempClusterRoot.startsWith("/tmp/bcb_saas_")) {
    rmSync(tempClusterRoot, { force: true, recursive: true });
  }
}

function installSignalCleanup() {
  process.once("SIGINT", () => {
    cleanupPrivateCluster();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanupPrivateCluster();
    process.exit(143);
  });
}

const c0SetupSql = String.raw`
CREATE ROLE c0_owner_role NOLOGIN NOBYPASSRLS;
CREATE ROLE c0_migrator_role LOGIN NOINHERIT BYPASSRLS;
CREATE ROLE app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS;

GRANT app_staff TO app_runtime_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT app_patient TO app_runtime_nonstaff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
REVOKE app_patient FROM app_runtime_staff_login;
REVOKE app_staff FROM app_runtime_nonstaff_login;
REVOKE c0_owner_role FROM app_runtime_staff_login, app_runtime_nonstaff_login;
REVOKE c0_migrator_role FROM app_runtime_staff_login, app_runtime_nonstaff_login;

CREATE SCHEMA app;
CREATE OR REPLACE FUNCTION app.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT pg_has_role(current_user, 'app_staff', 'MEMBER');
$$;
ALTER FUNCTION app.is_staff() OWNER TO c0_owner_role;

GRANT USAGE ON SCHEMA app TO app_staff, app_patient, app_runtime_staff_login, app_runtime_nonstaff_login;
GRANT EXECUTE ON FUNCTION app.is_staff() TO app_staff, app_patient, app_runtime_staff_login, app_runtime_nonstaff_login;

CREATE TABLE public.c0_bootstrap_allowed (
  id integer PRIMARY KEY,
  label text NOT NULL
);

CREATE TABLE public.c0_scoped_denied (
  id integer PRIMARY KEY,
  label text NOT NULL
);

GRANT USAGE ON SCHEMA public TO app_staff, app_patient, app_runtime_nonstaff_login, app_runtime_staff_login;
GRANT SELECT ON public.c0_scoped_denied TO app_staff, app_patient;
GRANT SELECT, INSERT ON public.c0_bootstrap_allowed TO app_runtime_nonstaff_login;
`;

const c0SuperAssertionsSql = String.raw`
SELECT (
  count(*) = 2
  AND bool_and(rolcanlogin)
  AND bool_and(NOT rolinherit)
  AND bool_and(NOT rolsuper)
  AND bool_and(NOT rolcreatedb)
  AND bool_and(NOT rolcreaterole)
  AND bool_and(NOT rolreplication)
  AND bool_and(NOT rolbypassrls)
)::int AS c0_runtime_login_roles_safe
FROM pg_roles
WHERE rolname IN ('app_runtime_staff_login', 'app_runtime_nonstaff_login') \gset
${fatal("c0_runtime_login_roles_safe", "C0 runtime login roles must be LOGIN NOINHERIT NOBYPASSRLS and non-superuser")}

SELECT (
  pg_has_role('app_runtime_staff_login', 'app_staff', 'MEMBER')
  AND NOT pg_has_role('app_runtime_staff_login', 'app_patient', 'MEMBER')
)::int AS c0_staff_membership_exact \gset
${fatal("c0_staff_membership_exact", "app_runtime_staff_login must be member only of app_staff")}

SELECT (
  pg_has_role('app_runtime_nonstaff_login', 'app_patient', 'MEMBER')
  AND NOT pg_has_role('app_runtime_nonstaff_login', 'app_staff', 'MEMBER')
)::int AS c0_nonstaff_membership_exact \gset
${fatal("c0_nonstaff_membership_exact", "app_runtime_nonstaff_login must be member only of app_patient")}

SELECT (
  NOT pg_has_role('app_runtime_staff_login', 'c0_owner_role', 'MEMBER')
  AND NOT pg_has_role('app_runtime_staff_login', 'c0_migrator_role', 'MEMBER')
  AND NOT pg_has_role('app_runtime_nonstaff_login', 'c0_owner_role', 'MEMBER')
  AND NOT pg_has_role('app_runtime_nonstaff_login', 'c0_migrator_role', 'MEMBER')
)::int AS c0_no_maintenance_membership \gset
${fatal("c0_no_maintenance_membership", "runtime login roles must not be members of owner/migrator roles")}
`;

const patientIdentityFixtureSql = String.raw`
CREATE TABLE public.system_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY,
  phone_normalized text
);
CREATE TABLE public.user_channel_bindings (
  user_id uuid NOT NULL,
  channel_code text NOT NULL,
  external_id text NOT NULL
);
CREATE TABLE public.org_enrollments (
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  status text NOT NULL
);
INSERT INTO public.system_settings(key, scope, organization_id, value_json) VALUES
  ('test_account_identifiers', 'admin', NULL,
   '{"value":{"phones":["+75550000101","+75550000201"],"telegramIds":[],"maxIds":[]}}');
INSERT INTO public.platform_users(id, phone_normalized) VALUES
  ('53000000-0000-4000-8000-00000000a101', '+75550000101'),
  ('53000000-0000-4000-8000-00000000a201', '+75550000201'),
  ('53000000-0000-4000-8000-00000000a102', '+75550000102');
INSERT INTO public.org_enrollments(organization_id, platform_user_id, status) VALUES
  ('53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a101', 'active'),
  ('53000000-0000-4000-8000-0000000000b1', '53000000-0000-4000-8000-00000000a201', 'active'),
  ('53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a102', 'active');
`;

const staffConnectionProofSql = String.raw`
SELECT (current_user = 'app_runtime_staff_login')::int AS c0_staff_base_user \gset
${fatal("c0_staff_base_user", "staff connection must authenticate as app_runtime_staff_login")}

SELECT (app.is_staff() = true)::int AS c0_staff_base_is_staff \gset
${fatal("c0_staff_base_is_staff", "staff connection must be staff by membership")}

SET ROLE app_staff;
SELECT (current_user = 'app_staff' AND app.is_staff() = true)::int AS c0_staff_set_role_ok \gset
${fatal("c0_staff_set_role_ok", "staff connection must SET ROLE app_staff and remain staff")}
RESET ROLE;

${expectSetRoleRejected("app_patient", "staff runtime login")}
${expectSetRoleRejected("c0_owner_role", "staff runtime login")}
${expectSetRoleRejected("c0_migrator_role", "staff runtime login")}
`;

const nonstaffConnectionProofSql = String.raw`
SELECT (current_user = 'app_runtime_nonstaff_login')::int AS c0_nonstaff_base_user \gset
${fatal("c0_nonstaff_base_user", "nonstaff connection must authenticate as app_runtime_nonstaff_login")}

SELECT (app.is_staff() = false)::int AS c0_nonstaff_base_not_staff \gset
${fatal("c0_nonstaff_base_not_staff", "nonstaff base login must not be staff before SET ROLE")}

SET ROLE app_patient;
SELECT (current_user = 'app_patient' AND app.is_staff() = false)::int AS c0_nonstaff_set_role_ok \gset
${fatal("c0_nonstaff_set_role_ok", "nonstaff connection must SET ROLE app_patient and remain nonstaff")}
RESET ROLE;

SELECT (current_user = 'app_runtime_nonstaff_login' AND app.is_staff() = false)::int AS c0_nonstaff_reset_not_staff \gset
${fatal("c0_nonstaff_reset_not_staff", "bootstrap/nonstaff base login must be nonstaff after RESET ROLE")}

${expectSetRoleRejected("app_staff", "nonstaff runtime login")}
${expectSetRoleRejected("c0_owner_role", "nonstaff runtime login")}
${expectSetRoleRejected("c0_migrator_role", "nonstaff runtime login")}

INSERT INTO public.c0_bootstrap_allowed (id, label) VALUES (1, 'bootstrap-ok');
SELECT (count(*) = 1)::int AS c0_bootstrap_insert_ok FROM public.c0_bootstrap_allowed \gset
${fatal("c0_bootstrap_insert_ok", "nonstaff base login must be able to use exactly allowlisted bootstrap INSERT/SELECT")}

\set ON_ERROR_STOP off
UPDATE public.c0_bootstrap_allowed SET label = 'unexpected-update' WHERE id = 1;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: bootstrap base denied non-allowlisted UPDATE.'
\else
\echo 'FATAL: bootstrap base unexpectedly updated bootstrap allowlist table.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
DELETE FROM public.c0_bootstrap_allowed WHERE id = 1;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: bootstrap base denied non-allowlisted DELETE.'
\else
\echo 'FATAL: bootstrap base unexpectedly deleted from bootstrap allowlist table.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.c0_scoped_denied (id, label) VALUES (1, 'must-fail');
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: bootstrap base denied scoped-table INSERT.'
\else
\echo 'FATAL: bootstrap base unexpectedly inserted into scoped table.'
SELECT 1/0;
\endif
`;

try {
  createPrivateCluster();
  console.log("--- c0: applying real P0.5b app_staff/app_patient role wall SQL ---");
  psqlSuper(`\\i ${roleWallSql}`, {
    database: dbName,
    label: "apply deploy/postgres/p0-5b-role-split-staff-patient.sql",
  });

  console.log("--- c0: installing runtime login roles and bootstrap allowlist fixture ---");
  psqlSuper(c0SetupSql, { label: "install C0 runtime topology fixture" });

  console.log("--- c0: proving catalog role invariants ---");
  psqlSuper(c0SuperAssertionsSql, { label: "prove C0 catalog role invariants" });

  console.log("--- c0: proving staff runtime login wall ---");
  psqlRole(staffLoginRole, staffConnectionProofSql, { label: "prove staff runtime login" });

  console.log("--- c0: proving nonstaff/bootstrap runtime login wall ---");
  psqlRole(nonstaffLoginRole, nonstaffConnectionProofSql, { label: "prove nonstaff runtime login" });

  console.log("--- c0: reproducing protected-context -> E1 capability -> fixture -> locked gate order ---");
  psqlSuper(`
    \\set p2_b_owner_role c0_owner_role
    \\set p2_b_staff_role app_staff
    \\set p2_b_patient_role app_patient
    \\set p2_b_signing_secret c0-scratch-signing-secret-at-least-32-characters
    CREATE SCHEMA IF NOT EXISTS app_ext;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA app_ext;
    GRANT USAGE ON SCHEMA app_ext TO c0_owner_role;
    \\i ${protectedContextSql}
    \\i ${isolationDiagnosticsSql}
    ${patientIdentityFixtureSql}
    \\i ${patientIdentitySql}
    GRANT SELECT ON TABLE public.system_settings, public.platform_users,
      public.user_channel_bindings, public.org_enrollments TO c0_owner_role;
    ALTER FUNCTION app.is_current_patient_test_account() OWNER TO c0_owner_role;
    REVOKE ALL ON FUNCTION app.is_current_patient_test_account() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.is_current_patient_test_account() TO app_patient;
  `, { label: "install protected E1 patient identity capability fixture" });
  const gateProof = readFileSync(patientIdentityGateSql, "utf8")
    .replace(
      "current_database() = 'bersoncarebot_test'",
      `current_database() = '${dbName}'`,
    );
  console.log("--- c0: proving canonical gate rejects authority reachable through app_patient ---");
  psqlSuper("GRANT c0_owner_role TO app_patient WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;", {
    label: "install forbidden transitive app_patient membership",
  });
  psqlExpectFailure(
    ["-d", dbName],
    `\\set patient_identity_runtime_login_role ${nonstaffLoginRole}\n${gateProof}`,
    "canonical patient identity gate with forbidden transitive membership",
  );
  psqlSuper("REVOKE c0_owner_role FROM app_patient;", {
    label: "remove forbidden transitive app_patient membership",
  });
  psqlSuper(`\\set patient_identity_runtime_login_role ${nonstaffLoginRole}\n${gateProof}`, {
    label: "prove canonical patient identity capability gate under locked runtime topology",
  });

  console.log(`smoke-c0-locked-topology: OK (${dbName})`);
} finally {
  cleanupPrivateCluster();
}
