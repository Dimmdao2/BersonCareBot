#!/usr/bin/env node
/**
 * Live multitenant isolation rehearsal.
 *
 * Full host mode restores the newest production dump into a disposable
 * bcb_saas_multitenant_rehearsal_* database, runs the SaaS 667 chain, flips the
 * locked helper policies to enforce+FORCE, seeds a second clinic and multi-org
 * patients, then proves the staff and patient walls through packages/db-principal.
 *
 * Sandbox mode (`--synthetic`) uses the same runtime principal proof on a minimal
 * temp-cluster subset when host sudo/prod dumps are unavailable.
 */

import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const dbPrincipalPackagePath = path.join(repoRoot, "packages/db-principal");
const dbPrincipalRuntimePath = path.join(repoRoot, "packages/db-principal/dist/index.js");
const p2bSqlPath = path.join(repoRoot, "deploy/postgres/p2-b-protected-principal-context.sql");
const phase4PolicySqlPath = path.join(repoRoot, "deploy/postgres/phase4-locked-helper-rls-policies.sql");
const phase4ForceSqlPath = path.join(repoRoot, "deploy/postgres/phase4-force-rls-cutover.sql");
const deploySaas667Path = path.join(repoRoot, "scripts/deploy-saas-667.sh");
const pgBinDir = "/usr/lib/postgresql/16/bin";
const defaultOrgId = "a0000000-0000-4000-8000-000000000001";

const requireFromWebapp = createRequire(path.join(repoRoot, "apps/webapp/package.json"));
const { Client } = requireFromWebapp("pg");

const args = new Set(process.argv.slice(2));
const syntheticMode = args.has("--synthetic");
if (args.has("--help")) {
  console.log(`Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-multitenant-isolation.mjs
  node docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-multitenant-isolation.mjs --synthetic

Full host mode requires:
  sudo -n -u postgres access on the host

Optional:
  REHEARSAL_DUMP_DIR=/opt/backups/postgres/hourly`);
  process.exit(0);
}

const stamp = `${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}_p${process.pid}_${randomBytes(3).toString("hex")}`;
const resourceKind = syntheticMode ? "scratch" : "rehearsal";
const dbName = `bcb_saas_multitenant_${resourceKind}_${stamp}`;
const appOwnerRole = syntheticMode ? `bcb_saas_multitenant_owner_scratch_${stamp}` : "app_owner";
const fullOwnerRole = `bcb_saas_mt_owner_rehearsal_${stamp}`;
const fullSuperuserRole = `bcb_saas_mt_su_rehearsal_${stamp}`;
const staffLoginRole = `bcb_saas_multitenant_staff_scratch_${stamp}`;
const patientLoginRole = `bcb_saas_multitenant_patient_scratch_${stamp}`;
const fullOwnerPassword = randomBytes(32).toString("hex");
const fullSuperuserPassword = randomBytes(32).toString("hex");
const staffPassword = randomBytes(32).toString("base64url");
const patientPassword = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(32).toString("hex");
const marker = `mt_iso_${stamp}`;
const tempClusterRoot = `/tmp/${dbName}_pg`;
const tempClusterDataDir = path.join(tempClusterRoot, "data");
const tempClusterSocketDir = path.join(tempClusterRoot, "socket");
const tempClusterPort = String(55432 + (process.pid % 1000));

let pgHarness = null;
let cleanupStarted = false;
let proofApi = null;
let fullSuperuserUrl = null;
let fullOwnerUrl = null;
let fullScratchStaffUrl = null;
let fullScratchPatientUrl = null;
let latestDumpPath = null;
let fullPreexistingAppStaff = null;
let fullPreexistingAppPatient = null;

for (const name of [dbName, staffLoginRole, patientLoginRole, fullOwnerRole, fullSuperuserRole]) {
  assertSafeDisposableName(name);
}
if (syntheticMode) assertSafeDisposableName(appOwnerRole);

installSignalCleanup();

