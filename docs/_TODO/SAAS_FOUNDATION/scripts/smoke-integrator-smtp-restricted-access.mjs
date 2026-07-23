#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const pgBin = process.env.PG_BINDIR?.trim() || "/usr/lib/postgresql/16/bin";
const scratchRoot = mkdtempSync(join(tmpdir(), "bcb-integrator-smtp-acl-"));
const dataDir = join(scratchRoot, "data");
const socketDir = join(scratchRoot, "socket");
const port = "55432";
let started = false;

const migrationPath = resolve(
  repoRoot,
  "apps/webapp/db/drizzle-migrations/0235_integrator_smtp_restricted_accessor.sql",
);
const overlayPath = resolve(repoRoot, "deploy/postgres/integrator-server-runtime-config.sql");
readFileSync(migrationPath, "utf8");
readFileSync(overlayPath, "utf8");

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
  });
  if (result.status !== 0) {
    const diagnostic = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim().slice(-6000);
    throw new Error(
      `smoke-integrator-smtp-restricted-access: ${executable} failed (${result.status})\n${diagnostic}`,
    );
  }
}

function psqlEnv() {
  return {
    ...process.env,
    PGHOST: socketDir,
    PGPORT: port,
    PGUSER: "postgres",
    PGDATABASE: "postgres",
  };
}

function sql(text) {
  command(
    join(pgBin, "psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-qAt"],
    { env: psqlEnv(), input: text },
  );
}

function file(path, variables = []) {
  command(
    join(pgBin, "psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", ...variables, "-f", path],
    { env: psqlEnv() },
  );
}

const setup = `
CREATE ROLE app_owner NOLOGIN BYPASSRLS;
CREATE ROLE app_staff NOLOGIN;
CREATE ROLE app_patient NOLOGIN;
CREATE ROLE app_worker NOLOGIN;
CREATE ROLE smtp_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE ROLE smtp_stale NOLOGIN;
CREATE ROLE smtp_delegated NOLOGIN;

GRANT app_staff TO smtp_runtime WITH INHERIT FALSE, SET TRUE;
GRANT app_patient TO smtp_runtime WITH INHERIT FALSE, SET TRUE;
GRANT app_worker TO smtp_runtime WITH INHERIT FALSE, SET TRUE;

CREATE SCHEMA app;
GRANT USAGE ON SCHEMA app TO smtp_stale, smtp_delegated;
CREATE TABLE public.system_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  value_json jsonb NOT NULL
);
CREATE UNIQUE INDEX system_settings_global_uq
  ON public.system_settings(key, scope) WHERE organization_id IS NULL;
CREATE TABLE public.app_runtime_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  audience text NOT NULL,
  value_json jsonb NOT NULL
);
INSERT INTO public.system_settings(key, scope, organization_id, value_json)
VALUES (
  'smtp_outbound',
  'admin',
  NULL,
  '{"value":{"host":"smtp.example.test","port":587,"secure":false,"user":"mailer","password":"test-only","from":"mail@example.test"}}'
);
INSERT INTO public.app_runtime_settings(key, scope, organization_id, audience, value_json)
VALUES ('app_base_url', 'admin', NULL, 'server', '{"value":"https://app.example.test"}');

CREATE FUNCTION app.read_global_server_runtime_setting(text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS 'SELECT value_json FROM public.app_runtime_settings WHERE key = $1 LIMIT 1';
CREATE FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)
RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION app.release_principal_context() RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE FUNCTION app.current_integrator_user_id() RETURNS integer LANGUAGE sql AS 'SELECT NULL::integer';
CREATE FUNCTION app.reset_principal_context() RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION app.close_active_user_phone_history(uuid) RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql AS 'SELECT false';

REVOKE ALL ON FUNCTION
  app.read_global_server_runtime_setting(text),
  app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text),
  app.release_principal_context(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id(),
  app.reset_principal_context(),
  app.close_active_user_phone_history(uuid),
  app.is_staff()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text),
  app.release_principal_context()
  TO app_staff, app_patient;
GRANT SELECT ON TABLE public.system_settings, public.app_runtime_settings TO app_owner;
`;

const injectStaleAcl = `
GRANT EXECUTE ON FUNCTION app.read_integrator_smtp_outbound_setting()
  TO smtp_stale WITH GRANT OPTION;
SET ROLE smtp_stale;
GRANT EXECUTE ON FUNCTION app.read_integrator_smtp_outbound_setting()
  TO smtp_delegated;
RESET ROLE;
`;

const proof = `
SELECT 1 / (
  (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure
      AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'smtp_runtime')
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure
      AND (
        NOT procedure.prosecdef
        OR owner.rolname <> 'app_owner'
        OR privilege.grantee NOT IN (
          procedure.proowner,
          (SELECT oid FROM pg_roles WHERE rolname = 'smtp_runtime')
        )
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_table_privilege('smtp_runtime', 'public.system_settings', 'SELECT')
  AND NOT has_table_privilege('smtp_runtime', 'public.app_runtime_settings', 'SELECT')
  AND NOT has_function_privilege('smtp_runtime', 'app.current_org_id()', 'EXECUTE')
  AND NOT has_function_privilege('smtp_stale', 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE')
  AND NOT has_function_privilege('smtp_delegated', 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE')
  AND NOT has_function_privilege('app_staff', 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE')
  AND NOT has_function_privilege('app_patient', 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE')
  AND NOT has_function_privilege('app_worker', 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE')
)::int;

SET SESSION AUTHORIZATION smtp_runtime;
SELECT 1 / (app.read_integrator_smtp_outbound_setting() IS NOT NULL)::int;
DO $denials$
BEGIN
  BEGIN
    PERFORM 1 FROM public.system_settings;
    RAISE EXCEPTION 'smtp_runtime_table_read_unexpectedly_succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM app.current_org_id();
    RAISE EXCEPTION 'smtp_runtime_current_org_unexpectedly_succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$denials$;
RESET SESSION AUTHORIZATION;
`;

try {
  mkdirSync(socketDir, { mode: 0o700 });
  command(join(pgBin, "initdb"), [
    "-D",
    dataDir,
    "--no-locale",
    "--encoding=UTF8",
    "--auth=trust",
    "--username=postgres",
  ]);
  command(join(pgBin, "pg_ctl"), [
    "-D",
    dataDir,
    "-l",
    join(scratchRoot, "postgres.log"),
    "-o",
    `-k ${socketDir} -p ${port} -h ''`,
    "-w",
    "start",
  ]);
  started = true;

  sql(setup);
  for (let pass = 0; pass < 2; pass += 1) {
    file(migrationPath);
    sql(injectStaleAcl);
    file(overlayPath, ["-v", "integrator_runtime_config_role=smtp_runtime"]);
    sql(proof);
  }

  console.log(
    "smoke-integrator-smtp-restricted-access: OK (exact ACL, role denials, idempotent reapply)",
  );
} finally {
  if (started) {
    spawnSync(join(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      encoding: "utf8",
    });
  }
  rmSync(scratchRoot, { recursive: true, force: true });
}
