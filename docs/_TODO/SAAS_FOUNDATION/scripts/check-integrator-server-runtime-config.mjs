#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const paths = {
  migration: 'apps/webapp/db/drizzle-migrations/0191_integrator_server_runtime_config.sql',
  overlay: 'deploy/postgres/integrator-server-runtime-config.sql',
  reader: 'apps/integrator/src/infra/db/publicRuntimeSettings.ts',
  resolver: 'apps/integrator/src/config/appBaseUrl.ts',
  principal: 'apps/integrator/src/infra/db/withClient.ts',
  api: 'apps/integrator/src/main.ts',
  worker: 'apps/integrator/src/infra/runtime/worker/main.ts',
  scheduler: 'apps/integrator/src/infra/runtime/scheduler/main.ts',
  envSchema: 'apps/integrator/src/config/env.ts',
  envExample: '.env.example',
  configDocs: 'docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md',
  journal: 'apps/webapp/db/drizzle-migrations/meta/_journal.json',
  deploy: 'deploy/host/deploy-test-saas.sh',
};

function fail(message) {
  throw new Error(`check-integrator-server-runtime-config: ${message}`);
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(`${label} missing ${JSON.stringify(fragment)}`);
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) fail(`${label} contains forbidden ${JSON.stringify(fragment)}`);
  }
}

function run(overrides = {}) {
  const files = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, overrides[key] ?? readFileSync(path, 'utf8')]),
  );

  requireFragments('migration', files.migration, [
    "setting.key = 'app_base_url'",
    "'server'",
    'CREATE OR REPLACE FUNCTION app.read_global_server_runtime_setting(p_key text)',
    'SECURITY DEFINER',
    'SET search_path = pg_catalog',
    "setting.audience = 'server'",
    'setting.organization_id IS NULL',
    'REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;',
  ]);
  forbidFragments('migration', files.migration, [
    'GRANT SELECT ON TABLE public.system_settings',
    'GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient',
  ]);

  requireFragments('overlay', files.overlay, [
    'integrator_runtime_config_role',
    'AND rolcanlogin',
    'NOT rolsuper',
    'NOT rolbypassrls',
    "NOT pg_has_role(:'integrator_runtime_config_role', 'app_owner', 'MEMBER')",
    'ALTER ROLE :"integrator_runtime_config_role" NOINHERIT;',
    "'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE'",
    "granted_role.rolname IN ('app_staff', 'app_patient', 'app_worker')",
    'membership.inherit_option',
    'membership.set_option',
    'REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings',
    'GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;',
    'ALTER FUNCTION app.read_global_server_runtime_setting(text) OWNER TO app_owner;',
    'REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;',
    'FROM app_staff, app_patient, app_worker;',
    'GRANT EXECUTE ON FUNCTION app.read_global_server_runtime_setting(text)',
    'TO :"integrator_runtime_config_role";',
    'integrator_server_runtime_config_least_privilege_verified',
    'SELECT oid, NOT rolinherit AS noinherit',
    'aclexplode(',
    "privilege.grantee IN (0, runtime_role.oid)",
  ]);
  forbidFragments('overlay', files.overlay, [
    'GRANT SELECT ON TABLE public.app_runtime_settings TO :"integrator_runtime_config_role"',
    'GRANT SELECT ON TABLE public.system_settings',
  ]);

  requireFragments('reader', files.reader, [
    'readGlobalServerRuntimeString',
    'SELECT app.read_global_server_runtime_setting($1) AS value_json',
  ]);
  forbidFragments('reader', files.reader, [
    'public.system_settings',
    'public.app_runtime_settings',
    'process.env',
  ]);

  requireFragments('resolver', files.resolver, [
    "{ source: 'integrator-server-runtime-config' }",
    'readGlobalServerRuntimeString(db, KEY)',
    'app_base_url_runtime_setting_missing',
    'app_base_url_runtime_setting_invalid',
    'DB-backed runtime setting unavailable',
  ]);
  forbidFragments('resolver', files.resolver, [
    'APP_BASE_URL',
    'readPublicSystemSettingString',
    'using env fallback',
    '.catch(() => {})',
  ]);

  requireFragments('principal allowlist', files.principal, [
    "'integrator-server-runtime-config'",
  ]);
  requireFragments('api startup', files.api, ['await getAppBaseUrl(createDbPort())']);
  requireFragments('worker startup', files.worker, [
    'const projectionDb = createDbPort()',
    'await getAppBaseUrl(projectionDb)',
  ]);
  requireFragments('scheduler startup', files.scheduler, ['await getAppBaseUrl(createDbPort())']);
  forbidFragments('integrator env schema', files.envSchema, ['APP_BASE_URL']);
  forbidFragments('integrator env example', files.envExample, ['APP_BASE_URL=']);
  requireFragments('configuration docs', files.configDocs, [
    'Integrator не имеет ambient SELECT на обе таблицы для этого чтения',
    'не использует `APP_BASE_URL` env fallback',
  ]);
  requireFragments('migration journal', files.journal, [
    '"idx": 190',
    '"tag": "0190_curated_system_health_diagnostics"',
    '"idx": 191',
    '"tag": "0191_integrator_server_runtime_config"',
  ]);
  requireFragments('TEST deploy wiring', files.deploy, [
    'INTEGRATOR_SERVER_RUNTIME_CONFIG=deploy/postgres/integrator-server-runtime-config.sql',
    'install_integrator_server_runtime_config_overlay(){',
    'api_runtime_role="$(discover_api_runtime_role)"',
    '-v integrator_runtime_config_role="$api_runtime_role"',
    'assert_integrator_server_runtime_config_ready(){',
    'NOT (SELECT rolinherit FROM pg_roles WHERE rolname = current_user)',
    'NOT membership.inherit_option AND membership.set_option',
    "has_function_privilege(current_user, 'app.read_global_server_runtime_setting(text)', 'EXECUTE')",
    'aclexplode(COALESCE(relation.relacl, acldefault',
    "privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = current_user))",
    "pg_has_role(current_user, pg_get_userbyid(relation.relowner), 'MEMBER')",
    "app.read_global_server_runtime_setting('app_base_url')",
    'install_integrator_server_runtime_config_overlay',
    'assert_integrator_server_runtime_config_ready',
  ]);
}

if (process.argv.includes('--self-test')) {
  let rejected = false;
  try {
    run({ reader: `${readFileSync(paths.reader, 'utf8')}\n// public.system_settings` });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject a restricted-store reader');
  rejected = false;
  try {
    run({
      overlay: readFileSync(paths.overlay, 'utf8').replace(
        'ALTER ROLE :"integrator_runtime_config_role" NOINHERIT;',
        '-- removed unsafe INHERIT normalization',
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject an inheriting API base login');
  rejected = false;
  try {
    run({
      overlay: readFileSync(paths.overlay, 'utf8').replace(
        "'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE'",
        "'GRANT %I TO %I WITH INHERIT TRUE, SET TRUE'",
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject inheriting PostgreSQL 16 membership edges');
  console.log('check-integrator-server-runtime-config: self-test OK');
} else {
  run();
  console.log('check-integrator-server-runtime-config: OK');
}