main().catch((error) => {
  console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  try {
    run("pnpm", ["--dir", dbPrincipalPackagePath, "run", "build"], {
      label: "pnpm --dir packages/db-principal run build",
    });
    proofApi = await import(`${pathToFileURL(dbPrincipalRuntimePath).href}?rehearsal=${Date.now()}`);

    if (syntheticMode) {
      createTempClusterScratchDb();
      installSyntheticSchemaAndRls();
      createScratchLoginRoles();
    } else {
      prepareFullModeRolesAndUrls();
      restoreNewestProdDump();
      runDeploy667Chain();
      createScratchLoginRoles();
      proveLegacyDormantCompatibility();
      applyStrictLockedForceCutover();
    }

    const seed = await seedRehearsalData();
    const matrix = await proveIsolation(seed);
    printFinalMatrix(seed, matrix);
    console.log(`CONFIRMED: multitenant isolation rehearsal completed on ${dbName}.`);
  } finally {
    await cleanupScratchResources();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSafeDisposableName(name) {
  if (!/^bcb_saas_[a-z0-9_]+_(scratch|rehearsal)_[a-z0-9_]+$/.test(name)) {
    throw new Error(`refusing unsafe disposable resource name: ${name}`);
  }
  const normalized = name.toLowerCase();
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    throw new Error(`refusing prod/test/dev-shaped disposable resource name: ${name}`);
  }
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? sanitizedChildEnv(),
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
  });
  if (result.error) {
    throw new Error(`${options.label ?? command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? command} failed with status ${result.status ?? "unknown"}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function runCaptured(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? sanitizedChildEnv(),
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`${options.label ?? command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? command} failed with status ${result.status ?? "unknown"}`);
  }
  return result;
}

function runResult(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? sanitizedChildEnv(),
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
}

function safeRun(command, commandArgs, options = {}) {
  const result = runResult(command, commandArgs, options);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function sanitizedChildEnv(extra = {}) {
  const env = { ...process.env, ...extra };
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
    "SUPERUSER_URL",
    "REHEARSAL_SUPERUSER_URL",
    "REHEARSAL_OWNER_URL",
  ]) {
    if (!(key in extra)) delete env[key];
  }
  return env;
}

function createTempClusterScratchDb() {
  console.log("--- synthetic: starting private /tmp PostgreSQL cluster ---");
  run("mkdir", ["-p", tempClusterDataDir, tempClusterSocketDir]);
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
  pgHarness = { kind: "temp" };
}

function prepareFullModeRolesAndUrls() {
  console.log("--- full: creating throwaway owner and superuser roles ---");
  pgHarness = { kind: "host" };
  fullPreexistingAppStaff = postgresRoleExists("app_staff");
  fullPreexistingAppPatient = postgresRoleExists("app_patient");
  postgresPsql("postgres", `
CREATE ROLE ${quoteIdent(fullOwnerRole)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${quoteLiteral(fullOwnerPassword)};
CREATE ROLE ${quoteIdent(fullSuperuserRole)} LOGIN SUPERUSER PASSWORD ${quoteLiteral(fullSuperuserPassword)};
`);
  fullSuperuserUrl = buildLocalRoleUrl(dbName, fullSuperuserRole, fullSuperuserPassword);
  fullOwnerUrl = buildLocalRoleUrl(dbName, fullOwnerRole, fullOwnerPassword);
  fullScratchStaffUrl = buildLocalRoleUrl(dbName, staffLoginRole, staffPassword);
  fullScratchPatientUrl = buildLocalRoleUrl(dbName, patientLoginRole, patientPassword);
}

function buildLocalRoleUrl(databaseName, role, password) {
  const url = new URL(`postgresql://127.0.0.1:5432/${databaseName}`);
  url.username = role;
  url.password = password;
  return url.toString();
}

function restoreNewestProdDump() {
  console.log("--- full: restoring newest production dump into disposable rehearsal DB ---");
  assertSafeDisposableName(dbName);
  const dumpDir = process.env.REHEARSAL_DUMP_DIR ?? "/opt/backups/postgres/hourly";
  const findDump = [
    // no pipefail: `head -n 1` closes the pipe early and SIGPIPEs find/sort (exit 141)
    "set -eu",
    `find ${quoteShell(dumpDir)} -maxdepth 1 -type f \\( -name '*.dump' -o -name '*.sql' -o -name '*.sql.gz' \\) -printf '%T@ %p\\n' | sort -nr | head -n 1 | cut -d' ' -f2-`,
  ].join("\n");
  const dumpResult = runCaptured("sudo", ["-n", "-u", "postgres", "bash", "-lc", findDump], {
    label: "find newest production dump",
  });
  latestDumpPath = dumpResult.stdout.trim();
  if (!latestDumpPath) {
    throw new Error(`no production dump found in ${dumpDir}`);
  }
  console.log(`--- full: selected dump ${path.basename(latestDumpPath)} ---`);

  safeRun("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "createdb", "-O", fullOwnerRole, dbName], {
    label: "createdb rehearsal DB",
  });
  run("sudo", [
    "-n",
    "-u",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    dbName,
    "-c",
    "CREATE EXTENSION IF NOT EXISTS btree_gist;",
  ], {
    label: "pre-create btree_gist extension",
  });

  const setRoleSql = `SET ROLE ${quoteIdent(fullOwnerRole)};`;
  if (latestDumpPath.endsWith(".sql")) {
    run("sudo", [
      "-n",
      "-u",
      "postgres",
      "bash",
      "-lc",
      `{ printf '%s\\n' ${quoteShell(setRoleSql)}; cat ${quoteShell(latestDumpPath)}; } | psql -v ON_ERROR_STOP=1 -d ${quoteShell(dbName)}`,
    ], {
      label: "restore plain SQL dump",
    });
    return;
  }
  if (latestDumpPath.endsWith(".sql.gz")) {
    run("sudo", [
      "-n",
      "-u",
      "postgres",
      "bash",
      "-lc",
      `{ printf '%s\\n' ${quoteShell(setRoleSql)}; gzip -dc ${quoteShell(latestDumpPath)}; } | psql -v ON_ERROR_STOP=1 -d ${quoteShell(dbName)}`,
    ], {
      label: "restore gzipped SQL dump",
    });
    return;
  }
  run("sudo", [
    "-n",
    "-u",
    "postgres",
    "pg_restore",
    "--no-owner",
    `--role=${fullOwnerRole}`,
    "--no-acl",
    "-d",
    dbName,
    latestDumpPath,
  ], {
    label: "restore custom production dump",
  });
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function postgresPsql(databaseName, sql) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", databaseName], {
    input: sql,
    label: "sudo -u postgres psql (secrets redacted)",
  });
}

