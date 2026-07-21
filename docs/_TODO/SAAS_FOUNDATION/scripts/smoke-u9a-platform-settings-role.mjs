#!/usr/bin/env node
/** Disposable PostgreSQL proof for the U9A platform-settings role and mirror fallback. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_u9a_platform_settings_scratch_${stamp}_`);
const data = path.join(dir, "data");
const socket = path.join(dir, "socket");
const log = path.join(dir, "postgres.log");
const db = `bcb_u9a_platform_settings_scratch_${stamp}`;
const orgId = "10000000-0000-4000-8000-000000000001";
const safeEnv = { LANG: "C", LC_ALL: "C", PATH: `${pgBin}:/usr/bin:/bin` };
let serverStarted = false;
let port;

function fail(label) {
  throw new Error(`U9A disposable proof failed: ${label}`);
}

function run(command, args, input, label, { expectFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: safeEnv, input });
  if (result.error) fail(`${label} did not start`);
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    if (!expectFailure && result.stderr) process.stderr.write(result.stderr);
    fail(label);
  }
  return result.stdout;
}

function psql(text, label, { expectFailure = false, user = "postgres" } = {}) {
  return run(
    path.join(pgBin, "psql"),
    ["-X", "-qAt", "-h", socket, "-p", port, "-U", user, "-v", "ON_ERROR_STOP=1", "-d", db],
    text,
    label,
    { expectFailure },
  );
}

function assertTrue(sql, label) {
  const result = psql(sql, label).trim();
  if (result !== "1" && result !== "t") fail(label);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") fail("private port reservation");
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return String(address.port);
}

function installFixture() {
  psql(`
    CREATE ROLE app_owner NOLOGIN NOINHERIT BYPASSRLS;
    CREATE ROLE app_staff NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE u9a_staff_login LOGIN NOINHERIT NOBYPASSRLS;
    GRANT app_staff TO u9a_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
    CREATE SCHEMA app AUTHORIZATION app_owner;
    CREATE SCHEMA integrator;

    CREATE TABLE public.system_settings(
      key text NOT NULL, scope text NOT NULL, organization_id uuid,
      value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
    );
    CREATE TABLE public.system_settings_audit(
      id uuid PRIMARY KEY, key text NOT NULL, scope text NOT NULL,
      organization_id uuid, old_value_json jsonb, new_value_json jsonb
    );
    CREATE TABLE public.app_runtime_settings(
      key text NOT NULL, scope text NOT NULL, organization_id uuid,
      audience text NOT NULL, value_json jsonb NOT NULL
    );
    CREATE TABLE public.app_runtime_settings_audit(
      id uuid PRIMARY KEY, key text NOT NULL, scope text NOT NULL,
      organization_id uuid, audience text NOT NULL, old_value_json jsonb, new_value_json jsonb
    );
    CREATE TABLE public.integrator_push_outbox(
      id bigserial PRIMARY KEY, kind text NOT NULL, idempotency_key text NOT NULL UNIQUE,
      payload jsonb NOT NULL, status text NOT NULL, attempts_done integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 8, next_try_at timestamptz NOT NULL DEFAULT now(),
      last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.patient_files(id uuid PRIMARY KEY, organization_id uuid NOT NULL);
    CREATE TABLE integrator.system_settings(key text PRIMARY KEY, value_json jsonb NOT NULL);

    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.system_settings_audit ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.system_settings_audit FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.app_runtime_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.app_runtime_settings FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.app_runtime_settings_audit ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.app_runtime_settings_audit FORCE ROW LEVEL SECURITY;

    INSERT INTO public.system_settings(key,scope,organization_id,value_json,updated_by) VALUES
      ('specialist_signup_enabled','admin',NULL,'{"value":false}','platform-user'),
      ('specialist_signup_enabled','admin','${orgId}','{"value":false}','org-user'),
      ('outside_u9a_whitelist','admin',NULL,'{"value":true}','platform-user');
    INSERT INTO public.app_runtime_settings VALUES
      ('specialist_signup_enabled','admin',NULL,'public','{"value":false}'),
      ('specialist_signup_enabled','admin','${orgId}','public','{"value":false}');
    INSERT INTO public.patient_files VALUES ('20000000-0000-4000-8000-000000000001','${orgId}');
    INSERT INTO integrator.system_settings VALUES ('secret','{}');
  `, "fixture schema and roles");

  const artifact = readFileSync(path.join(root, "deploy/postgres/u9a-platform-settings-role.sql"), "utf8");
  psql(artifact, "U9A role artifact first apply");
  psql(`
    ALTER ROLE app_platform_settings LOGIN INHERIT BYPASSRLS;
    REVOKE app_platform_settings FROM app_staff;
    REVOKE SELECT, INSERT, UPDATE ON TABLE public.system_settings FROM app_platform_settings;
    REVOKE INSERT ON TABLE public.system_settings_audit FROM app_platform_settings;
    DROP POLICY u9a_platform_settings_global_only ON public.system_settings;
    DROP POLICY u9a_platform_settings_audit_global_only ON public.system_settings_audit;
    DROP POLICY u9a_platform_runtime_global_only ON public.app_runtime_settings;
    DROP POLICY u9a_platform_runtime_audit_global_only ON public.app_runtime_settings_audit;
  `, "simulate post-restore role and database-local ACL drift");
  psql(artifact, "U9A role artifact post-restore reapply");
}

function assertRehydratedRoleAndDatabaseClosure() {
  assertTrue(`
    SELECT (
      NOT role.rolcanlogin
      AND NOT role.rolsuper
      AND NOT role.rolinherit
      AND NOT role.rolcreaterole
      AND NOT role.rolcreatedb
      AND NOT role.rolreplication
      AND NOT role.rolbypassrls
      AND pg_has_role('app_staff', 'app_platform_settings', 'SET')
      AND has_table_privilege('app_platform_settings', 'public.system_settings', 'SELECT')
      AND has_table_privilege('app_platform_settings', 'public.system_settings', 'INSERT')
      AND has_table_privilege('app_platform_settings', 'public.system_settings', 'UPDATE')
      AND has_table_privilege('app_platform_settings', 'public.system_settings_audit', 'INSERT')
      AND 4 = (
        SELECT count(*)
        FROM pg_policy AS policy
        JOIN pg_class AS relation ON relation.oid = policy.polrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND policy.polname IN (
            'u9a_platform_settings_global_only',
            'u9a_platform_settings_audit_global_only',
            'u9a_platform_runtime_global_only',
            'u9a_platform_runtime_audit_global_only'
          )
          AND policy.polroles = ARRAY[role.oid]::oid[]
      )
    )::int
    FROM pg_roles AS role
    WHERE role.rolname = 'app_platform_settings';
  `, "post-restore role attributes, membership, grants and policies rehydrated");
}

function assertAllowedPaths() {
  assertTrue(`
    SET SESSION AUTHORIZATION u9a_staff_login;
    SET ROLE app_platform_settings;
    SELECT (
      (SELECT count(*) FROM public.system_settings) = 2
      AND NOT EXISTS (SELECT 1 FROM public.system_settings WHERE organization_id IS NOT NULL)
    )::int;
    RESET ROLE;
    RESET SESSION AUTHORIZATION;
  `, "global-only settings read");

  psql(`
    SET SESSION AUTHORIZATION u9a_staff_login;
    SET ROLE app_platform_settings;
    UPDATE public.system_settings
      SET value_json='{"value":true}', updated_by='platform-user'
      WHERE key='specialist_signup_enabled' AND scope='admin' AND organization_id IS NULL;
    INSERT INTO public.system_settings_audit(id,key,scope,organization_id,old_value_json,new_value_json)
      VALUES ('30000000-0000-4000-8000-000000000001','specialist_signup_enabled','admin',NULL,
        '{"value":false}','{"value":true}');
    SELECT app.enqueue_platform_system_settings_sync('specialist_signup_enabled');
    INSERT INTO public.system_settings(key,scope,organization_id,value_json,updated_by)
      VALUES ('notif_template:created:patient','admin',NULL,
        '{"value":"Legacy preserved","managed":{"version":1}}','platform-user');
    SELECT app.enqueue_platform_system_settings_sync('notif_template:created:patient');
    RESET ROLE;
    RESET SESSION AUTHORIZATION;
  `, "whitelisted global write, audit and mirror enqueue");

  assertTrue(`SELECT (
    SELECT kind='system_settings_sync'
      AND idempotency_key='settings:global:admin:specialist_signup_enabled'
      AND payload->>'key'='specialist_signup_enabled'
      AND payload->>'scope'='admin'
      AND payload->'organizationId'='null'::jsonb
      AND payload->'valueJson'='{"value":true}'::jsonb
    FROM public.integrator_push_outbox
    WHERE idempotency_key='settings:global:admin:specialist_signup_enabled'
  )::int`, "outbox payload derives from canonical global row");

  assertTrue(`SELECT (
    SELECT kind='system_settings_sync'
      AND payload->>'key'='notif_template:created:patient'
      AND payload->'organizationId'='null'::jsonb
      AND payload->'valueJson'->>'value'='Legacy preserved'
    FROM public.integrator_push_outbox
    WHERE idempotency_key='settings:global:admin:notif_template:created:patient'
  )::int`, "notification-template platform fallback mirror enqueue");
}

function assertDeniedPaths() {
  psql(`
    SET SESSION AUTHORIZATION u9a_staff_login;
    SET ROLE app_platform_settings;
    INSERT INTO public.system_settings(key,scope,organization_id,value_json)
      VALUES ('specialist_signup_enabled','admin','${orgId}','{}');
  `, "organization-scoped settings write denied", { expectFailure: true });
  psql(`
    SET SESSION AUTHORIZATION u9a_staff_login;
    SET ROLE app_platform_settings;
    INSERT INTO public.system_settings_audit(id,key,scope,organization_id,new_value_json)
      VALUES ('30000000-0000-4000-8000-000000000002','specialist_signup_enabled','admin','${orgId}','{}');
  `, "organization-scoped audit denied", { expectFailure: true });
  psql("SET ROLE app_platform_settings; SELECT * FROM public.patient_files;", "clinical table denied", {
    expectFailure: true,
    user: "u9a_staff_login",
  });
  psql("SET ROLE app_platform_settings; SELECT * FROM integrator.system_settings;", "integrator schema denied", {
    expectFailure: true,
    user: "u9a_staff_login",
  });
  psql(`
    SET ROLE app_platform_settings;
    INSERT INTO public.integrator_push_outbox(kind,idempotency_key,payload,status)
      VALUES ('reminder_rule_upsert','reminder:forbidden','{}','pending');
  `, "direct reminder outbox enqueue denied", { expectFailure: true, user: "u9a_staff_login" });
  psql(
    "SET ROLE app_platform_settings; SELECT app.enqueue_platform_system_settings_sync('outside_u9a_whitelist');",
    "non-whitelisted mirror enqueue denied",
    { expectFailure: true, user: "u9a_staff_login" },
  );
}

try {
  if (!existsSync(path.join(pgBin, "initdb"))) fail("PostgreSQL 16 tooling is unavailable");
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale"], undefined, "private initdb");
  run(
    path.join(pgBin, "pg_ctl"),
    ["-D", data, "-l", log, "-o", `-k ${socket} -p ${port} -c listen_addresses=''`, "-w", "start"],
    undefined,
    "private PostgreSQL startup",
  );
  serverStarted = true;
  run(path.join(pgBin, "createdb"), ["-h", socket, "-p", port, "-U", "postgres", db], undefined, "scratch DB");
  installFixture();
  assertRehydratedRoleAndDatabaseClosure();
  assertAllowedPaths();
  assertDeniedPaths();
  console.log("U9A private PostgreSQL real-role matrix: OK (PII-free)");
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], {
      encoding: "utf8",
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
