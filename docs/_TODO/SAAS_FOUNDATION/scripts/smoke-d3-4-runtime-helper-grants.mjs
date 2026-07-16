#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  getP09EnforceDescriptorByTable,
  renderP09EnforcePolicyStatements,
} from "./p0-9-enforce-descriptors.mjs";

const repoRoot = process.cwd();
const artifactPath = "deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql";
const appWorkerArtifactPath = "deploy/postgres/phase4-app-worker-narrow-rls.sql";
const suffix = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_d3_4_helper_scratch_${suffix}`;
const bootstrapRole = `bcb_d3_4_bootstrap_${suffix}`;
const mediaRole = `bcb_d3_4_media_${suffix}`;
const c4MediaRole = `bcb_d3_4_c4_media_${suffix}`;
const operationalMediaRole = `app_operational_media_worker_scratch_${suffix}`;
const workerRole = `bcb_d3_4_worker_${suffix}`;
const staffRole = `bcb_d3_4_staff_${suffix}`;
const patientRole = `bcb_d3_4_patient_${suffix}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error("unsafe_scratch_database_name");
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(database, sql) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], sql);
}

const bootstrapIdent = quoteIdent(bootstrapRole);
const mediaIdent = quoteIdent(mediaRole);
const c4MediaIdent = quoteIdent(c4MediaRole);
const operationalMediaIdent = quoteIdent(operationalMediaRole);
const workerIdent = quoteIdent(workerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const sourceArtifact = readFileSync(artifactPath, "utf8");
const artifact = sourceArtifact
  .replaceAll("app_operational_media_worker", operationalMediaRole)
  .replaceAll("app_staff", staffRole)
  .replaceAll("app_patient", patientRole)
  .replaceAll("app_worker", workerRole);
const appWorkerArtifact = readFileSync(appWorkerArtifactPath, "utf8")
  .replaceAll("app_worker", workerRole);
const runtimeAudiencePolicy = renderP09EnforcePolicyStatements(
  getP09EnforceDescriptorByTable("public.app_runtime_settings"),
).join("\n").replaceAll("app_worker", workerRole);

function createFunctionSql(signature) {
  if (signature === "app.is_staff()") {
    return `CREATE FUNCTION ${signature} RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;`;
  }
  if (signature === "app.current_org_id()" || signature === "app.current_patient_user_id()") {
    return `CREATE FUNCTION ${signature} RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`;
  }
  return `CREATE FUNCTION ${signature} RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;`;
}

const functionSignatures = [...artifact.matchAll(/ON FUNCTION\s+(app\.[^(\s]+\([^;]*?\))\s+(?:TO|FROM)/g)]
  .map((match) => match[1])
  .concat([
    "app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)",
    "app.reset_principal_context()",
  ])
  .filter((signature, index, all) => all.indexOf(signature) === index);
const tableNames = [...artifact.matchAll(/ON TABLE\s+(public\.[a-zA-Z0-9_]+)/g)]
  .map((match) => match[1])
  .filter((table, index, all) => all.indexOf(table) === index);

const setupSql = [
  `CREATE ROLE ${bootstrapIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${mediaIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${c4MediaIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${operationalMediaIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${workerIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${staffIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${patientIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `GRANT ${patientIdent} TO ${bootstrapIdent};`,
  `GRANT ${workerIdent} TO ${mediaIdent};`,
  `GRANT ${operationalMediaIdent} TO ${c4MediaIdent} WITH INHERIT FALSE, SET TRUE;`,
  "CREATE SCHEMA app;",
  `GRANT USAGE ON SCHEMA app TO ${staffIdent}, ${patientIdent};`,
  ...functionSignatures.map(createFunctionSql),
  "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;",
  `GRANT EXECUTE ON FUNCTION app.release_principal_context() TO ${staffIdent}, ${patientIdent};`,
  ...tableNames
    .filter((table) => table !== "public.app_runtime_settings")
    .map((table) => `CREATE TABLE ${table} (id integer);`),
  `CREATE TABLE public.app_runtime_settings (
    key text NOT NULL,
    scope text NOT NULL,
    organization_id uuid,
    audience text NOT NULL,
    value_json jsonb NOT NULL
  );`,
  `INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json) VALUES
    ('client_public_global', 'admin', NULL, 'public', '{"value":true}'),
    ('client_authenticated_global', 'admin', NULL, 'authenticated_client', '{"value":true}'),
    ('worker_server_global', 'admin', NULL, 'server', '{"value":true}'),
    ('worker_server_org', 'admin', '00000000-0000-4000-8000-000000000020', 'server', '{"value":true}');`,
  "ALTER TABLE public.app_runtime_settings ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.app_runtime_settings FORCE ROW LEVEL SECURITY;",
  `CREATE POLICY app_runtime_settings_safe_read ON public.app_runtime_settings
    FOR SELECT USING (
      (
        audience IN ('public', 'authenticated_client')
        AND NOT pg_has_role(current_user, ${quoteLiteral(workerRole)}, 'member')
        AND organization_id IS NULL
      )
      OR (
        audience = 'server'
        AND organization_id IS NULL
        AND pg_has_role(current_user, ${quoteLiteral(workerRole)}, 'member')
        AND app.current_org_id() IS NULL
        AND app.current_patient_user_id() IS NULL
      )
    );`,
  "CREATE TABLE public.system_settings (id integer);",
  `CREATE TABLE public.media_files (
    id uuid PRIMARY KEY,
    organization_id uuid,
    usage_purpose text,
    uploaded_by uuid,
    mime_type text,
    s3_key text,
    hls_master_playlist_s3_key text,
    video_processing_status text,
    video_duration_seconds numeric
  );`,
  `CREATE TABLE public.media_transcode_jobs (
    id uuid PRIMARY KEY,
    media_id uuid NOT NULL,
    organization_id uuid,
    status text,
    locked_at timestamptz,
    locked_by text,
    last_error text,
    finished_at timestamptz,
    updated_at timestamptz
  );`,
  `INSERT INTO public.media_files
    (id, organization_id, usage_purpose, uploaded_by, mime_type, video_processing_status)
   VALUES
    ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
     'program_item', '00000000-0000-4000-8000-000000000030', 'video/mp4', 'pending');`,
  `INSERT INTO public.media_transcode_jobs
    (id, media_id, organization_id, status, updated_at)
   VALUES
    ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000010',
     '00000000-0000-4000-8000-000000000020', 'processing', now());`,
  `GRANT SELECT, UPDATE ON TABLE public.media_files, public.media_transcode_jobs TO ${workerIdent};`,
  "ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.media_files FORCE ROW LEVEL SECURITY;",
  "ALTER TABLE public.media_transcode_jobs ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.media_transcode_jobs FORCE ROW LEVEL SECURITY;",
].join("\n");

const applySql = [
  `\\set d3_4_bootstrap_base_role ${bootstrapRole}`,
  `\\set d3_4_media_worker_runtime_role ${mediaRole}`,
  artifact,
  appWorkerArtifact,
  runtimeAudiencePolicy,
].join("\n");

// The same pre-C4 D3.4 artifact must also accept the canonical C4 SET-only shape.
// Applying it a second time proves that shape against a real PostgreSQL 16 catalog.
const applyC4ShapeSql = [
  `\\set d3_4_bootstrap_base_role ${bootstrapRole}`,
  `\\set d3_4_media_worker_runtime_role ${c4MediaRole}`,
  artifact,
].join("\n");

const proofSql = `
SELECT 1 / has_function_privilege(${quoteLiteral(staffRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(mediaRole)}, 'app.release_principal_context()', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(mediaRole)}, 'app.current_org_id()', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(mediaRole)}, 'app.current_patient_user_id()', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(mediaRole)}, 'app.is_staff()', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.reset_principal_context()', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.current_integrator_user_id()', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.close_active_user_phone_history(uuid)', 'EXECUTE'))::int;
SELECT 1 / has_table_privilege(${quoteLiteral(mediaRole)}, 'public.app_runtime_settings', 'SELECT')::int;
SELECT 1 / (NOT has_table_privilege(${quoteLiteral(mediaRole)}, 'public.system_settings', 'SELECT'))::int;
-- The 0188 worker policy and the generic P0.9 policy coexist permissively (OR). The P0.9 branch
-- must exclude worker membership, otherwise these two client-safe global rows reopen to media.
SET SESSION AUTHORIZATION ${mediaIdent};
SELECT 1 / (count(*) = 1)::int FROM public.app_runtime_settings;
SELECT 1 / (count(*) = 1)::int
FROM public.app_runtime_settings
WHERE key = 'worker_server_global'
  AND audience = 'server'
  AND organization_id IS NULL;