function postgresRoleExists(roleName) {
  const result = runCaptured("sudo", [
    "-n",
    "-u",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    "postgres",
    "-Atqc",
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(roleName)})::int`,
  ], {
    label: "check role existence",
  });
  return result.stdout.trim() === "1";
}

function runDeploy667Chain() {
  console.log("--- full: running deploy-saas-667 option-D chain on restored copy ---");
  const env = sanitizedChildEnv({
    SUPERUSER_URL: fullSuperuserUrl,
    DATABASE_URL: fullOwnerUrl,
    P2_B_SIGNING_SECRET: signingSecret,
    DB_PRINCIPAL_SIGNING_SECRET: signingSecret,
    API_ENV_FILE: "/nonexistent",
    WEBAPP_ENV_FILE: "/nonexistent",
    BOOKING_URL: "http://localhost:3000",
  });
  run("bash", [deploySaas667Path], {
    env,
    label: "scripts/deploy-saas-667.sh (URLs and signing secret redacted)",
  });

  psqlUrl(fullSuperuserUrl, `
GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(appOwnerRole)};
`);
}

function createScratchLoginRoles() {
  console.log("--- roles: creating disposable app login roles ---");
  const sql = `
DROP ROLE IF EXISTS ${quoteIdent(patientLoginRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffLoginRole)};
CREATE ROLE ${quoteIdent(staffLoginRole)} LOGIN NOINHERIT PASSWORD ${quoteLiteral(staffPassword)} NOBYPASSRLS;
CREATE ROLE ${quoteIdent(patientLoginRole)} LOGIN NOINHERIT PASSWORD ${quoteLiteral(patientPassword)} NOBYPASSRLS;
GRANT app_staff TO ${quoteIdent(staffLoginRole)};
GRANT app_patient TO ${quoteIdent(patientLoginRole)};
GRANT USAGE ON SCHEMA app TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)
  TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.current_org_id() TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.reset_principal_context() TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
GRANT EXECUTE ON FUNCTION app.is_staff() TO ${quoteIdent(staffLoginRole)}, ${quoteIdent(patientLoginRole)};
`;
  psqlAdmin(sql);
}

function installSyntheticSchemaAndRls() {
  console.log("--- synthetic: installing P2-B helpers and minimal policy subset ---");
  psqlAdmin(`
CREATE ROLE ${quoteIdent(appOwnerRole)} NOLOGIN NOBYPASSRLS;
CREATE ROLE app_staff NOLOGIN NOBYPASSRLS;
CREATE ROLE app_patient NOLOGIN NOBYPASSRLS;
`);
  psqlFile(p2bSqlPath, {
    p2_b_owner_role: appOwnerRole,
    p2_b_staff_role: "app_staff",
    p2_b_patient_role: "app_patient",
    p2_b_signing_secret: signingSecret,
  });
  psqlAdmin(`GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(appOwnerRole)};`);
  psqlAdmin(`
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA app_ext;

CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'client',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email_normalized text,
  email_verified_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  merged_into_id uuid
);

CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_specialists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  role text NOT NULL,
  specialist_id uuid REFERENCES public.be_specialists(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, platform_user_id)
);

CREATE TABLE public.org_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, platform_user_id)
);

CREATE TABLE public.specialist_signup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL UNIQUE,
  email_normalized text NOT NULL,
  organization_title text NOT NULL,
  specialist_full_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  provisioned_at timestamptz
);

CREATE TABLE public.be_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  specialist_id uuid REFERENCES public.be_specialists(id) ON DELETE SET NULL,
  platform_user_id uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  attribution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.treatment_program_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  assignment_source text NOT NULL
);

CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  integrator_conversation_id text NOT NULL UNIQUE,
  platform_user_id uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  source text NOT NULL,
  admin_scope text NOT NULL,
  status text NOT NULL,
  opened_at timestamptz NOT NULL,
  last_message_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  integrator_message_id text NOT NULL UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_role text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  text text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL
);

GRANT USAGE ON SCHEMA public TO app_staff, app_patient;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_staff, app_patient;

ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY mt_org_enrollments ON public.org_enrollments FOR SELECT TO app_staff, app_patient
USING ((app.is_staff() AND organization_id = app.current_org_id()) OR platform_user_id = app.current_patient_user_id());

ALTER TABLE public.be_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY mt_be_appointments ON public.be_appointments FOR SELECT TO app_staff, app_patient
USING ((app.is_staff() AND organization_id = app.current_org_id()) OR platform_user_id = app.current_patient_user_id());

ALTER TABLE public.treatment_program_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_program_instances FORCE ROW LEVEL SECURITY;
CREATE POLICY mt_tpi ON public.treatment_program_instances FOR SELECT TO app_staff, app_patient
USING ((app.is_staff() AND organization_id = app.current_org_id()) OR patient_user_id = app.current_patient_user_id());

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY mt_support_conv ON public.support_conversations FOR SELECT TO app_staff, app_patient
USING ((app.is_staff() AND organization_id = app.current_org_id()) OR platform_user_id = app.current_patient_user_id());

ALTER TABLE public.support_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversation_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY mt_support_msg ON public.support_conversation_messages FOR SELECT TO app_staff, app_patient
USING (
  (app.is_staff() AND organization_id = app.current_org_id())
  OR EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = conversation_id
      AND c.platform_user_id = app.current_patient_user_id()
  )
);
`);

  const s1User = randomUUID();
  const s1Specialist = randomUUID();
  const p1 = randomUUID();
  psqlAdmin(`
