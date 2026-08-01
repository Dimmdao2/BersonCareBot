#!/usr/bin/env node
/**
 * Ч7 audit acceptance test.
 *
 * Owns a disposable PostgreSQL 16 cluster under /tmp. It never reads application environment
 * variables and never connects to DEV, TEST, or PROD. Output contains only aggregate booleans and
 * row counts; credential-shaped fixtures are not printed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const stamp = `${process.pid}_${Date.now()}`;
const scratch = mkdtempSync(`/tmp/bcb_ch7_settings_audit_${stamp}_`);
const data = path.join(scratch, 'data');
const socket = path.join(scratch, 'socket');
const log = path.join(scratch, 'postgres.log');
const database = `bcb_ch7_settings_audit_${stamp}`;
const organizationId = '20000000-0000-4000-8000-000000000001';
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
const failures = [];
let serverStarted = false;
let port;

function failInfrastructure(label) {
  throw new Error(`CH7 disposable acceptance infrastructure failed: ${label}`);
}

function run(command, args, input, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: safeEnv,
    input,
  });
  if (result.error || result.status !== 0) failInfrastructure(label);
  return result.stdout;
}

function sql(text, label = 'private SQL operation') {
  return run(
    path.join(pgBin, 'psql'),
    ['-X', '-qAt', '-h', socket, '-p', port, '-v', 'ON_ERROR_STOP=1', '-d', database],
    text,
    label,
  ).trim();
}

function sqlMustFail(text, label) {
  const result = spawnSync(
    path.join(pgBin, 'psql'),
    ['-X', '-qAt', '-h', socket, '-p', port, '-v', 'ON_ERROR_STOP=1', '-d', database],
    { cwd: root, encoding: 'utf8', env: safeEnv, input: text },
  );
  if (result.status === 0) failures.push(label);
}

function apply(relativePath) {
  sql(readFileSync(path.join(root, relativePath), 'utf8'), `apply ${relativePath}`);
}

function assertEqual(label, observed, expected) {
  if (observed !== expected) failures.push(`${label}: expected ${expected}, observed ${observed}`);
}

function installPredecessor() {
  sql(`
    DROP SCHEMA IF EXISTS app CASCADE;
    DROP TABLE IF EXISTS public.app_runtime_settings CASCADE;
    DROP TABLE IF EXISTS public.system_settings CASCADE;
    DROP TABLE IF EXISTS public.be_organizations CASCADE;

    CREATE SCHEMA app AUTHORIZATION app_owner;
    CREATE TABLE public.be_organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.app_runtime_settings (
      key text NOT NULL,
      scope text NOT NULL,
      organization_id uuid,
      audience text NOT NULL,
      value_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid
    );
    CREATE UNIQUE INDEX app_runtime_settings_global_key_scope_uidx
      ON public.app_runtime_settings (key, scope) WHERE organization_id IS NULL;
    CREATE UNIQUE INDEX app_runtime_settings_org_key_scope_uidx
      ON public.app_runtime_settings (key, scope, organization_id)
      WHERE organization_id IS NOT NULL;

    CREATE TABLE public.system_settings (
      key text NOT NULL,
      scope text NOT NULL,
      organization_id uuid,
      value_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid
    );
    CREATE UNIQUE INDEX system_settings_global_key_scope_uidx
      ON public.system_settings (key, scope) WHERE organization_id IS NULL;
    CREATE UNIQUE INDEX system_settings_org_key_scope_uidx
      ON public.system_settings (key, scope, organization_id)
      WHERE organization_id IS NOT NULL;

    INSERT INTO public.be_organizations (id) VALUES ('${organizationId}');
    GRANT USAGE ON SCHEMA app TO app_anon;
    GRANT SELECT ON public.app_runtime_settings, public.system_settings TO app_owner;

    CREATE FUNCTION app.is_smtp_outbound_configured()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $function$
      SELECT EXISTS (
        SELECT 1
        FROM public.system_settings
        WHERE key = 'smtp_outbound'
          AND scope = 'admin'
          AND organization_id IS NULL
      )
    $function$;
    ALTER FUNCTION app.is_smtp_outbound_configured() OWNER TO app_owner;
    REVOKE ALL ON FUNCTION app.is_smtp_outbound_configured() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.is_smtp_outbound_configured() TO app_anon;
  `, 'install minimal predecessor');
}

function applyCh7Migrations() {
  apply('apps/webapp/db/drizzle-migrations/0300_runtime_settings_values_live_in_db.sql');
  apply('apps/webapp/db/drizzle-migrations/0301_legacy_runtime_settings_values_live_in_db.sql');
  apply('apps/webapp/db/drizzle-migrations/0302_public_auth_channel_configured_accessors.sql');
}

async function reservePrivatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    failInfrastructure('could not reserve a private PostgreSQL port');
  }
  const reservedPort = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return String(reservedPort);
}

try {
  if (!existsSync(path.join(pgBin, 'initdb'))) {
    failInfrastructure('PostgreSQL 16 binaries are unavailable');
  }
  port = await reservePrivatePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale'], undefined, 'initdb');
  run(
    path.join(pgBin, 'pg_ctl'),
    ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    undefined,
    'start private PostgreSQL',
  );
  serverStarted = true;
  run(
    path.join(pgBin, 'createdb'),
    ['-h', socket, '-p', port, database],
    undefined,
    'create scratch database',
  );
  sql('CREATE ROLE app_owner NOLOGIN; CREATE ROLE app_anon NOLOGIN;', 'create fixture roles');

  installPredecessor();
  applyCh7Migrations();
  const freshGlobalRowCounts = sql(`
    SELECT
      (SELECT count(*) FROM public.app_runtime_settings WHERE organization_id IS NULL)
      || '|'
      || (SELECT count(*) FROM public.system_settings WHERE organization_id IS NULL);
  `);
  assertEqual('fresh global row counts', freshGlobalRowCounts, '39|28');

  installPredecessor();
  sql(`
    INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json)
    VALUES
      ('auth_email_enabled', 'admin', NULL, 'public', '{"value":false}'::jsonb),
      ('support_contact_url', 'admin', NULL, 'public', '{"value":""}'::jsonb),
      ('patient_app_maintenance_message', 'admin', NULL, 'authenticated_client', '{"value":""}'::jsonb);
    INSERT INTO public.system_settings (key, scope, organization_id, value_json)
    VALUES
      ('smsc_api_key', 'admin', NULL, '{"value":"existing-sms-key"}'::jsonb),
      ('max_bot_api_key', 'admin', NULL, '{"value":"existing-max-key"}'::jsonb),
      ('operator_heartbeat_config', 'admin', NULL, '{"value":{}}'::jsonb);
  `, 'install pre-existing administrator values');
  applyCh7Migrations();

  const existingRuntimeValuesPreserved = sql(`
    SELECT
      (SELECT value_json = '{"value":false}'::jsonb FROM public.app_runtime_settings
       WHERE key = 'auth_email_enabled' AND scope = 'admin' AND organization_id IS NULL)
      || '|'
      || (SELECT value_json = '{"value":""}'::jsonb FROM public.app_runtime_settings
       WHERE key = 'support_contact_url' AND scope = 'admin' AND organization_id IS NULL)
      || '|'
      || (SELECT value_json = '{"value":""}'::jsonb FROM public.app_runtime_settings
       WHERE key = 'patient_app_maintenance_message' AND scope = 'admin'
         AND organization_id IS NULL);
  `);
  assertEqual(
    'pre-existing runtime values preserved',
    existingRuntimeValuesPreserved,
    'true|true|true',
  );

  const existingRestrictedValuesPreserved = sql(`
    SELECT bool_and(setting.value_json = expected.value_json)
    FROM (VALUES
      ('smsc_api_key', '{"value":"existing-sms-key"}'::jsonb),
      ('max_bot_api_key', '{"value":"existing-max-key"}'::jsonb),
      ('operator_heartbeat_config', '{"value":{}}'::jsonb)
    ) AS expected(key, value_json)
    JOIN public.system_settings AS setting
      ON setting.key = expected.key
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL;
  `);
  assertEqual('pre-existing restricted values preserved', existingRestrictedValuesPreserved, 't');

  sql("DELETE FROM public.system_settings WHERE key = 'smsc_api_key' AND scope = 'admin';");
  const missingSmsRow = sql('SELECT app.is_sms_provider_configured();');
  assertEqual('missing SMS row refuses an answer', missingSmsRow, 'runtime_setting_unavailable');

  const publicAclAndFunctionShape = sql(`
    SELECT
      has_table_privilege('app_anon', 'public.system_settings', 'SELECT')
      || '|'
      || has_function_privilege('app_anon', 'app.is_sms_provider_configured()', 'EXECUTE')
      || '|'
      || has_function_privilege('app_anon', 'app.is_telegram_login_configured()', 'EXECUTE')
      || '|'
      || has_function_privilege('app_anon', 'app.is_max_bot_configured()', 'EXECUTE')
      || '|'
      || (
        SELECT count(*) = 3
        FROM pg_proc
        WHERE oid IN (
          'app.is_sms_provider_configured()'::regprocedure,
          'app.is_telegram_login_configured()'::regprocedure,
          'app.is_max_bot_configured()'::regprocedure
        )
          AND pronargs = 0
          AND prorettype = 'boolean'::regtype
      );
  `);
  assertEqual(
    'public ACL and closed function shape',
    publicAclAndFunctionShape,
    'false|true|true|true|true',
  );
  sqlMustFail(
    'SET ROLE app_anon; SELECT value_json FROM public.system_settings LIMIT 1;',
    'anonymous role can select credential-bearing settings',
  );

  console.log(JSON.stringify({
    freshGlobalRowCounts,
    existingRuntimeValuesPreserved,
    existingRestrictedValuesPreserved,
    missingSmsRow,
    publicAclAndFunctionShape,
    failures,
  }, null, 2));
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
      encoding: 'utf8',
      env: safeEnv,
    });
  }
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) process.exitCode = 1;