SELECT 1 / (NOT EXISTS (
  SELECT 1 FROM public.app_runtime_settings
  WHERE audience <> 'server' OR organization_id IS NOT NULL
))::int;
RESET SESSION AUTHORIZATION;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_proc proc
  CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
  WHERE proc.oid IN (
    'app.staff_user_has_password_credentials(uuid)'::regprocedure,
    'app.release_principal_context()'::regprocedure,
    'app.current_org_id()'::regprocedure,
    'app.current_patient_user_id()'::regprocedure,
    'app.is_staff()'::regprocedure
  )
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE'
))::int;
SET SESSION AUTHORIZATION ${mediaIdent};
SELECT app.release_principal_context();
SELECT id, mime_type, s3_key, hls_master_playlist_s3_key,
       video_processing_status, video_duration_seconds, usage_purpose
FROM public.media_files
WHERE id = '00000000-0000-4000-8000-000000000010'::uuid;
UPDATE public.media_transcode_jobs
SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL,
    finished_at = now(), updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000040'::uuid;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION ${staffIdent};
SELECT app.staff_user_has_password_credentials('00000000-0000-4000-8000-000000000001'::uuid);
RESET SESSION AUTHORIZATION;
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql(dbName, setupSql);
  psql(dbName, applySql);
  psql(dbName, applyC4ShapeSql);
  psql(dbName, proofSql);
  process.stdout.write("smoke-d3-4-runtime-helper-grants: OK\n");
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  psql("postgres", [
    `DROP ROLE IF EXISTS ${bootstrapIdent};`,
    `DROP ROLE IF EXISTS ${mediaIdent};`,
    `DROP ROLE IF EXISTS ${c4MediaIdent};`,
    `DROP ROLE IF EXISTS ${operationalMediaIdent};`,
    `DROP ROLE IF EXISTS ${workerIdent};`,
    `DROP ROLE IF EXISTS ${staffIdent};`,
    `DROP ROLE IF EXISTS ${patientIdent};`,
  ].join("\n"));
}
