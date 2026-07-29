#!/usr/bin/env node
import { sourceTextIncludes } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';

import { renderP05bGrantsSql } from './p0-5b-grants-sql.mjs';
import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import { renderS5ConfigReaderSql, s5ConfigReaderArtifactPath } from './s5-config-reader-sql.mjs';

const files = {
  grants: 'deploy/postgres/p0-5b-grants.sql',
  configReader: s5ConfigReaderArtifactPath,
  pool: 'apps/webapp/src/infra/db/configReaderPoolProvider.ts',
  client: 'apps/webapp/src/infra/db/client.ts',
  smoke: 'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-s5-2-settings-security.mjs',
  packageJson: 'package.json',
};

function fail(message) {
  throw new Error(message);
}

function requireFragments(label, source, fragments) {
  for (const fragment of fragments) {
    if (!sourceTextIncludes(source, fragment, label))
      fail(`${label} missing required fragment: ${fragment}`);
  }
}

function forbidFragments(label, source, fragments) {
  for (const fragment of fragments) {
    if (sourceTextIncludes(source, fragment, label))
      fail(`${label} contains forbidden fragment: ${fragment}`);
  }
}

const configReader = readFileSync(files.configReader, 'utf8');
const grants = readFileSync(files.grants, 'utf8');
if (configReader !== renderS5ConfigReaderSql())
  fail(`${files.configReader} is not generator-synchronized`);
if (grants !== renderP05bGrantsSql()) fail(`${files.grants} is not generator-synchronized`);

const descriptors = buildRlsDescriptors();
if (descriptors.get('public.app_runtime_settings')?.scopingKind !== 'bootstrap_runtime_audience') {
  fail('app_runtime_settings lacks explicit runtime-audience descriptor classification');
}
if (
  descriptors.get('public.app_runtime_settings_audit')?.scopingKind !== 'bootstrap_runtime_audit'
) {
  fail('app_runtime_settings_audit lacks explicit staff-only audit descriptor classification');
}

requireFragments(files.grants, grants, [
  'GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;',
  'REVOKE ALL PRIVILEGES ON TABLE\n  public.app_runtime_settings,\n  public.app_runtime_settings_audit\n  FROM app_staff;',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_runtime_settings TO app_staff;',
  'GRANT SELECT, INSERT ON TABLE public.app_runtime_settings_audit TO app_staff;',
  'public.system_settings_audit,',
  'FROM PUBLIC, app_patient;',
  'FROM app_runtime_nonstaff_login;',
]);
forbidFragments(files.grants, grants, [
  'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_runtime_settings_audit',
  'GRANT UPDATE ON TABLE public.app_runtime_settings_audit',
  'GRANT DELETE ON TABLE public.app_runtime_settings_audit',
]);
requireFragments(files.configReader, configReader, [
  'CREATE ROLE app_config_reader NOLOGIN NOINHERIT NOBYPASSRLS;',
  'GRANT app_config_reader TO :"s5_config_reader_login_role"',
  'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;',
  'GRANT SELECT ON TABLE public.system_settings TO app_config_reader;',
  'CREATE POLICY s5_config_reader_restricted_read ON public.system_settings',
  'app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()',
  "NOT pg_has_role(:'s5_config_reader_login_role', 'app_staff', 'MEMBER')",
  "NOT pg_has_role(:'s5_config_reader_login_role', 'app_patient', 'MEMBER')",
  'public.app_runtime_settings_audit',
]);
forbidFragments(files.configReader, configReader, ['BYPASSRLS;\nGRANT', "current_setting('app."]);

const pool = readFileSync(files.pool, 'utf8');
requireFragments(files.pool, pool, [
  'setDbOperationalRuntimeRole(client, "app_config_reader")',
  'applyDbOperationalOrganizationContextToConnection(client, organizationId, principalApplyOptions)',
  'clearDbOperationalOrganizationContextFromConnection(client, principalApplyOptions)',
  'resetDbOperationalRuntimeRole(client)',
  'max: 2',
  'operation: (client: PoolClient) => Promise<T>',
]);
const client = readFileSync(files.client, 'utf8');
requireFragments(files.client, client, [
  'DATABASE_URL_CONFIG_READER',
  'createConfigReaderPoolProvider',
  'buildDbPrincipalApplyOptionsFromEnv(process.env)',
]);

const smoke = readFileSync(files.smoke, 'utf8');
requireFragments(files.smoke, smoke, [
  '/tmp/bcb_s5_2_settings_security_scratch_',
  'getS5RuntimeSettingsTargets',
  'renderS5RuntimeSettingsGrantStatements',
  'patient wrong-org denial',
  'bootstrap public-only runtime rows',
  'config reader cannot SET ROLE',
  'config reader zero clinical privileges',
  'repeatable config-reader DOWN',
]);
forbidFragments(files.smoke, smoke, ['process.env.DATABASE_URL', 'process.env.PG', '/opt/env']);

const scripts = JSON.parse(readFileSync(files.packageJson, 'utf8')).scripts ?? {};
if (
  scripts['check:saas-s5-2-settings-security'] !==
  'node docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs'
) {
  fail('package.json check:saas-s5-2-settings-security command is missing or changed');
}
if (
  scripts['smoke:saas-s5-2-settings-security'] !==
  'node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-s5-2-settings-security.mjs'
) {
  fail('package.json smoke:saas-s5-2-settings-security command is missing or changed');
}

console.log('check-s5-2-settings-security: OK');
