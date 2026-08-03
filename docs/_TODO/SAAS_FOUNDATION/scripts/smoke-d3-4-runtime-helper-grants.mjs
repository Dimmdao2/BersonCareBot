#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  getP09EnforceDescriptorByTable,
  renderP09EnforcePolicyStatements,
} from './p0-9-enforce-descriptors.mjs';

const repoRoot = process.cwd();
const artifactPath = 'deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql';
const appWorkerArtifactPath = 'deploy/postgres/phase4-app-worker-narrow-rls.sql';
const suffix = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, '_');
const dbName = `bcb_saas_d3_4_helper_scratch_${suffix}`;
const bootstrapRole = `bcb_d3_4_bootstrap_${suffix}`;
const intermediaryRole = `bcb_d3_4_intermediary_${suffix}`;
const mediaRole = `bcb_d3_4_media_${suffix}`;
const c4MediaRole = `bcb_d3_4_c4_media_${suffix}`;
const operationalMediaRole = `app_operational_media_worker_scratch_${suffix}`;
const arbitraryCapabilityRole = `bcb_d3_4_arbitrary_${suffix}`;
const siblingCapabilityRole = `app_operational_scheduler_scratch_${suffix}`;
const legacyStaffRole = `bcb_d3_4_legacy_staff_${suffix}`;
const legacyArbitraryRole = `bcb_d3_4_legacy_arbitrary_${suffix}`;
const c4UnrelatedRole = `bcb_d3_4_c4_unrelated_${suffix}`;
const mixedRole = `bcb_d3_4_mixed_${suffix}`;
const siblingOperationalRole = `bcb_d3_4_sibling_operational_${suffix}`;
const workerRole = `bcb_d3_4_worker_${suffix}`;
const staffRole = `bcb_d3_4_staff_${suffix}`;
const patientRole = `bcb_d3_4_patient_${suffix}`;

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('scratch')) {
  throw new Error('unsafe_scratch_database_name');
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
    encoding: 'utf8',
    input,
    stdio: input === undefined ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} failed with status ${result.status ?? 'unknown'}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(database, sql) {
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database], sql);
}

function psqlExpectFailure(database, sql) {
  const result = spawnSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    { cwd: repoRoot, encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0 || !output.includes('division by zero')) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error('D3.4 malformed membership shape did not fail at its SQL invariant');
  }
}

function psqlProveGrantDenied(database, roleIdent) {
  psql(
    database,
    `
    SET SESSION AUTHORIZATION ${roleIdent};
    GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO PUBLIC;
    RESET SESSION AUTHORIZATION;
    SELECT 1 / (NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) privilege
      WHERE procedure.oid IN (
        'app.read_public_runtime_setting(text,text)'::regprocedure,
        'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
        'app.resolve_public_organization_slug(text)'::regprocedure,
        'app.resolve_public_organization_by_slug(text)'::regprocedure,
        'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
      )
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ))::int;
  `,
  );
}