INSERT INTO public.be_organizations (id, title) VALUES (${quoteLiteral(defaultOrgId)}::uuid, 'Synthetic Clinic 1');
INSERT INTO public.platform_users (id, display_name, role, email_verified_at)
VALUES (${quoteLiteral(s1User)}::uuid, 'Synthetic S1', 'doctor', now()),
       (${quoteLiteral(p1)}::uuid, 'Synthetic P1', 'client', now());
INSERT INTO public.be_specialists (id, organization_id, full_name)
VALUES (${quoteLiteral(s1Specialist)}::uuid, ${quoteLiteral(defaultOrgId)}::uuid, 'Synthetic S1');
INSERT INTO public.be_organization_members (organization_id, platform_user_id, role, specialist_id, status)
VALUES (${quoteLiteral(defaultOrgId)}::uuid, ${quoteLiteral(s1User)}::uuid, 'owner', ${quoteLiteral(s1Specialist)}::uuid, 'active');
INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
VALUES (${quoteLiteral(defaultOrgId)}::uuid, ${quoteLiteral(p1)}::uuid, 'active');
`);
}

function proveLegacyDormantCompatibility() {
  console.log("--- full: applying dormant helper policies and proving legacy compatibility before strict flip ---");
  psqlUrlFile(fullOwnerUrl, phase4PolicySqlPath);
  const legacyUrl = fullScratchStaffUrl;
  const result = runCaptured("node", ["-e", `
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.CHECK_URL });
  await c.connect();
  await c.query("SET ROLE app_staff");
  const r = await c.query("SELECT count(*)::int AS count FROM public.org_enrollments WHERE organization_id = $1::uuid", [process.env.DEFAULT_ORG_ID]);
  await c.end();
  if (Number(r.rows[0].count) < 1) throw new Error("legacy dormant clinic #1 read returned no rows");
})().catch((e) => { console.error(e.message); process.exit(1); });
`], {
    env: sanitizedChildEnv({ CHECK_URL: legacyUrl, DEFAULT_ORG_ID: defaultOrgId }),
    label: "legacy dormant compatibility check",
  });
  if (result.stderr) process.stderr.write(result.stderr);
  console.log("CONFIRMED: legacy-guc/dormant compatibility still reads clinic #1 before strict flip.");
}

function applyStrictLockedForceCutover() {
  console.log("--- full: applying strict locked-helper policies and FORCE RLS cutover ---");
  psqlUrlFile(fullOwnerUrl, phase4PolicySqlPath, ["-v", "phase4_enforce_locked_context=1"]);
  psqlUrlFile(fullOwnerUrl, phase4ForceSqlPath);
}

async function seedRehearsalData() {
  console.log("--- seed: creating clinic B, S3, P2, P_SHARED, and controlled scoped rows ---");
  const client = makeAdminClient();
  await client.connect();
  try {
    const s1 = await fetchRequiredRow(client, `
      SELECT m.platform_user_id::text AS platform_user_id, m.specialist_id::text AS specialist_id
      FROM public.be_organization_members m
      JOIN public.be_specialists s ON s.id = m.specialist_id
      WHERE m.organization_id = $1::uuid
        AND m.status = 'active'
        AND s.is_active IS TRUE
      ORDER BY CASE WHEN m.role = 'owner' THEN 0 WHEN m.role = 'doctor' THEN 1 ELSE 2 END, m.created_at
      LIMIT 1
    `, [defaultOrgId], "clinic #1 active staff membership");

    const p1 = await fetchRequiredRow(client, `
      SELECT oe.platform_user_id::text AS platform_user_id
      FROM public.org_enrollments oe
      JOIN public.platform_users pu ON pu.id = oe.platform_user_id
      WHERE oe.organization_id = $1::uuid
        AND oe.status = 'active'
        AND pu.role = 'client'
        AND pu.merged_into_id IS NULL
        AND COALESCE(pu.is_archived, false) IS FALSE
      ORDER BY oe.created_at, oe.platform_user_id
      LIMIT 1
    `, [defaultOrgId], "clinic #1 existing patient");

    const ids = {
      orgB: randomUUID(),
      s2User: randomUUID(),
      s2Specialist: randomUUID(),
      s2Membership: randomUUID(),
      s2Intent: randomUUID(),
      s2Challenge: randomUUID(),
      s3User: randomUUID(),
      s3Specialist: randomUUID(),
      s3Membership: randomUUID(),
      p2: randomUUID(),
      pShared: randomUUID(),
    };

    await client.query("BEGIN");
    try {
      await client.query(`
        INSERT INTO public.platform_users (id, display_name, role, email_normalized, email_verified_at, created_at, updated_at)
        VALUES
          ($1::uuid, 'Rehearsal Specialist S2', 'client', $2, now(), now(), now()),
          ($3::uuid, 'Rehearsal Specialist S3', 'doctor', $4, now(), now(), now()),
          ($5::uuid, 'Rehearsal Patient P2', 'client', $6, now(), now(), now()),
          ($7::uuid, 'Rehearsal Patient Shared', 'client', $8, now(), now(), now())
      `, [
        ids.s2User,
        `${marker}.s2@example.invalid`,
        ids.s3User,
        `${marker}.s3@example.invalid`,
        ids.p2,
        `${marker}.p2@example.invalid`,
        ids.pShared,
        `${marker}.shared@example.invalid`,
      ]);

      await mirrorSpecialistOwnerProvisioning(client, ids);

      await client.query(`
        INSERT INTO public.be_specialists (id, organization_id, full_name, is_active, sort_order, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, 'Rehearsal Specialist S3', true, 1, now(), now())
      `, [ids.s3Specialist, ids.orgB]);
      await client.query(`
        INSERT INTO public.be_organization_members (id, organization_id, platform_user_id, role, specialist_id, status, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'doctor', $4::uuid, 'active', now(), now())
      `, [ids.s3Membership, ids.orgB, ids.s3User, ids.s3Specialist]);

      await client.query(`
        INSERT INTO public.org_enrollments (organization_id, platform_user_id, status, created_at)
        VALUES
          ($1::uuid, $2::uuid, 'active', now()),
          ($3::uuid, $4::uuid, 'active', now()),
          ($1::uuid, $4::uuid, 'active', now())
        ON CONFLICT (organization_id, platform_user_id) DO NOTHING
      `, [ids.orgB, ids.p2, defaultOrgId, ids.pShared]);

      await insertPatientRows(client, {
        orgId: defaultOrgId,
        patientId: p1.platform_user_id,
        specialistId: s1.specialist_id,
        assignedBy: s1.platform_user_id,
        label: "p1_org1",
      });
      await insertPatientRows(client, {
        orgId: defaultOrgId,
        patientId: ids.pShared,
        specialistId: s1.specialist_id,
        assignedBy: s1.platform_user_id,
        label: "shared_org1",
      });
      await insertPatientRows(client, {
        orgId: ids.orgB,
        patientId: ids.pShared,
        specialistId: ids.s2Specialist,
        assignedBy: ids.s2User,
        label: "shared_orgb",
      });
      await insertPatientRows(client, {
        orgId: ids.orgB,
        patientId: ids.p2,
        specialistId: ids.s3Specialist,
        assignedBy: ids.s3User,
        label: "p2_orgb_by_s3",
      });

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    return {
      marker,
      org1: defaultOrgId,
      orgB: ids.orgB,
      s1UserId: s1.platform_user_id,
      s1SpecialistId: s1.specialist_id,
      s2UserId: ids.s2User,
      s2SpecialistId: ids.s2Specialist,
      s3UserId: ids.s3User,
      s3SpecialistId: ids.s3Specialist,
      p1UserId: p1.platform_user_id,
      p2UserId: ids.p2,
      pSharedUserId: ids.pShared,
      seedApproach: "S2 owner provisioning mirrored exact OrganizationProvisioningService SQL; S3/P2/P_SHARED/enrollments/scoped rows mirrored documented SQL.",
    };
  } finally {
    await client.end();
  }
}

async function mirrorSpecialistOwnerProvisioning(client, ids) {
  await client.query(`
    INSERT INTO public.specialist_signup_intents (
      id,
      user_id,
      challenge_id,
      email_normalized,
      organization_title,
      specialist_full_name,
      status,
      created_at
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4,
      'Rehearsal Clinic B',
      'Rehearsal Specialist S2',
      'pending',
      now()
    )
  `, [ids.s2Intent, ids.s2User, ids.s2Challenge, `${marker}.s2@example.invalid`]);

  await client.query(`
    UPDATE public.platform_users
    SET role = 'doctor',
        display_name = 'Rehearsal Specialist S2',
        updated_at = now()
    WHERE id = $1::uuid
      AND merged_into_id IS NULL
      AND email_verified_at IS NOT NULL
  `, [ids.s2User]);

  await client.query(`
    INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
    VALUES ($1::uuid, 'Rehearsal Clinic B', true, 0, now(), now())
  `, [ids.orgB]);

  await client.query(`
    INSERT INTO public.be_specialists (id, organization_id, full_name, is_active, sort_order, created_at, updated_at)
    VALUES ($1::uuid, $2::uuid, 'Rehearsal Specialist S2', true, 0, now(), now())
  `, [ids.s2Specialist, ids.orgB]);

  await client.query(`
    INSERT INTO public.be_organization_members (
      id,
      organization_id,
      platform_user_id,
      role,
      specialist_id,
      status,
      created_at,
      updated_at
    )
    VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner', $4::uuid, 'active', now(), now())
  `, [ids.s2Membership, ids.orgB, ids.s2User, ids.s2Specialist]);

  await client.query(`
    UPDATE public.specialist_signup_intents
    SET status = 'provisioned',
        provisioned_organization_id = $2::uuid,
        provisioned_specialist_id = $3::uuid,
        provisioned_membership_id = $4::uuid,
        provisioned_at = now()
    WHERE id = $1::uuid
  `, [ids.s2Intent, ids.orgB, ids.s2Specialist, ids.s2Membership]);
}

async function insertPatientRows(client, input) {
  const appointmentId = randomUUID();
  const programId = randomUUID();
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const label = `${marker}:${input.label}`;
  await client.query(`
    INSERT INTO public.be_appointments (
      id,
      organization_id,
      specialist_id,
      platform_user_id,
      start_at,
      end_at,
      duration_minutes,
      source,
      status,
      attribution_json,
      created_at,
      updated_at
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4::uuid,
      now() + interval '30 days',
      now() + interval '30 days 45 minutes',
      45,
      'admin_manual',
      'confirmed',
      jsonb_build_object('rehearsal', $5::text),
      now(),
      now()
    )
  `, [appointmentId, input.orgId, input.specialistId, input.patientId, label]);
  await client.query(`
    INSERT INTO public.treatment_program_instances (
      id,
      organization_id,
      patient_user_id,
      assigned_by,
      title,
      status,
      created_at,
      updated_at,
      assignment_source
    )
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'completed', now(), now(), 'doctor')
  `, [programId, input.orgId, input.patientId, input.assignedBy, label]);
  await client.query(`
    INSERT INTO public.support_conversations (
      id,
      organization_id,
      integrator_conversation_id,
      platform_user_id,
      source,
      admin_scope,
      status,
      opened_at,
      last_message_at,
      created_at,
      updated_at
    )
    VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'webapp', 'support', 'open', now(), now(), now(), now())
  `, [conversationId, input.orgId, `${label}:conversation`, input.patientId]);
  await client.query(`
    INSERT INTO public.support_conversation_messages (
      id,
      organization_id,
      integrator_message_id,
      conversation_id,
      sender_role,
      message_type,
      text,
      source,
      created_at
    )
    VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'admin', 'text', $5, 'webapp', now())
  `, [messageId, input.orgId, `${label}:message`, conversationId, label]);
}

async function proveIsolation(seed) {
  console.log("--- prove: signed locked runtime principals under FORCE RLS ---");
  const matrix = {};

  matrix.s1 = await withActorClient("staff", async (client) => {
    await applyStaffPrincipal(client, seed.org1, seed.s1UserId);
    const counts = await readMatrixCounts(client, seed);
    assert(counts.org1Rows > 0, "staff S1 must see clinic #1 rehearsal rows");
    assert(counts.orgBRows === 0, "staff S1 must see ZERO clinic B rehearsal rows");
    return counts;
  });
  console.log("CONFIRMED: staff S1 sees clinic #1 rows and zero clinic B rows.");

  matrix.s2 = await withActorClient("staff", async (client) => {
    await applyStaffPrincipal(client, seed.orgB, seed.s2UserId);
    const counts = await readMatrixCounts(client, seed);
    assert(counts.orgBRows > 0, "staff S2 must see clinic B rehearsal rows");
    assert(counts.org1Rows === 0, "staff S2 must see ZERO clinic #1 rehearsal rows");
    assert(counts.s3Rows > 0, "staff S2 must see clinic B rows created for/through S3");
    return counts;
  });
  console.log("CONFIRMED: staff S2 sees clinic B org-wide rows, including S3 rows, and zero clinic #1 rows.");

  matrix.s3 = await withActorClient("staff", async (client) => {
    await applyStaffPrincipal(client, seed.orgB, seed.s3UserId);
    const counts = await readMatrixCounts(client, seed);
    assert(counts.orgBRows > 0, "staff S3 must see clinic B rehearsal rows");
    assert(counts.org1Rows === 0, "staff S3 must see ZERO clinic #1 rehearsal rows");
    assert(counts.s3Rows > 0, "staff S3 must see its own clinic B rows");
    return counts;
  });
  console.log("CONFIRMED: staff S3 sees clinic B org-wide rows and zero clinic #1 rows.");

  matrix.pShared = await withActorClient("patient", async (client) => {
    await applyPatientPrincipal(client, seed.pSharedUserId);
    const counts = await readMatrixCounts(client, seed);
    assert(counts.pSharedRows > 0, "P_SHARED must see its own rehearsal rows");
    assert(counts.pSharedOrg1Rows > 0, "P_SHARED must see own clinic #1 rows");
    assert(counts.pSharedOrgBRows > 0, "P_SHARED must see own clinic B rows");
    assert(counts.p1Rows === 0 && counts.p2Rows === 0, "P_SHARED must not see other patient rows");
    await assertForgeBlocked(client, seed, "p_shared");
    return counts;
  });
  console.log("CONFIRMED: patient P_SHARED identity-only sees own rows in both clinics and no other patient rows.");

  matrix.p2 = await withActorClient("patient", async (client) => {
    await applyPatientPrincipal(client, seed.p2UserId);
    const counts = await readMatrixCounts(client, seed);
    assert(counts.p2Rows > 0, "P2 must see its own rehearsal rows");
    assert(counts.p1Rows === 0 && counts.pSharedRows === 0, "P2 must not see P1 or P_SHARED rows");
    return counts;
  });
  console.log("CONFIRMED: patient P2 sees only own rows and cannot see P1/P_SHARED rows.");

  await proveNoSignedContextFailsClosed(seed);
  return matrix;
}

function lockedOptions() {
  return proofApi.buildDbPrincipalApplyOptions({
    mode: "locked",
    signingSecret,
    ttlMs: 120_000,
    nonce: () => `mt_${randomUUID()}`,
  });
}

async function applyStaffPrincipal(client, organizationId, platformUserId) {
  await proofApi.runWithDbStaffPrincipal({ organizationId, platformUserId }, async () => {
    const applied = await proofApi.applyCurrentDbPrincipalToConnection(client, lockedOptions());
    assert(applied === true, "staff principal should be applied");
  });
}

async function applyPatientPrincipal(client, platformUserId) {
  await proofApi.runWithDbPatientPrincipal({ platformUserId }, async () => {
    const applied = await proofApi.applyCurrentDbPrincipalToConnection(client, lockedOptions());
    assert(applied === true, "patient principal should be applied");
  });
}

async function withActorClient(kind, fn) {
  const client = kind === "staff" ? makeStaffClient() : makePatientClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await proofApi.clearDbPrincipalFromConnection(client, lockedOptions()).catch(() => {});
    await client.end();
  }
}

function makeAdminClient() {
  if (pgHarness?.kind === "temp") {
    return new Client({
      database: dbName,
      host: tempClusterSocketDir,
      port: Number(tempClusterPort),
      ssl: false,
      user: process.env.USER || "dev",
    });
  }
  return new Client({ connectionString: fullSuperuserUrl, ssl: false });
}

function makeStaffClient() {
  if (pgHarness?.kind === "temp") {
    return new Client({
      database: dbName,
      host: tempClusterSocketDir,
      password: staffPassword,
      port: Number(tempClusterPort),
      ssl: false,
      user: staffLoginRole,
    });
  }
  return new Client({ connectionString: fullScratchStaffUrl, ssl: false });
}

function makePatientClient() {
  if (pgHarness?.kind === "temp") {
    return new Client({
      database: dbName,
      host: tempClusterSocketDir,
      password: patientPassword,
      port: Number(tempClusterPort),
      ssl: false,
      user: patientLoginRole,
    });
  }
  return new Client({ connectionString: fullScratchPatientUrl, ssl: false });
}

async function readMatrixCounts(client, seed) {
  const row = await fetchRequiredRow(client, `
    WITH appointment_rows AS (
      SELECT organization_id, platform_user_id AS patient_user_id, specialist_id::uuid AS specialist_id, NULL::uuid AS assigned_by
      FROM public.be_appointments
      WHERE attribution_json->>'rehearsal' LIKE $1
    ), program_rows AS (
      SELECT organization_id, patient_user_id, NULL::uuid AS specialist_id, assigned_by
      FROM public.treatment_program_instances
      WHERE title LIKE $1
    ), support_rows AS (
      SELECT m.organization_id, c.platform_user_id AS patient_user_id, NULL::uuid AS specialist_id, NULL::uuid AS assigned_by
      FROM public.support_conversation_messages m
      JOIN public.support_conversations c ON c.id = m.conversation_id
      WHERE m.text LIKE $1
    ), enrollment_rows AS (
      SELECT organization_id, platform_user_id AS patient_user_id, NULL::uuid AS specialist_id, NULL::uuid AS assigned_by
      FROM public.org_enrollments
      WHERE platform_user_id = ANY($4::uuid[])
    ), rows AS (
      SELECT * FROM appointment_rows
      UNION ALL SELECT * FROM program_rows
      UNION ALL SELECT * FROM support_rows
      UNION ALL SELECT * FROM enrollment_rows
    )
    SELECT
      count(*)::int AS total_rows,
      count(*) FILTER (WHERE organization_id = $2::uuid)::int AS org1_rows,
      count(*) FILTER (WHERE organization_id = $3::uuid)::int AS orgb_rows,
      count(*) FILTER (WHERE patient_user_id = $5::uuid)::int AS p1_rows,
      count(*) FILTER (WHERE patient_user_id = $6::uuid)::int AS p2_rows,
      count(*) FILTER (WHERE patient_user_id = $7::uuid)::int AS pshared_rows,
      count(*) FILTER (WHERE patient_user_id = $7::uuid AND organization_id = $2::uuid)::int AS pshared_org1_rows,
      count(*) FILTER (WHERE patient_user_id = $7::uuid AND organization_id = $3::uuid)::int AS pshared_orgb_rows,
      count(*) FILTER (WHERE specialist_id = $8::uuid OR assigned_by = $9::uuid)::int AS s3_rows
    FROM rows
  `, [
    `${seed.marker}%`,
    seed.org1,
    seed.orgB,
    [seed.p1UserId, seed.p2UserId, seed.pSharedUserId],
    seed.p1UserId,
    seed.p2UserId,
    seed.pSharedUserId,
    seed.s3SpecialistId,
    seed.s3UserId,
  ], "matrix counts");
  return {
    totalRows: Number(row.total_rows),
    org1Rows: Number(row.org1_rows),
    orgBRows: Number(row.orgb_rows),
    p1Rows: Number(row.p1_rows),
    p2Rows: Number(row.p2_rows),
    pSharedRows: Number(row.pshared_rows),
    pSharedOrg1Rows: Number(row.pshared_org1_rows),
    pSharedOrgBRows: Number(row.pshared_orgb_rows),
    s3Rows: Number(row.s3_rows),
  };
}

async function assertForgeBlocked(client, seed, label) {
  await client.query("SELECT set_config('app.org', $1, false)", [seed.orgB]);
  await client.query("SELECT set_config('app.patient_user_id', $1, false)", [seed.p2UserId]);
  const helper = await fetchRequiredRow(client, `
    SELECT app.current_org_id()::text AS org_id, app.current_patient_user_id()::text AS patient_user_id
  `, [], `${label} helper state after raw SET`);
  assert(helper.org_id === null, `${label}: raw SET app.org changed helper-visible org`);
  assert(helper.patient_user_id === seed.pSharedUserId, `${label}: raw SET app.patient_user_id changed helper-visible patient`);
  const counts = await readMatrixCounts(client, seed);
  assert(counts.p2Rows === 0, `${label}: raw SET forged visibility to P2 rows`);
  console.log("CONFIRMED: plain SET app.org/app.patient_user_id does not change signed-context visibility.");
}

async function proveNoSignedContextFailsClosed(seed) {
  await withActorClient("staff", async (client) => {
    let runtimeFailed = false;
    try {
      await proofApi.applyCurrentDbPrincipalToConnection(client, lockedOptions());
    } catch (error) {
      runtimeFailed =
        error instanceof Error &&
        error.message.includes("DB principal context is required before scoped DB access in locked mode");
    }
    assert(runtimeFailed, "locked runtime must fail before DB access without a principal");
    await client.query("SET ROLE app_staff");
    const counts = await readMatrixCounts(client, seed);
    assert(counts.totalRows === 0, "app_staff scoped read without signed context must return zero rows");
  });
  console.log("CONFIRMED: scoped read with no signed context fails CLOSED.");
}

function printFinalMatrix(seed, matrix) {
  console.log("\nFinal visibility matrix (controlled rehearsal rows only; ids only, no PII):");
  console.table({
    S1_staff_clinic_1: matrix.s1,
    S2_staff_clinic_B: matrix.s2,
    S3_staff_clinic_B: matrix.s3,
    P_SHARED_patient: matrix.pShared,
    P2_patient: matrix.p2,
  });
  console.log(`Seed ids: org1=${seed.org1}; orgB=${seed.orgB}; S1=${seed.s1UserId}; S2=${seed.s2UserId}; S3=${seed.s3UserId}; P1=${seed.p1UserId}; P2=${seed.p2UserId}; P_SHARED=${seed.pSharedUserId}`);
  console.log(`Seed approach: ${seed.seedApproach}`);
}

async function fetchRequiredRow(client, queryText, values, label) {
  const result = await client.query(queryText, values);
  const row = result.rows[0];
  if (!row) throw new Error(`missing required row: ${label}`);
  return row;
}

function psqlAdmin(sql) {
  if (pgHarness?.kind === "temp") {
    run(path.join(pgBinDir, "psql"), [
      "-h",
      tempClusterSocketDir,
      "-p",
      tempClusterPort,
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      dbName,
    ], { input: sql });
    return;
  }
  psqlUrl(fullSuperuserUrl, sql);
}

function psqlFile(filePath, variables = {}) {
  const input = `${buildPsqlVariablePrelude(variables)}\n${readFileSync(filePath, "utf8")}`;
  if (pgHarness?.kind === "temp") {
    run(path.join(pgBinDir, "psql"), [
      "-h",
      tempClusterSocketDir,
      "-p",
      tempClusterPort,
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      dbName,
    ], {
      input,
      label: `psql < ${path.relative(repoRoot, filePath)} (variables redacted)`,
    });
    return;
  }
  psqlUrl(fullOwnerUrl, input);
}

function psqlUrlFile(url, filePath, extraArgs = []) {
  psqlUrl(url, readFileSync(filePath, "utf8"), extraArgs);
}

function psqlUrl(url, sql, extraArgs = []) {
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", ...extraArgs, url], {
    input: sql,
    env: sanitizedChildEnv(),
    label: "psql (connection URL redacted)",
  });
}

function buildPsqlVariablePrelude(variables) {
  if (Object.keys(variables).length === 0) return "";
  const assignments = Object.entries(variables).map(([key, value]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`unsafe psql variable key: ${key}`);
    return `  ${quoteLiteral(value)} AS ${key}`;
  });
  return `SELECT\n${assignments.join(",\n")}\n\\gset\n`;
}

async function cleanupScratchResources() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  console.log("--- cleanup: dropping disposable DB and scratch roles ---");

  if (pgHarness?.kind === "host") {
    safeRun("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
    const dropCanonicalAppPatient = fullPreexistingAppPatient === false ? "DROP ROLE IF EXISTS app_patient;" : "";
    const dropCanonicalAppStaff = fullPreexistingAppStaff === false ? "DROP ROLE IF EXISTS app_staff;" : "";
    safeRun("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
      input: `
DROP ROLE IF EXISTS ${quoteIdent(patientLoginRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffLoginRole)};
DROP ROLE IF EXISTS ${quoteIdent(fullSuperuserRole)};
DROP ROLE IF EXISTS ${quoteIdent(fullOwnerRole)};
${dropCanonicalAppPatient}
${dropCanonicalAppStaff}
`,
    });
    return;
  }

  if (pgHarness?.kind === "temp") {
    safeRun(path.join(pgBinDir, "dropdb"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, "--if-exists", dbName]);
    safeRun(path.join(pgBinDir, "psql"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
      input: `
DROP ROLE IF EXISTS ${quoteIdent(patientLoginRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffLoginRole)};
DROP ROLE IF EXISTS app_patient;
DROP ROLE IF EXISTS app_staff;
DROP ROLE IF EXISTS ${quoteIdent(appOwnerRole)};
`,
    });
    safeRun(path.join(pgBinDir, "pg_ctl"), ["-D", tempClusterDataDir, "-m", "fast", "-w", "stop"]);
    if (tempClusterRoot.startsWith("/tmp/bcb_saas_")) safeRun("rm", ["-rf", tempClusterRoot]);
  }
}

function installSignalCleanup() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      cleanupScratchResources().finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
    });
  }
}
