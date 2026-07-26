#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const paths = {
  migration: 'apps/webapp/db/drizzle-migrations/0191_integrator_server_runtime_config.sql',
  restrictedMigration:
    'apps/webapp/db/drizzle-migrations/0235_integrator_smtp_restricted_accessor.sql',
  overlay: 'deploy/postgres/integrator-server-runtime-config.sql',
  reader: 'apps/integrator/src/infra/db/publicRuntimeSettings.ts',
  restrictedReader: 'apps/integrator/src/infra/db/publicRestrictedSettings.ts',
  resolver: 'apps/integrator/src/config/appBaseUrl.ts',
  smtpResolver: 'apps/integrator/src/config/smtpOutbound.ts',
  emailIndex: 'apps/integrator/src/integrations/email/index.ts',
  principal: 'apps/integrator/src/infra/db/withClient.ts',
  api: 'apps/integrator/src/main.ts',
  worker: 'apps/integrator/src/infra/runtime/worker/main.ts',
  scheduler: 'apps/integrator/src/infra/runtime/scheduler/main.ts',
  envSchema: 'apps/integrator/src/config/env.ts',
  envExample: '.env.example',
  configDocs: 'docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md',
  journal: 'apps/webapp/db/drizzle-migrations/meta/_journal.json',
  deploy: 'deploy/host/deploy-test-saas.sh',
  smtpSmoke:
    'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-integrator-smtp-restricted-access.mjs',
  e1Overlay: 'deploy/postgres/e1-webapp-runtime-config.sql',
  adminEmailMigration:
    'apps/webapp/db/drizzle-migrations/0231_admin_email_role_runtime_config.sql',
  envRole: 'apps/webapp/src/modules/auth/envRole.ts',
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
  requireFragments('restricted SMTP migration', files.restrictedMigration, [
    'CREATE OR REPLACE FUNCTION app.read_integrator_smtp_outbound_setting()',
    'SECURITY DEFINER',
    'SET search_path = pg_catalog',
    "setting.key = 'smtp_outbound'",
    "setting.scope = 'admin'",
    'setting.organization_id IS NULL',
    'ALTER FUNCTION app.read_integrator_smtp_outbound_setting() OWNER TO app_owner;',
    'REVOKE ALL ON FUNCTION app.read_integrator_smtp_outbound_setting() FROM PUBLIC;',
    'FROM app_staff, app_patient, app_worker;',
  ]);
  forbidFragments('restricted SMTP migration', files.restrictedMigration, [
    'GRANT SELECT ON TABLE public.system_settings',
    'p_key',
    'process.env',
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
    'GRANT EXECUTE ON FUNCTION app.read_integrator_smtp_outbound_setting()',
    'ALTER FUNCTION app.read_integrator_smtp_outbound_setting() OWNER TO app_owner;',
    'REVOKE ALL ON FUNCTION app.read_integrator_smtp_outbound_setting() FROM PUBLIC;',
    'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_smtp_outbound_setting()\n  FROM :"integrator_runtime_config_role" CASCADE;',
    'DO $smtp_acl_scrub$',
    'SELECT DISTINCT privilege.grantee, role.rolname',
    'privilege.grantee <> procedure.proowner',
    'FROM PUBLIC CASCADE',
    'FROM %I CASCADE',
    "'app.read_integrator_smtp_outbound_setting()',",
    'TO :"integrator_runtime_config_role";',
    'CREATE OR REPLACE FUNCTION app.read_global_server_runtime_setting(p_key text)',
    "AND setting.audience IN ('server', 'public')",
    'integrator_server_runtime_config_least_privilege_verified',
    'GRANT EXECUTE ON FUNCTION app.release_principal_context()',
    'app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)',
    'app.reset_principal_context()',
    'app.close_active_user_phone_history(uuid)',
    'Bootstrap/infra cleanup runs before any SET ROLE',
    "'app_staff', 'app.release_principal_context()', 'EXECUTE'",
    "'app_patient', 'app.release_principal_context()', 'EXECUTE'",
    'SELECT oid, NOT rolinherit AS noinherit',
    'aclexplode(',
    "privilege.grantee IN (0, runtime_role.oid)",
    'privilege.grantee NOT IN (procedure.proowner, runtime_role.oid)',
    "owner.rolname <> 'app_owner'",
    "privilege.privilege_type <> 'EXECUTE'",
    'OR privilege.is_grantable',
  ]);
  forbidFragments('overlay', files.overlay, [
    'GRANT SELECT ON TABLE public.app_runtime_settings TO :"integrator_runtime_config_role"',
    'GRANT SELECT ON TABLE public.system_settings',
    'GRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)\n  TO :"integrator_runtime_config_role"',
    // A-5 (2026-07-26): the audience widening must stay a two-way OR of exactly ('server','public')
    // -- never a bare narrow 'server'-only re-check (that is the regression this file fixes) and
    // never widened further (e.g. 'authenticated_client') without a fresh owner-reviewed decision.
    "AND setting.audience = 'server'\n    AND setting.organization_id IS NULL",
    "setting.audience IN ('server', 'public', 'authenticated_client')",
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
  requireFragments('restricted SMTP reader', files.restrictedReader, [
    'readSmtpOutboundSettingValueJson',
    'SELECT app.read_integrator_smtp_outbound_setting() AS value_json',
  ]);
  forbidFragments('restricted SMTP reader', files.restrictedReader, [
    'public.system_settings',
    'public.app_runtime_settings',
    'process.env',
    'p_key',
  ]);
  requireFragments('SMTP resolver', files.smtpResolver, [
    'runWithBootstrapPrincipal',
    "{ source: 'integrator-server-runtime-config' }",
    '() => readSmtpOutboundSettingValueJson(db)',
    'readSmtpOutboundSettingValueJson(db)',
    "reason: 'restricted_setting_read_failed'",
    '[smtpOutbound] restricted DB setting unavailable',
  ]);
  forbidFragments('SMTP resolver', files.smtpResolver, [
    'fetchPublicSystemSettingValueJson',
    'fromEnvFallback',
    'emailConfig',
    '{ err',
  ]);
  forbidFragments('email integration exports', files.emailIndex, [
    'emailConfig',
    './config.js',
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
  requireFragments('api startup', files.api, [
    'const runtimeDb = createDbPort()',
    'await getAppBaseUrl(runtimeDb)',
  ]);
  requireFragments('worker startup', files.worker, [
    'const projectionDb = createDbPort()',
    'await getAppBaseUrl(projectionDb)',
  ]);
  requireFragments('scheduler startup', files.scheduler, ['await getAppBaseUrl(createDbPort())']);
  forbidFragments('integrator env schema', files.envSchema, ['APP_BASE_URL']);
  forbidFragments('integrator env example', files.envExample, ['APP_BASE_URL=']);
  forbidFragments('integrator env example', files.envExample, [
    'SMTP_HOST=',
    'SMTP_USER=',
    'SMTP_PASS=',
    'MAIL_FROM=',
  ]);
  requireFragments('configuration docs', files.configDocs, [
    'Integrator не имеет ambient SELECT на обе таблицы для этого чтения',
    'не использует `APP_BASE_URL` env fallback',
  ]);
  requireFragments('migration journal', files.journal, [
    '"idx": 190',
    '"tag": "0190_curated_system_health_diagnostics"',
    '"idx": 191',
    '"tag": "0191_integrator_server_runtime_config"',
    '"idx": 235',
    '"tag": "0235_integrator_smtp_restricted_accessor"',
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
    "has_function_privilege(current_user, 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE')",
    "privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
    "privilege.grantee NOT IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = current_user))",
    "owner.rolname <> 'app_owner'",
    "privilege.privilege_type <> 'EXECUTE'",
    'integrator DB-backed runtime/SMTP accessors are not ready',
    'integrator DB-backed runtime/SMTP accessors: OK (exact ACL, no table SELECT)',
    'aclexplode(COALESCE(relation.relacl, acldefault',
    "privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = current_user))",
    "pg_has_role(current_user, pg_get_userbyid(relation.relowner), 'MEMBER')",
    "app.read_global_server_runtime_setting('app_base_url')",
    'install_integrator_server_runtime_config_overlay',
    'assert_integrator_server_runtime_config_ready',
    'SELECT app.release_principal_context();',
    "NOT has_function_privilege(current_user, 'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)', 'EXECUTE')",
    "NOT has_function_privilege(current_user, 'app.reset_principal_context()', 'EXECUTE')",
  ]);
  requireFragments('disposable SMTP ACL smoke', files.smtpSmoke, [
    'bcb-integrator-smtp-acl-',
    'initdb',
    'pg_ctl',
    '0235_integrator_smtp_restricted_accessor.sql',
    'integrator-server-runtime-config.sql',
    'TO smtp_stale WITH GRANT OPTION',
    'SET ROLE smtp_stale',
    'TO smtp_delegated',
    'for (let pass = 0; pass < 2; pass += 1)',
    'privilege.grantee NOT IN (',
    "NOT has_table_privilege('smtp_runtime', 'public.system_settings', 'SELECT')",
    "NOT has_function_privilege('smtp_runtime', 'app.current_org_id()', 'EXECUTE')",
    "SET SESSION AUTHORIZATION smtp_runtime",
    'smtp_runtime_table_read_unexpectedly_succeeded',
    'smtp_runtime_current_org_unexpectedly_succeeded',
    'runRuntimePathProbe',
    'smtp-runtime-path.probe.mts',
    'resolveSmtpOutboundConfig(createDbPort())',
    'DB_PRINCIPAL_CONTEXT_MODE: "locked"',
    'deployed_locked_smtp_runtime_path_not_configured',
    'locked runtime path, exact ACL, role denials, idempotent reapply',
  ]);
  requireFragments('current admin-email runtime projection', files.adminEmailMigration, [
    "('admin_emails', '{\"value\":\"\"}'::jsonb)",
    "'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails'",
    'REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;',
  ]);
  requireFragments('ordinary deploy E1 overlay', files.e1Overlay, [
    '0201_e1_webapp_auth_role_runtime_config.sql',
    '0230_error_tracking_runtime.sql',
    '0231_admin_email_role_runtime_config.sql',
  ]);
  const legacyRoleProjection = files.e1Overlay.indexOf(
    '0201_e1_webapp_auth_role_runtime_config.sql',
  );
  const currentEmailProjection = files.e1Overlay.indexOf(
    '0231_admin_email_role_runtime_config.sql',
  );
  if (legacyRoleProjection < 0 || currentEmailProjection <= legacyRoleProjection) {
    fail('ordinary deploy E1 overlay does not restore admin_emails after legacy 0201');
  }
  // C-4 (2026-07-26, commit 5f81febc4, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): this same commit
  // that closed the admin_emails DB-list hole also switched isVerifiedEmailGlobalAdminAsync from
  // reading admin_emails via getFreshServerRuntimeTokenList to comparing against the single
  // env-pinned PLATFORM_OWNER_IDENTITY -- this script's own requirement just never got updated to
  // match, same stale-assertion class fixed in check-e1-webapp-runtime-config.mjs's envRole block.
  requireFragments('fresh verified-email policy', files.envRole, [
    'isVerifiedEmailGlobalAdminAsync',
    'PLATFORM_OWNER_IDENTITY',
    'return false;',
  ]);
  forbidFragments('fresh verified-email policy', files.envRole, ['getFreshServerRuntimeTokenList(']);
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
      restrictedReader: `${readFileSync(paths.restrictedReader, 'utf8')}\n// public.system_settings`,
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject direct restricted SMTP table access');
  rejected = false;
  try {
    run({
      smtpResolver: readFileSync(paths.smtpResolver, 'utf8').replace(
        "{ source: 'integrator-server-runtime-config' }",
        "{ source: 'removed-smtp-runtime-principal' }",
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject a missing SMTP runtime bootstrap principal');
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
  rejected = false;
  try {
    run({
      overlay: readFileSync(paths.overlay, 'utf8').replace(
        'GRANT EXECUTE ON FUNCTION app.release_principal_context()\n  TO :"integrator_runtime_config_role";',
        '-- removed required base-login cleanup capability',
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject a missing base-login release capability');
  rejected = false;
  try {
    run({
      overlay: `${readFileSync(paths.overlay, 'utf8')}\nGRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)\n  TO :"integrator_runtime_config_role";\n`,
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject ambient base-login install capability');
  rejected = false;
  try {
    run({
      overlay: readFileSync(paths.overlay, 'utf8').replace(
        'DO $smtp_acl_scrub$',
        'DO $removed_smtp_acl_scrub$',
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject a missing exact SMTP ACL scrub');
  rejected = false;
  try {
    run({
      deploy: readFileSync(paths.deploy, 'utf8').replace(
        "privilege.grantee NOT IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = current_user))",
        'false',
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject a stale TEST readiness ACL predicate');
  rejected = false;
  try {
    run({
      smtpSmoke: readFileSync(paths.smtpSmoke, 'utf8').replace(
        'for (let pass = 0; pass < 2; pass += 1)',
        'for (let pass = 0; pass < 1; pass += 1)',
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject a non-idempotent SMTP ACL smoke');
  rejected = false;
  try {
    run({
      e1Overlay: readFileSync(paths.e1Overlay, 'utf8').replace(
        '\\ir ../../apps/webapp/db/drizzle-migrations/0231_admin_email_role_runtime_config.sql',
        '-- removed current admin-email projection',
      ),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test did not reject ordinary-deploy admin_emails drift');
  console.log('check-integrator-server-runtime-config: self-test OK');
} else {
  run();
  console.log('check-integrator-server-runtime-config: OK');
}
