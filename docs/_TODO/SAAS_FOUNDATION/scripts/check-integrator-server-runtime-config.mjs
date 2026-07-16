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
    'NOT rolsuper',
    'NOT rolbypassrls',
    "NOT pg_has_role(:'integrator_runtime_config_role', 'app_owner', 'MEMBER')",
    'GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;',
    'ALTER FUNCTION app.read_global_server_runtime_setting(text) OWNER TO app_owner;',
    'REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;',
    'FROM app_staff, app_patient, app_worker;',
    'GRANT EXECUTE ON FUNCTION app.read_global_server_runtime_setting(text)',
    'TO :"integrator_runtime_config_role";',
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
    'Integrator не имеет SELECT на обе таблицы для этого чтения',
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
    "has_function_privilege(current_user, 'app.read_global_server_runtime_setting(text)', 'EXECUTE')",
    "NOT has_table_privilege(current_user, 'public.app_runtime_settings', 'SELECT')",
    "NOT has_table_privilege(current_user, 'public.system_settings', 'SELECT')",
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
  console.log('check-integrator-server-runtime-config: self-test OK');
} else {
  run();
  console.log('check-integrator-server-runtime-config: OK');
}