const bootstrapIdent = quoteIdent(bootstrapRole);
const intermediaryIdent = quoteIdent(intermediaryRole);
const mediaIdent = quoteIdent(mediaRole);
const c4MediaIdent = quoteIdent(c4MediaRole);
const operationalMediaIdent = quoteIdent(operationalMediaRole);
const arbitraryCapabilityIdent = quoteIdent(arbitraryCapabilityRole);
const siblingCapabilityIdent = quoteIdent(siblingCapabilityRole);
const legacyStaffIdent = quoteIdent(legacyStaffRole);
const legacyArbitraryIdent = quoteIdent(legacyArbitraryRole);
const c4UnrelatedIdent = quoteIdent(c4UnrelatedRole);
const mixedIdent = quoteIdent(mixedRole);
const siblingOperationalIdent = quoteIdent(siblingOperationalRole);
const workerIdent = quoteIdent(workerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const sourceArtifact = readFileSync(artifactPath, 'utf8');
const artifact = sourceArtifact
  .replaceAll('app_operational_media_worker', operationalMediaRole)
  .replaceAll('app_staff', staffRole)
  .replaceAll('app_patient', patientRole)
  .replaceAll('app_worker', workerRole);
const appWorkerArtifact = readFileSync(appWorkerArtifactPath, 'utf8').replaceAll(
  'app_worker',
  workerRole,
);
const runtimeAudiencePolicy = renderP09EnforcePolicyStatements(
  getP09EnforceDescriptorByTable('public.app_runtime_settings'),
)
  .join('\n')
  .replaceAll('app_worker', workerRole);

function createFunctionSql(signature) {
  if (signature === 'app.is_staff()') {
    return `CREATE FUNCTION ${signature} RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;`;
  }
  if (signature === 'app.current_org_id()' || signature === 'app.current_patient_user_id()') {
    return `CREATE FUNCTION ${signature} RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`;
  }
  return `CREATE FUNCTION ${signature} RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;`;
}

const functionSignatures = [
  ...artifact.matchAll(/ON FUNCTION\s+(app\.[^(\s]+\([^;]*?\))\s+(?:TO|FROM)/g),
]
  .map((match) => match[1])
  .concat([
    'app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)',
    'app.reset_principal_context()',
    'app.auth_user_pin_read(uuid)',
    'app.auth_user_pin_upsert(uuid, text)',
    'app.auth_user_pin_read_self()',
    'app.auth_user_pin_upsert_self(text)',
  ])
  .filter(
    (signature) =>
      ![
        'app.read_public_runtime_setting(text, text)',
        'app.read_webapp_server_runtime_setting(text, text)',
        'app.resolve_public_booking_organization(uuid, uuid, uuid)',
        'app.resolve_public_organization_slug(text)',
        'app.resolve_public_organization_by_slug(text)',
        'app.resolve_payment_webhook_organization(text, text, text)',
      ].includes(signature),
  )
  .filter((signature, index, all) => all.indexOf(signature) === index);
const tableNames = [...artifact.matchAll(/ON TABLE\s+(public\.[a-zA-Z0-9_]+)/g)]
  .map((match) => match[1])
  .concat(['public.be_payment_intents'])
  .filter((table, index, all) => all.indexOf(table) === index);

const setupSql = [
  `CREATE ROLE ${bootstrapIdent} LOGIN NOSUPERUSER INHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${intermediaryIdent} NOLOGIN NOSUPERUSER INHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${mediaIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${c4MediaIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${operationalMediaIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${arbitraryCapabilityIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${siblingCapabilityIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${legacyStaffIdent} NOLOGIN NOSUPERUSER INHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${legacyArbitraryIdent} NOLOGIN NOSUPERUSER INHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${c4UnrelatedIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${mixedIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${siblingOperationalIdent} NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;`,
  `CREATE ROLE ${workerIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${staffIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${patientIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `GRANT ${patientIdent} TO ${bootstrapIdent} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;`,
  `GRANT ${intermediaryIdent} TO ${bootstrapIdent} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;`,
  `GRANT ${workerIdent} TO ${mediaIdent} WITH INHERIT TRUE, SET TRUE;`,
  `GRANT ${operationalMediaIdent} TO ${c4MediaIdent} WITH INHERIT FALSE, SET TRUE;`,
  `GRANT ${workerIdent} TO ${legacyStaffIdent} WITH INHERIT TRUE, SET TRUE;`,
  `GRANT ${staffIdent} TO ${legacyStaffIdent} WITH INHERIT TRUE, SET TRUE;`,
  `GRANT ${workerIdent} TO ${legacyArbitraryIdent} WITH INHERIT TRUE, SET TRUE;`,
  `GRANT ${arbitraryCapabilityIdent} TO ${legacyArbitraryIdent} WITH INHERIT TRUE, SET TRUE;`,
  `GRANT ${operationalMediaIdent} TO ${c4UnrelatedIdent} WITH INHERIT FALSE, SET TRUE;`,
  `GRANT ${arbitraryCapabilityIdent} TO ${c4UnrelatedIdent} WITH INHERIT FALSE, SET TRUE;`,
  `GRANT ${workerIdent} TO ${mixedIdent} WITH INHERIT TRUE, SET TRUE;`,
  `GRANT ${operationalMediaIdent} TO ${mixedIdent} WITH INHERIT FALSE, SET TRUE;`,
  `GRANT ${operationalMediaIdent} TO ${siblingOperationalIdent} WITH INHERIT FALSE, SET TRUE;`,
  `GRANT ${siblingCapabilityIdent} TO ${siblingOperationalIdent} WITH INHERIT FALSE, SET TRUE;`,
  'CREATE SCHEMA app;',
  `CREATE FUNCTION app.read_public_runtime_setting(text, text)
    RETURNS TABLE (value_json jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
    AS $$ SELECT '{"value":true}'::jsonb $$;`,
  `CREATE FUNCTION app.read_webapp_server_runtime_setting(text, text)
    RETURNS TABLE (value_json jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
    AS $$ SELECT '{"value":120}'::jsonb $$;`,
  `CREATE FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid)
    RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
    AS $$
      SELECT CASE
        WHEN $1 IS NULL
         AND $2 IS NULL
         AND $3 = '53000000-0000-4000-8000-0000000056a1'::uuid
        THEN '53000000-0000-4000-8000-000000000001'::uuid
        ELSE NULL::uuid
      END
    $$;`,
  `CREATE FUNCTION app.resolve_public_organization_slug(text)
    RETURNS TABLE (organization_id uuid, requested_slug text, requested_kind text, canonical_slug text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
    AS $$
      SELECT
        '53000000-0000-4000-8000-000000000001'::uuid,
        'saas-test-clinic-a'::text,
        'alias'::text,
        'saas-test-clinic-current'::text
      WHERE lower(btrim($1)) = 'saas-test-clinic-a'
    $$;`,
  `CREATE FUNCTION app.resolve_public_organization_by_slug(text)
    RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
    AS $$
      SELECT CASE
        WHEN lower(btrim($1)) = 'saas-test-clinic-a'
        THEN '53000000-0000-4000-8000-000000000001'::uuid
        ELSE NULL::uuid
      END
    $$;`,
  `CREATE FUNCTION app.resolve_payment_webhook_organization(text, text, text)
    RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
    AS $$
      SELECT CASE
        WHEN $1 = 'mock' AND $2 = 'payment-event-1' AND $3 = 'payment.succeeded'
        THEN '53000000-0000-4000-8000-000000000001'::uuid
        ELSE NULL::uuid
      END
    $$;`,
  'REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC;',
  'REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;',
  `GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text) TO ${staffIdent}, ${patientIdent}, ${arbitraryCapabilityIdent};`,
  `GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text) TO ${staffIdent}, ${patientIdent}, ${arbitraryCapabilityIdent};`,
  `GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text) TO ${bootstrapIdent} WITH GRANT OPTION;`,
  `GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text) TO ${bootstrapIdent} WITH GRANT OPTION;`,
  `GRANT USAGE ON SCHEMA app TO ${bootstrapIdent}, ${staffIdent}, ${patientIdent};`,
  ...functionSignatures.map(createFunctionSql),
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;',
  `GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO ${patientIdent}, ${arbitraryCapabilityIdent};`,
  `GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO ${bootstrapIdent} WITH GRANT OPTION;`,
  `GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO ${patientIdent}, ${arbitraryCapabilityIdent};`,
  `GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO ${bootstrapIdent} WITH GRANT OPTION;`,
  `GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO ${patientIdent}, ${arbitraryCapabilityIdent};`,
  `GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO ${bootstrapIdent} WITH GRANT OPTION;`,
  `GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO ${patientIdent}, ${arbitraryCapabilityIdent};`,
  `GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO ${bootstrapIdent} WITH GRANT OPTION;`,
  `SET SESSION AUTHORIZATION ${bootstrapIdent};`,
  'GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text) TO PUBLIC;',
  'GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO PUBLIC;',
  'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO PUBLIC;',
  'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO PUBLIC;',
  'GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO PUBLIC;',
  'RESET SESSION AUTHORIZATION;',
  `GRANT EXECUTE ON FUNCTION app.release_principal_context() TO ${staffIdent}, ${patientIdent};`,
  `GRANT EXECUTE ON FUNCTION app.current_org_id() TO ${patientIdent};`,
  `GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO ${patientIdent};`,
  ...tableNames
    .filter((table) => table !== 'public.app_runtime_settings')
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
  'ALTER TABLE public.app_runtime_settings ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.app_runtime_settings FORCE ROW LEVEL SECURITY;',
  `GRANT SELECT ON TABLE public.app_runtime_settings TO ${patientIdent};`,
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
  'CREATE TABLE public.system_settings (id integer);',
  `GRANT SELECT ON TABLE public.system_settings TO ${intermediaryIdent};`,
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
  'ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.media_files FORCE ROW LEVEL SECURITY;',
  'ALTER TABLE public.media_transcode_jobs ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.media_transcode_jobs FORCE ROW LEVEL SECURITY;',
].join('\n');

const applySql = [
  `\\set d3_4_bootstrap_base_role ${bootstrapRole}`,
  `\\set d3_4_media_worker_runtime_role ${mediaRole}`,
  artifact,
  appWorkerArtifact,
  runtimeAudiencePolicy,
].join('\n');

const adversarialPrestateSql = `
SELECT 1 / (
  (SELECT rolinherit FROM pg_roles WHERE rolname = ${quoteLiteral(bootstrapRole)})
)::int;
SELECT 1 / has_table_privilege(
  ${quoteLiteral(bootstrapRole)}, 'public.app_runtime_settings', 'SELECT'
)::int;
SELECT 1 / has_table_privilege(
  ${quoteLiteral(bootstrapRole)}, 'public.system_settings', 'SELECT'
)::int;
`;

// The same pre-C4 D3.4 artifact must also accept the canonical C4 SET-only shape.
// Applying it a second time proves that shape against a real PostgreSQL 16 catalog.
const applyC4ShapeSql = [
  `\\set d3_4_bootstrap_base_role ${bootstrapRole}`,
  `\\set d3_4_media_worker_runtime_role ${c4MediaRole}`,
  artifact,
].join('\n');

function malformedShapeSql(roleName) {
  return [
    `\\set d3_4_bootstrap_base_role ${bootstrapRole}`,
    `\\set d3_4_media_worker_runtime_role ${roleName}`,
    artifact,
  ].join('\n');
}

const proofSql = `
SELECT 1 / (
  SELECT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls
  FROM pg_roles
  WHERE rolname = ${quoteLiteral(bootstrapRole)}
)::int;
SELECT 1 / ((
  SELECT count(*)
  FROM pg_auth_members membership
  JOIN pg_roles granted ON granted.oid = membership.roleid
  JOIN pg_roles member ON member.oid = membership.member
  WHERE member.rolname = ${quoteLiteral(bootstrapRole)}
    AND granted.rolname = ${quoteLiteral(patientRole)}
    AND NOT membership.admin_option
    AND NOT membership.inherit_option
    AND membership.set_option
) = 1)::int;
SELECT 1 / ((
  SELECT count(*)
  FROM pg_auth_members membership
  JOIN pg_roles member ON member.oid = membership.member
  WHERE member.rolname = ${quoteLiteral(bootstrapRole)}
) = 1)::int;
SELECT 1 / (NOT has_table_privilege(${quoteLiteral(bootstrapRole)}, 'public.app_runtime_settings', 'SELECT'))::int;
SELECT 1 / (NOT has_table_privilege(${quoteLiteral(bootstrapRole)}, 'public.system_settings', 'SELECT'))::int;
SELECT 1 / (NOT has_table_privilege(${quoteLiteral(bootstrapRole)}, 'public.be_payment_provider_events', 'SELECT'))::int;
SELECT 1 / (NOT has_table_privilege(${quoteLiteral(bootstrapRole)}, 'public.be_payment_intents', 'SELECT'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.read_public_runtime_setting(text,text)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.read_webapp_server_runtime_setting(text,text)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.resolve_public_booking_organization(uuid,uuid,uuid)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(patientRole)}, 'app.resolve_public_booking_organization(uuid,uuid,uuid)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(arbitraryCapabilityRole)}, 'app.resolve_public_booking_organization(uuid,uuid,uuid)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.resolve_public_organization_slug(text)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(patientRole)}, 'app.resolve_public_organization_slug(text)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(arbitraryCapabilityRole)}, 'app.resolve_public_organization_slug(text)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.resolve_public_organization_by_slug(text)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(patientRole)}, 'app.resolve_public_organization_by_slug(text)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(arbitraryCapabilityRole)}, 'app.resolve_public_organization_by_slug(text)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.resolve_payment_webhook_organization(text,text,text)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(patientRole)}, 'app.resolve_payment_webhook_organization(text,text,text)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(arbitraryCapabilityRole)}, 'app.resolve_payment_webhook_organization(text,text,text)', 'EXECUTE'))::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_proc procedure
  CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  WHERE procedure.oid = 'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE'
))::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_proc procedure
  CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  WHERE procedure.oid = 'app.resolve_public_organization_slug(text)'::regprocedure
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE'
))::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_proc procedure
  CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  WHERE procedure.oid = 'app.resolve_public_organization_by_slug(text)'::regprocedure
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE'
))::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_proc procedure
  CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  WHERE procedure.oid IN (
    'app.read_public_runtime_setting(text,text)'::regprocedure,
    'app.read_webapp_server_runtime_setting(text,text)'::regprocedure,
    'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
    'app.resolve_public_organization_slug(text)'::regprocedure,
    'app.resolve_public_organization_by_slug(text)'::regprocedure,
    'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
  )
    AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = ${quoteLiteral(bootstrapRole)})
    AND privilege.is_grantable
))::int;
SET SESSION AUTHORIZATION ${bootstrapIdent};
SELECT 1 / ((SELECT value_json FROM app.read_public_runtime_setting('oauth_google_enabled','admin')) = '{"value":true}'::jsonb)::int;
SELECT 1 / ((SELECT value_json FROM app.read_webapp_server_runtime_setting('video_presign_ttl_seconds','admin')) = '{"value":120}'::jsonb)::int;
SELECT 1 / (
  app.resolve_public_booking_organization(
    NULL::uuid,
    NULL::uuid,
    '53000000-0000-4000-8000-0000000056a1'::uuid
  ) = '53000000-0000-4000-8000-000000000001'::uuid
)::int;
SELECT 1 / (
  (SELECT canonical_slug FROM app.resolve_public_organization_slug(' SaaS-Test-Clinic-A '))
  = 'saas-test-clinic-current'::text
)::int;
SELECT 1 / (
  app.resolve_public_organization_by_slug(' SaaS-Test-Clinic-A ')
  = '53000000-0000-4000-8000-000000000001'::uuid
)::int;
SELECT 1 / (
  app.resolve_payment_webhook_organization('mock', 'payment-event-1', 'payment.succeeded')
  = '53000000-0000-4000-8000-000000000001'::uuid
)::int;
SET ROLE ${patientIdent};
SELECT 1 / ((SELECT count(*) FROM public.app_runtime_settings) = 2)::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1 FROM public.app_runtime_settings WHERE audience = 'server'
))::int;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT 1 / has_function_privilege(${quoteLiteral(staffRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.auth_user_pin_read(uuid)', 'EXECUTE')::int;
SELECT 1 / has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.auth_user_pin_upsert(uuid,text)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.auth_user_pin_read_self()', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.auth_user_pin_upsert_self(text)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.auth_user_pin_read(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.auth_user_pin_upsert(uuid,text)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.auth_user_pin_increment_failed(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.auth_user_pin_reset_attempts(uuid)', 'EXECUTE'))::int;
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
  run('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);
  psql(dbName, setupSql);
  psql(dbName, adversarialPrestateSql);
  psql(dbName, applySql);
  psql(dbName, applyC4ShapeSql);
  // Every malformed shape must fail in real PostgreSQL 16 before D3.4 grants anything.
  psqlExpectFailure(dbName, malformedShapeSql(legacyStaffRole));
  psqlExpectFailure(dbName, malformedShapeSql(legacyArbitraryRole));
  psqlExpectFailure(dbName, malformedShapeSql(c4UnrelatedRole));
  psqlExpectFailure(dbName, malformedShapeSql(mixedRole));
  psqlExpectFailure(dbName, malformedShapeSql(siblingOperationalRole));
  psqlProveGrantDenied(dbName, bootstrapIdent);
  psql(dbName, proofSql);
  process.stdout.write('smoke-d3-4-runtime-helper-grants: OK\n');
} finally {
  run('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
  psql(
    'postgres',
    [
      `DROP ROLE IF EXISTS ${bootstrapIdent};`,
      `DROP ROLE IF EXISTS ${intermediaryIdent};`,
      `DROP ROLE IF EXISTS ${mediaIdent};`,
      `DROP ROLE IF EXISTS ${c4MediaIdent};`,
      `DROP ROLE IF EXISTS ${legacyStaffIdent};`,
      `DROP ROLE IF EXISTS ${legacyArbitraryIdent};`,
      `DROP ROLE IF EXISTS ${c4UnrelatedIdent};`,
      `DROP ROLE IF EXISTS ${mixedIdent};`,
      `DROP ROLE IF EXISTS ${siblingOperationalIdent};`,
      `DROP ROLE IF EXISTS ${operationalMediaIdent};`,
      `DROP ROLE IF EXISTS ${arbitraryCapabilityIdent};`,
      `DROP ROLE IF EXISTS ${siblingCapabilityIdent};`,
      `DROP ROLE IF EXISTS ${workerIdent};`,
      `DROP ROLE IF EXISTS ${staffIdent};`,
      `DROP ROLE IF EXISTS ${patientIdent};`,
    ].join('\n'),
  );
}
