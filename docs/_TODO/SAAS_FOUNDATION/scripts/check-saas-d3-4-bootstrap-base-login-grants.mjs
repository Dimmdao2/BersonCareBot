#!/usr/bin/env node
import {
  sourceTextIncludes,
  sourceTextIndexOf,
  sourceTextSliceFrom,
} from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';
import { getAppStaffGrantTables, renderP05bGrantsSql } from './p0-5b-grants-sql.mjs';

const files = {
  grantSql: 'deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql',
  appWorkerSql: 'deploy/postgres/phase4-app-worker-narrow-rls.sql',
  d2GrantSql: 'deploy/postgres/d2-fb1-bootstrap-phone-write-grants.sql',
  p05bGrantSql: 'deploy/postgres/p0-5b-grants.sql',
  organizationMemberInvitesSql: 'deploy/postgres/organization-member-invites-rls.sql',
  storeEntitlementsSql: 'deploy/postgres/store-p0-entitlements-rls.sql',
  c5aMigrationSql: 'apps/webapp/db/drizzle-migrations/0225_saas_tariff_quotas_trial.sql',
  // 0268 -> 0267: the reserved 0267 work needed no migration, so this unchanged accessor migration
  // closes the numbering gap.
  platformOrganizationMembersMigration:
    'apps/webapp/db/drizzle-migrations/0267_platform_organization_members_directory.sql',
  c5aRuntimeSql: 'deploy/postgres/c5a-platform-operations-runtime.sql',
  patientCourseWallSql: 'deploy/postgres/patient-course-assignment-wall.sql',
  publicBootstrapSql: 'deploy/postgres/specialist-signup-public-bootstrap-rls.sql',
  specialistOwnerProvisioningSql: 'deploy/postgres/specialist-owner-provisioning-rls.sql',
  patientVapidAccessorSql: 'deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
  publicClinicSlugSql: 'deploy/postgres/public-clinic-slug-bootstrap-resolver.sql',
  testDeploySaas: 'deploy/host/deploy-test-saas.sh',
  runtimeOverlayLib: 'deploy/host/runtime-overlay-rehydrate-lib.sh',
  platformAccessRepo: 'apps/webapp/src/infra/repos/pgPlatformAccess.ts',
  hardProtocol: 'docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md',
  runtimeHelperSmoke: 'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-d3-4-runtime-helper-grants.mjs',
  mediaRuntimeMigration: 'apps/webapp/db/drizzle-migrations/0188_media_worker_runtime_flags.sql',
  mediaRuntimeReader: 'apps/media-worker/src/serverRuntimeConfig.ts',
  c4OperationalSql: 'deploy/postgres/c4-operational-runtime.sql',
  mediaPipelineReader: 'apps/media-worker/src/pipelineEnabled.ts',
  mediaWatermarkReader: 'apps/media-worker/src/watermarkEnabled.ts',
  packageJson: 'package.json',
};

const requiredTables = [
  'public.be_organization_members',
  'public.platform_users',
  'public.user_channel_bindings',
  'public.be_external_entity_mappings',
  'public.be_specialist_service_availability',
  'public.be_branches',
  'public.be_clinic_services',
  'public.be_specialists',
];

const requiredFunctions = [
  'app.resolve_public_booking_organization(uuid, uuid, uuid)',
  'app.resolve_public_organization_slug(text)',
  'app.resolve_public_organization_by_slug(text)',
  'app.resolve_payment_webhook_organization(text, text, text)',
  'app.release_principal_context()',
  'app.current_org_id()',
  'app.current_patient_user_id()',
  'app.current_integrator_user_id()',
  'app.close_active_user_phone_history(uuid)',
  'app.is_staff()',
  'app.get_public_config_bool(text)',
  'app.current_patient_has_password_credentials()',
  'app.current_patient_has_web_oauth_binding()',
  'app.email_password_register_pending(text, text, text, text, text, text)',
  'app.email_password_delete_unverified_registration(uuid)',
  'app.email_password_find_user_id_by_email_challenge(uuid)',
  'app.email_password_find_login_candidate(text)',
  'app.is_organization_slug_available(text)',
  'app.create_specialist_signup_intent(uuid, text, text, text, text)',
  'app.get_pending_specialist_signup_intent(uuid, uuid)',
  'app.get_specialist_signup_intent_by_challenge(uuid)',
  'app.provision_specialist_owner(uuid)',
  'app.lookup_pending_org_invite(text)',
  'app.accept_org_invite(text, uuid, text)',
  'app.email_otp_public_find_user_by_email(text)',
  'app.email_otp_public_find_or_create_user(text)',
  'app.email_otp_public_register_patient(text, text, text, text)',
  'app.email_otp_public_delete_unverified_registration(uuid)',
  'app.email_otp_public_find_latest_email_challenge_by_email(text, bigint)',
  'app.email_otp_public_consume_latest_challenge(text, text)',
  'app.email_otp_public_find_email_send_cooldown_by_email(text)',
  'app.email_auth_find_email_send_cooldown(uuid, text)',
  'app.email_auth_delete_email_challenges_for_user(uuid)',
  'app.email_auth_insert_email_challenge(uuid, text, text, bigint)',
  'app.email_auth_delete_email_challenge_by_id(uuid)',
  'app.email_auth_upsert_email_send_cooldown(uuid, text)',
  'app.email_auth_find_email_challenge_for_confirm(uuid, uuid)',
  'app.email_auth_find_email_owner_conflict(uuid, text)',
  'app.email_auth_verify_user_email(uuid, text)',
  'app.email_auth_find_email_challenge_for_consume(uuid, uuid)',
  'app.email_auth_find_latest_email_challenge_for_user(uuid, bigint)',
  'app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint)',
];

const overlayManagedAppStaffTables = [
  'public.organization_member_invites',
  'public.saas_org_entitlement_overrides',
  'public.saas_organization_trials',
  'public.saas_tariffs',
  'public.saas_trial_policy',
  'public.specialist_signup_intents',
  'public.staff_security_profiles',
  'public.app_runtime_settings',
];

const c5aStaffCurrentOrgReadPolicies = [
  `CREATE POLICY saas_organization_trials_staff_current_org_read
  ON public.saas_organization_trials
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );`,
  `CREATE POLICY saas_org_entitlement_overrides_staff_current_org_read
  ON public.saas_org_entitlement_overrides
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );`,
  `CREATE POLICY be_organizations_staff_current_org_read ON public.be_organizations
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND id = app.current_org_id()
  );`,
];

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!sourceTextIncludes(text, fragment, label)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function requireOccurrenceCount(label, text, fragment, expectedCount) {
  const actualCount = text.split(fragment).length - 1;
  if (actualCount !== expectedCount) {
    fail(`${label} expected ${expectedCount} occurrences of ${fragment}, got ${actualCount}`);
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (sourceTextIncludes(text, fragment, label)) {
      fail(`${label} must not contain forbidden fragment: ${fragment}`);
    }
  }
}

function forbidRegex(label, text, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      fail(`${label} matched forbidden pattern: ${pattern}`);
    }
  }
}

function requireOrderedFragments(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const nextIndex = sourceTextIndexOf(text, fragment, label, cursor);
    if (nextIndex < 0) {
      fail(`${label} missing ordered fragment after offset ${cursor}: ${fragment}`);
    }
    cursor = nextIndex + 1;
  }
}

function extractBashFunction(text, functionName) {
  const marker = `${functionName}(){`;
  const fromFunction = sourceTextSliceFrom(text, marker, files.testDeploySaas);
  if (fromFunction === null) fail(`${files.testDeploySaas} missing function ${functionName}`);
  const relativeEnd = fromFunction.search(/^}\s*$/m);
  if (relativeEnd < 0) fail(`${files.testDeploySaas} has unterminated function ${functionName}`);
  return fromFunction.slice(0, relativeEnd);
}

function extractDeployMain(text) {
  const marker = '# 0. preflight';
  const deployMain = sourceTextSliceFrom(text, marker, files.testDeploySaas);
  if (deployMain === null) fail(`${files.testDeploySaas} missing main preflight marker`);
  return deployMain;
}

function assertPackageScript(packageJsonText) {
  const packageJson = JSON.parse(packageJsonText);
  const expected =
    'node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs && node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-d3-4-runtime-helper-grants.mjs && bash -n deploy/host/deploy-test-saas.sh && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs --self-test && node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-d3-4-runtime-helper-grants.mjs';
  if (packageJson.scripts?.['check:saas-d3-4-bootstrap-base-login-grants'] !== expected) {
    fail('package.json has an unexpected check:saas-d3-4-bootstrap-base-login-grants script');
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.grantSql, loaded.grantSql, [
    'D3.4 bootstrap/base-login direct read grant closure',
    'd3_4_bootstrap_base_role',
    'd3_4_media_worker_runtime_role',
    'd3_4_skip_media_worker',
    'd3_4_skip_media_worker_is_boolean',
    'd3_4_skip_media_worker_role_must_be_absent',
    'd3_4_skip_bootstrap_role_normalization',
    'd3_4_skip_bootstrap_role_normalization_is_boolean',
    'd3_4_skip_flags_form_exact_supported_composition',
    'd3_4_bootstrap_grants_down',
    'd3_4_bootstrap_base_role_exists',
    'd3_4_webapp_runtime_accessors_exist',
    "to_regprocedure('app.resolve_public_booking_organization(uuid,uuid,uuid)') IS NOT NULL",
    "to_regprocedure('app.resolve_public_organization_slug(text)') IS NOT NULL",
    "to_regprocedure('app.resolve_public_organization_by_slug(text)') IS NOT NULL",
    "to_regprocedure('app.resolve_payment_webhook_organization(text,text,text)') IS NOT NULL",
    'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;',
    "granted_role.rolname <> 'app_patient'",
    'REVOKE ADMIN OPTION FOR app_patient FROM :"d3_4_bootstrap_base_role";',
    'GRANT app_patient TO :"d3_4_bootstrap_base_role"',
    'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;',
    'reachable_roles(roleid)',
    'AND NOT rolcreatedb',
    'AND NOT rolcreaterole',
    'AND NOT rolreplication',
    'privilege.grantee = bootstrap_role.oid',
    'REVOKE ALL PRIVILEGES ON FUNCTION',
    'FROM :"d3_4_bootstrap_base_role" CASCADE;',
    'FROM %I CASCADE',
    'procedure.oid::regprocedure',
    'privilege.grantee NOT IN (',
    'AND NOT privilege.is_grantable',
    'OR privilege.is_grantable',
    'd3_4_bootstrap_base_role_exact_topology_verified',
    "'app.read_public_runtime_setting(text,text)'::regprocedure",
    "'app.read_webapp_server_runtime_setting(text,text)'::regprocedure",
    "'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure",
    "'app.resolve_public_organization_slug(text)'::regprocedure",
    "'app.resolve_public_organization_by_slug(text)'::regprocedure",
    "'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure",
    'AND 6 = (',
    'AND 4 = (',
    'procedure.oid IN (',
    "privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')",
    'NOT has_table_privilege(',
    "'public.app_runtime_settings', 'SELECT'",
    "'public.system_settings', 'SELECT'",
    "'public.be_payment_provider_events', 'SELECT'",
    "'public.be_payment_intents', 'SELECT'",
    'd3_4_media_worker_runtime_role_is_restricted',
    'd3_4_media_worker_runtime_role_has_exact_supported_capability',
    'A legacy deployment reaches the media surface through',
    'Refuse a mixed shape',
    'count(membership.roleid) AS direct_membership_count',
    "granted.rolname = 'app_worker'",
    'exact_legacy_worker_edge_count = 1',
    "granted.rolname = 'app_operational_media_worker'",
    'membership.admin_option = false',
    'membership.inherit_option = false',
    'membership.inherit_option = true',
    'membership.set_option = true',
    'exact_media_set_only_edge_count = 1',
    'direct_membership_count = 1',
    'rolinherit = true',
    'rolinherit = false',
    "NOT pg_has_role(:'d3_4_media_worker_runtime_role', 'app_staff', 'MEMBER')",
    "NOT pg_has_role(:'d3_4_media_worker_runtime_role', 'app_patient', 'MEMBER')",
    'd3_4_p2_b_context_bundle_is_complete_or_absent',
    'd3_4_has_p2_b_context_bundle',
    "to_regprocedure('app.release_principal_context()')",
    "to_regprocedure('app.close_active_user_phone_history(uuid)')",
    'GRANT USAGE ON SCHEMA public, app TO :"d3_4_bootstrap_base_role";',
    'GRANT USAGE ON SCHEMA app TO :"d3_4_media_worker_runtime_role";',
    'REVOKE USAGE ON SCHEMA app FROM :"d3_4_bootstrap_base_role";',
    'REVOKE USAGE ON SCHEMA public FROM :"d3_4_bootstrap_base_role";',
    'REVOKE USAGE ON SCHEMA app FROM :"d3_4_media_worker_runtime_role";',
    'GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_media_worker_runtime_role";',
    'Grant them directly to the exact',
    'GRANT EXECUTE ON FUNCTION app.current_org_id() TO :"d3_4_media_worker_runtime_role";',
    'GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :"d3_4_media_worker_runtime_role";',
    'GRANT EXECUTE ON FUNCTION app.is_staff() TO :"d3_4_media_worker_runtime_role";',
    'REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM :"d3_4_media_worker_runtime_role";',
    'REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :"d3_4_media_worker_runtime_role";',
    'REVOKE EXECUTE ON FUNCTION app.is_staff() FROM :"d3_4_media_worker_runtime_role";',
    'GRANT SELECT ON TABLE public.app_runtime_settings TO :"d3_4_media_worker_runtime_role";',
    'REVOKE SELECT ON TABLE public.app_runtime_settings FROM :"d3_4_media_worker_runtime_role";',
    'REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM :"d3_4_media_worker_runtime_role";',
    'REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM PUBLIC;',
    'REVOKE EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;',
    'Do not add clinical/media/content/full-settings tables here',
  ]);
  requireFragments(`${files.grantSql} DEV webapp-only composition`, loaded.grantSql, [
    '\\set d3_4_skip_media_worker 0',
    '\\set d3_4_skip_bootstrap_role_normalization 0',
    '\\if :d3_4_skip_media_worker',
    '\\if :d3_4_skip_bootstrap_role_normalization',
    'd3_4_media_worker_runtime_role must be absent when d3_4_skip_media_worker=1',
  ]);
  requireOrderedFragments(`${files.grantSql} validate-only DEV C0 composition`, loaded.grantSql, [
    '\\if :d3_4_skip_bootstrap_role_normalization',
    '\\else',
    'ALTER ROLE :"d3_4_bootstrap_base_role"',
    'GRANT app_patient TO :"d3_4_bootstrap_base_role"',
    'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;',
    '\\endif',
    'REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings',
  ]);
  requireOccurrenceCount(files.grantSql, loaded.grantSql, '\\if :d3_4_has_p2_b_context_bundle', 2);
  requireOccurrenceCount(files.grantSql, loaded.grantSql, 'direct_membership_count = 1', 2);
  requireOccurrenceCount(files.grantSql, loaded.grantSql, 'AND NOT privilege.is_grantable', 2);
  requireOccurrenceCount(files.grantSql, loaded.grantSql, 'membership.admin_option = false', 2);
  requireOccurrenceCount(files.grantSql, loaded.grantSql, 'membership.set_option = true', 2);
  requireFragments(files.appWorkerSql, loaded.appWorkerSql, [
    'PostgreSQL checks EXECUTE on every helper referenced by a policy',
    'GRANT EXECUTE ON FUNCTION app.is_staff() TO app_worker;',
    'GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_worker;',
    'GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_worker;',
    'REVOKE EXECUTE ON FUNCTION app.is_staff() FROM app_worker;',
    'REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM app_worker;',
    'REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM app_worker;',
  ]);
  forbidFragments(files.appWorkerSql, loaded.appWorkerSql, [
    'GRANT EXECUTE ON FUNCTION app.install_signed_context',
    'GRANT EXECUTE ON FUNCTION app.reset_principal_context() TO app_worker',
    'GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO app_worker',
    'GRANT SELECT ON TABLE',
    'GRANT INSERT ON TABLE',
    'GRANT UPDATE ON TABLE',
    'GRANT DELETE ON TABLE',
  ]);
  forbidFragments(files.grantSql, loaded.grantSql, [
    'GRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text) TO :"d3_4_media_worker_runtime_role";',
    'GRANT EXECUTE ON FUNCTION app.reset_principal_context() TO :"d3_4_media_worker_runtime_role";',
    'GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO :"d3_4_media_worker_runtime_role";',
  ]);
  requireFragments(files.mediaRuntimeMigration, loaded.mediaRuntimeMigration, [
    "'video_hls_pipeline_enabled', 'admin', 'server'",
    "'video_watermark_enabled', 'admin', 'server'",
    'CREATE POLICY app_runtime_settings_safe_read',
    'CREATE POLICY app_runtime_settings_staff_write',
    "audience = 'server'",
    "pg_has_role(current_user, 'app_worker', 'member')",
    "NULLIF(current_setting('app.org', true), '') IS NULL",
    "NULLIF(current_setting('app.patient_user_id', true), '') IS NULL",
    'GRANT SELECT ON TABLE public.app_runtime_settings TO app_worker;',
  ]);
  forbidFragments(files.mediaRuntimeMigration, loaded.mediaRuntimeMigration, [
    'GRANT SELECT ON TABLE public.system_settings',
    'CREATE FUNCTION',
  ]);
  requireFragments(files.mediaRuntimeReader, loaded.mediaRuntimeReader, [
    'app.read_media_worker_runtime_setting($1)',
  ]);
  forbidFragments(files.mediaRuntimeReader, loaded.mediaRuntimeReader, [
    'FROM public.system_settings',
    'FROM public.app_runtime_settings',
  ]);
  requireFragments(files.c4OperationalSql, loaded.c4OperationalSql, [
    'CREATE OR REPLACE FUNCTION app.read_media_worker_runtime_setting(p_key text)',
    'WHERE p_key IN (',
    "'video_hls_pipeline_enabled', 'video_watermark_enabled',",
    "'error_tracking_enabled', 'error_tracking_dsn'",
    "setting.audience = 'server'",
    'setting.organization_id IS NULL',
    'GRANT EXECUTE ON FUNCTION app.read_media_worker_runtime_setting(text) TO app_operational_media_worker',
  ]);
  requireFragments(files.mediaPipelineReader, loaded.mediaPipelineReader, [
    'readServerRuntimeBoolean(pool, "video_hls_pipeline_enabled")',
  ]);
  requireFragments(files.mediaWatermarkReader, loaded.mediaWatermarkReader, [
    'readServerRuntimeBoolean(pool, "video_watermark_enabled")',
  ]);
  for (const tableName of requiredTables) {
    requireFragments(files.grantSql, loaded.grantSql, [
      `GRANT SELECT ON TABLE ${tableName} TO :"d3_4_bootstrap_base_role";`,
      `REVOKE SELECT ON TABLE ${tableName} FROM :"d3_4_bootstrap_base_role";`,
    ]);
  }
  for (const signature of requiredFunctions) {
    requireFragments(files.grantSql, loaded.grantSql, [
      `GRANT EXECUTE ON FUNCTION ${signature} TO :"d3_4_bootstrap_base_role";`,
      `REVOKE EXECUTE ON FUNCTION ${signature} FROM :"d3_4_bootstrap_base_role";`,
    ]);
  }
  requireFragments(files.grantSql, loaded.grantSql, [
    "'GRANT EXECUTE ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) TO %I'",
    "'REVOKE EXECUTE ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) FROM %I'",
    "WHERE to_regprocedure('app.email_auth_increment_email_challenge_attempts(uuid)') IS NOT NULL",
  ]);
  requireFragments(files.grantSql, loaded.grantSql, [
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :"d3_4_bootstrap_base_role";',
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :"d3_4_bootstrap_base_role";',
    'REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_phone_history FROM :"d3_4_bootstrap_base_role";',
    'REVOKE SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts FROM :"d3_4_bootstrap_base_role";',
  ]);
  forbidFragments(files.grantSql, loaded.grantSql, [
    '/opt/env',
    'api.prod',
    'webapp.prod',
    'bcb_webapp_prod',
    'bcb_webapp_dev',
    'public.content_pages',
    'public.media_files',
  ]);
  forbidRegex(files.grantSql, loaded.grantSql, [
    /\bGRANT\s+app_staff\b/i,
    /\bGRANT\s+app_owner\b/i,
    /\bGRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.system_settings\b/i,
    /\bGRANT\s+SELECT\s+ON\s+ALL\s+TABLES\b/i,
    /\bGRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\./i,
  ]);

  requireFragments(files.d2GrantSql, loaded.d2GrantSql, [
    'd2_fb1_bootstrap_base_role',
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :"d2_fb1_bootstrap_base_role";',
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :"d2_fb1_bootstrap_base_role";',
  ]);

  if (loaded.p05bGrantSql !== renderP05bGrantsSql()) {
    fail(`${files.p05bGrantSql} is not in sync with p0-5b-grants-sql.mjs`);
  }
  const appStaffGrantTables = getAppStaffGrantTables();
  if (appStaffGrantTables.length !== 213) {
    fail(
      `P0.5b app_staff grant surface must remain the reviewed 213-table snapshot, got ${appStaffGrantTables.length}`,
    );
  }
  for (const qualifiedName of overlayManagedAppStaffTables) {
    if (appStaffGrantTables.some((table) => table.qualifiedName === qualifiedName)) {
      fail(`P0.5b app_staff grant surface must leave ${qualifiedName} to its dedicated overlay`);
    }
  }
  requireFragments(files.p05bGrantSql, loaded.p05bGrantSql, [
    'REVOKE ALL PRIVILEGES ON TABLE "public"."staff_security_profiles" FROM app_patient;',
    'REVOKE ALL PRIVILEGES ON TABLE "public"."user_password_credentials" FROM app_patient;',
    'REVOKE ALL PRIVILEGES ON TABLE "public"."user_oauth_bindings" FROM app_patient;',
    "'REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM app_patient'",
    'REVOKE ALL PRIVILEGES ON TABLE public.app_runtime_settings, public.app_runtime_settings_audit FROM app_staff;',
    'REVOKE ALL PRIVILEGES ON TABLE public.app_runtime_settings FROM app_patient;',
    'GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_runtime_settings TO app_staff;',
  ]);
  requireFragments(files.publicBootstrapSql, loaded.publicBootstrapSql, [
    'REVOKE ALL PRIVILEGES ON TABLE public.staff_security_profiles FROM app_patient, app_staff;',
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.staff_security_profiles FROM app_patient, app_staff',
    "WHERE attrelid = 'public.staff_security_profiles'::regclass",
    'specialist_signup_staff_security_runtime_acl_closed',
    'NOT has_table_privilege(',
    'AND NOT has_any_column_privilege(',
    'FATAL: staff_security_profiles must remain table-invisible to app_patient and app_staff.',
  ]);
  forbidRegex(files.p05bGrantSql, loaded.p05bGrantSql, [
    /GRANT\s+[^;]*ON\s+TABLE\s+"public"\."staff_security_profiles"\s+TO\s+app_(?:staff|patient)/i,
    /GRANT\s+[^;]*ON\s+TABLE\s+"public"\."user_password_credentials"\s+TO\s+app_patient/i,
    /GRANT\s+[^;]*ON\s+TABLE\s+"public"\."user_oauth_bindings"\s+TO\s+app_patient/i,
  ]);
  requireFragments(files.organizationMemberInvitesSql, loaded.organizationMemberInvitesSql, [
    'R1 clinic member invites RLS/grants overlay',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" TO app_staff;',
  ]);
  requireFragments(files.storeEntitlementsSql, loaded.storeEntitlementsSql, [
    'Store P0 — entitlement foundation (dormant)',
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_tariffs FROM app_staff;',
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides FROM app_staff;',
    'GRANT SELECT ON TABLE public.saas_tariffs TO app_staff;',
    'GRANT SELECT ON TABLE public.saas_org_entitlement_overrides TO app_staff;',
  ]);
  requireFragments(files.c5aMigrationSql, loaded.c5aMigrationSql, [
    'REVOKE ALL PRIVILEGES ON TABLE "saas_trial_policy", "saas_organization_trials" FROM app_staff;',
    'GRANT SELECT ON TABLE "saas_organization_trials" TO app_staff;',
    'platform_commercial_capability_required',
  ]);
  forbidFragments(files.c5aMigrationSql, loaded.c5aMigrationSql, [
    'reserve_saas_quota_growth',
    'saas_organization_quota_usage',
  ]);
  requireFragments(files.c5aRuntimeSql, loaded.c5aRuntimeSql, [
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_tariffs FROM app_staff;',
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_trial_policy FROM app_staff;',
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_organization_trials FROM app_staff;',
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides FROM app_staff;',
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_tariffs TO app_platform_settings;',
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_trial_policy TO app_platform_settings;',
    'GRANT SELECT ON TABLE public.be_organization_members TO app_platform_settings;',
    'GRANT EXECUTE ON FUNCTION app.list_platform_organization_members(uuid)',
    'c5a_platform_organization_members_directory_exact_wall',
    "NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'INSERT')",
    "NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'UPDATE')",
    "NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'DELETE')",
    'ALTER FUNCTION app.start_provisioned_organization_trial() OWNER TO app_platform_settings;',
    "NOT has_table_privilege('app_staff', 'public.saas_tariffs', 'UPDATE')",
    "NOT has_table_privilege('app_staff', 'public.saas_trial_policy', 'UPDATE')",
    "NOT has_table_privilege('app_staff', 'public.saas_organization_trials', 'UPDATE')",
    "NOT has_table_privilege('app_staff', 'public.saas_org_entitlement_overrides', 'UPDATE')",
    "NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'SELECT')",
    "NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'UPDATE')",
    'DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.saas_org_entitlement_overrides;',
    'DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.saas_organization_trials;',
    'GRANT SELECT ON TABLE public.be_organizations TO app_staff;',
    "has_table_privilege('app_staff', 'public.be_organizations', 'SELECT')",
    "has_table_privilege('app_staff', 'public.saas_tariffs', 'SELECT')",
    "has_table_privilege('app_staff', 'public.saas_organization_trials', 'SELECT')",
    "has_table_privilege('app_staff', 'public.saas_org_entitlement_overrides', 'SELECT')",
    'c5a_staff_current_org_read_policy_wall',
    'count(actual.polname) = 3',
    "actual.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'app_staff')]",
    'position(actual.org_predicate IN actual.predicate) > 0',
    ...c5aStaffCurrentOrgReadPolicies,
  ]);
  requireFragments(
    files.platformOrganizationMembersMigration,
    loaded.platformOrganizationMembersMigration,
    [
      'CREATE OR REPLACE FUNCTION app.list_platform_organization_members(',
      'FROM public.be_organization_members AS membership',
      'INNER JOIN public.platform_users AS platform_user',
      'WHERE membership.organization_id = p_organization_id',
      'ALTER FUNCTION app.list_platform_organization_members(uuid) OWNER TO app_owner;',
      'REVOKE ALL ON FUNCTION app.list_platform_organization_members(uuid)',
      'FROM PUBLIC, app_staff, app_patient, app_platform_settings;',
    ],
  );
  forbidFragments(
    files.platformOrganizationMembersMigration,
    loaded.platformOrganizationMembersMigration,
    ['phone_normalized', 'email_normalized', 'user_channel_bindings', 'org_enrollments'],
  );
  requireFragments(files.testDeploySaas, loaded.testDeploySaas, [
    'assert_c5a_platform_organization_members_closure',
    'run_closure_gate "platform organization-members directory exact ACL" assert_c5a_platform_organization_members_closure',
    // 106 -> 107: 0267 adds the directory accessor, 0268 adds the delivery-audit writer, and 0269
    // removes the obsolete signup-slug reservation function.
    'local expected_secdef_count=110',
  ]);
  requireFragments(files.patientCourseWallSql, loaded.patientCourseWallSql, [
    'patient-course-assignment-wall UP complete',
    'GRANT SELECT ON TABLE public.courses TO app_patient;',
  ]);
  requireFragments(files.specialistOwnerProvisioningSql, loaded.specialistOwnerProvisioningSql, [
    'CREATE OR REPLACE FUNCTION app.provision_specialist_owner(',
    'SET search_path = pg_catalog',
    'GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid) TO app_patient;',
  ]);
  requireFragments(files.patientVapidAccessorSql, loaded.patientVapidAccessorSql, [
    'CREATE OR REPLACE FUNCTION app.get_web_push_vapid_public_key()',
    'SET search_path = pg_catalog',
    'GRANT EXECUTE ON FUNCTION app.get_web_push_vapid_public_key() TO app_patient;',
  ]);
  requireFragments(files.publicClinicSlugSql, loaded.publicClinicSlugSql, [
    'CREATE OR REPLACE FUNCTION app.resolve_public_organization_slug(p_slug text)',
    'CREATE OR REPLACE FUNCTION app.resolve_public_organization_by_slug(',
    'SET search_path = pg_catalog',
    'ALTER FUNCTION app.resolve_public_organization_slug(text) OWNER TO app_owner;',
    'ALTER FUNCTION app.resolve_public_organization_by_slug(text) OWNER TO app_owner;',
    'REVOKE ALL ON FUNCTION app.resolve_public_organization_slug(text) FROM PUBLIC;',
    'REVOKE ALL ON FUNCTION app.resolve_public_organization_by_slug(text) FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO app_patient;',
    'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO app_patient;',
    "NOT has_table_privilege('app_patient', 'public.organization_slug_claims', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.clinic_public_directory_entries', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.be_organizations', 'SELECT')",
  ]);
  forbidFragments(files.publicClinicSlugSql, loaded.publicClinicSlugSql, [
    'GRANT SELECT ON TABLE public.organization_slug_claims TO app_patient',
    'GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_patient',
    'GRANT SELECT ON TABLE public.be_organizations TO app_patient',
  ]);

  requireFragments(files.publicBootstrapSql, loaded.publicBootstrapSql, [
    "WHEN p_key <> 'specialist_signup_enabled' THEN NULL::boolean",
    'CREATE OR REPLACE FUNCTION app.current_patient_has_password_credentials()',
    "pg_catalog.to_regprocedure('app.current_patient_user_id()') IS NOT NULL",
    "v_patient_user_id := NULLIF(pg_catalog.current_setting('app.patient_user_id', true), '')::uuid;",
    'WHERE c.user_id = v_patient_user_id',
    "SELECT quote_ident(:'specialist_signup_password_credentials_owner') AS specialist_signup_password_credentials_owner_ident \\gset",
    'ALTER FUNCTION app.current_patient_has_password_credentials() OWNER TO :specialist_signup_password_credentials_owner_ident;',
    'REVOKE ALL ON FUNCTION app.current_patient_has_password_credentials() FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.current_patient_has_password_credentials() TO app_staff, app_patient;',
    'CREATE OR REPLACE FUNCTION app.staff_user_has_password_credentials(p_user_id uuid)',
    'REVOKE ALL ON FUNCTION app.staff_user_has_password_credentials(uuid) FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;',
    'CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)',
    'REVOKE ALL ON FUNCTION app.email_password_find_login_candidate(text) FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) TO app_patient;',
    'CREATE OR REPLACE FUNCTION app.current_patient_has_web_oauth_binding()',
    'ALTER FUNCTION app.current_patient_has_web_oauth_binding() OWNER TO :specialist_signup_oauth_bindings_owner_ident;',
    'GRANT EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() TO app_staff, app_patient;',
    'CREATE OR REPLACE FUNCTION app.staff_user_has_web_oauth_binding(p_user_id uuid)',
    'REVOKE ALL ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) TO app_staff;',
    'DROP FUNCTION IF EXISTS app.staff_user_has_password_credentials(uuid);',
    'DROP FUNCTION IF EXISTS app.staff_user_has_web_oauth_binding(uuid);',
    'REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_password_credentials_owner_ident;',
    'REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_oauth_bindings_owner_ident;',
    'GRANT USAGE ON SCHEMA app TO :specialist_signup_staff_security_owner_ident;',
    "has_schema_privilege(\n  :'specialist_signup_staff_security_owner',\n  'app',\n  'USAGE'",
    'specialist_signup_staff_security_owner_schema_usage_ok',
    'REVOKE USAGE ON SCHEMA app FROM :specialist_signup_staff_security_owner_ident;',
    'organization_slug,\n    specialist_full_name',
    'SET challenge_id = p_challenge_id,\n      organization_slug = p_organization_slug',
  ]);
  forbidFragments(files.publicBootstrapSql, loaded.publicBootstrapSql, [
    'SET search_path = public, pg_catalog',
    'SET search_path = public, app, pg_catalog',
    'GRANT USAGE ON SCHEMA app TO app_patient',
    'GRANT USAGE ON SCHEMA app TO app_staff',
    'reserve_specialist_signup_slug',
  ]);
  forbidFragments(files.organizationMemberInvitesSql, loaded.organizationMemberInvitesSql, [
    'SET search_path = public, pg_catalog',
  ]);

  requireFragments(files.platformAccessRepo, loaded.platformAccessRepo, [
    'CASE WHEN app.is_staff()',
    'app.staff_user_has_password_credentials(pu.id)',
    'app.current_patient_has_password_credentials()',
    'app.staff_user_has_web_oauth_binding(pu.id)',
    'app.current_patient_has_web_oauth_binding()',
  ]);
  requireFragments(files.runtimeHelperSmoke, loaded.runtimeHelperSmoke, [
    'd3_4_media_worker_runtime_role',
    'c4MediaRole',
    'operationalMediaRole',
    'WITH INHERIT FALSE, SET TRUE',
    'canonical C4 SET-only shape',
    'legacyStaffRole',
    'legacyArbitraryRole',
    'c4UnrelatedRole',
    'mixedRole',
    'siblingOperationalRole',
    'psqlExpectFailure',
    'psqlProveGrantDenied',
    'psqlProveGrantDenied(dbName, bootstrapIdent)',
    'WITH GRANT OPTION',
    'TO ${staffIdent}, ${patientIdent}, ${arbitraryCapabilityIdent};',
    'GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text) TO PUBLIC;',
    'GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO PUBLIC;',
    'app.resolve_public_booking_organization(uuid,uuid,uuid)',
    'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO PUBLIC;',
    'app.resolve_public_organization_by_slug(text)',
    'GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO PUBLIC;',
    'app.resolve_payment_webhook_organization(text,text,text)',
    'public.be_payment_provider_events',
    'public.be_payment_intents',
    '53000000-0000-4000-8000-0000000056a1',
    '53000000-0000-4000-8000-000000000001',
    'arbitraryCapabilityRole',
    'app.staff_user_has_password_credentials(uuid)',
    'app.release_principal_context()',
    'app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)',
    'app.current_org_id()',
    'app.current_patient_user_id()',
    'app.is_staff()',
    'app.reset_principal_context()',
    'acl.grantee = 0',
    'SET SESSION AUTHORIZATION ${mediaIdent}',
    'FROM public.media_files',
    'UPDATE public.media_transcode_jobs',
    'public.app_runtime_settings',
    'public.system_settings',
    'has_table_privilege',
    'intermediaryRole',
    'adversarialPrestateSql',
    'GRANT SELECT ON TABLE public.system_settings TO ${intermediaryIdent};',
    'NOT membership.inherit_option',
    'membership.set_option',
    'SET ROLE',
    'read_public_runtime_setting',
    'read_webapp_server_runtime_setting',
    'runtimeAudiencePolicy',
    'count(*) = 1',
    "audience <> 'server' OR organization_id IS NOT NULL",
  ]);
  forbidRegex(files.platformAccessRepo, loaded.platformAccessRepo, [
    /FROM\s+(?:public\.)?user_password_credentials\b/i,
    /FROM\s+(?:public\.)?user_oauth_bindings\b/i,
  ]);

  requireFragments(files.testDeploySaas, loaded.testDeploySaas, [
    'D3_4_BOOTSTRAP_GRANTS=deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql',
    'P0_5B_GRANTS=deploy/postgres/p0-5b-grants.sql',
    'RUNTIME_OVERLAY_APP_OWNER_HANDOFF=deploy/postgres/runtime-overlay-app-owner-handoff.sql',
    'ORGANIZATION_MEMBER_INVITES_RLS=deploy/postgres/organization-member-invites-rls.sql',
    'STORE_P0_ENTITLEMENTS_RLS=deploy/postgres/store-p0-entitlements-rls.sql',
    'PATIENT_COURSE_WALL=deploy/postgres/patient-course-assignment-wall.sql',
    'PUBLIC_BOOTSTRAP_RLS=deploy/postgres/specialist-signup-public-bootstrap-rls.sql',
    'SPECIALIST_OWNER_PROVISIONING_RLS=deploy/postgres/specialist-owner-provisioning-rls.sql',
    'PATIENT_VAPID_ACCESSOR=deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
    '-f "$DEPLOY_REPO/$P0_5B_GRANTS"',
    'runtime_overlay_apply_post_migration_chain',
    'sudo -u deploy cat "$DEPLOY_REPO/$P2_B_CONTEXT"',
    '[ -r "$SRC_REPO/$P0_5B_GRANTS" ]',
    '[ -r "$SRC_REPO/$ORGANIZATION_MEMBER_INVITES_RLS" ]',
    '[ -r "$SRC_REPO/$STORE_P0_ENTITLEMENTS_RLS" ]',
    '[ -r "$SRC_REPO/$PATIENT_COURSE_WALL" ]',
    '[ -r "$SRC_REPO/$PUBLIC_BOOTSTRAP_RLS" ]',
    '[ -r "$SRC_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS" ]',
    '[ -r "$SRC_REPO/$PATIENT_VAPID_ACCESSOR" ]',
    'discover_webapp_bootstrap_base_role(){',
    'discover_media_worker_runtime_role(){',
    '\\${DATABASE_URL_NONSTAFF:-\\${DATABASE_URL:-}}',
    'grant_webapp_bootstrap_base_login_d3_4(){',
    'role_name="$(discover_webapp_bootstrap_base_role)"',
    'media_worker_role="$(discover_media_worker_runtime_role)"',
    '-v d3_4_bootstrap_base_role="$role_name"',
    '-v d3_4_media_worker_runtime_role="$media_worker_role"',
    '-f "$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS"',
    '[ -r "$SRC_REPO/$D3_4_BOOTSTRAP_GRANTS" ]',
    'grant_webapp_bootstrap_base_login_d3_4',
    '[ "$role_name" != "$staff_role" ]',
    '[ "$role_name" != "$media_worker_role" ]',
    'role_safe="$(sudo -u postgres psql',
    'aliases protected role',
    'refusing D3.4 mutation',
  ]);
  const d34Installer = extractBashFunction(
    loaded.testDeploySaas,
    'grant_webapp_bootstrap_base_login_d3_4',
  );
  requireOrderedFragments(`${files.testDeploySaas} D3.4 identity preflight`, d34Installer, [
    'role_name="$(discover_webapp_bootstrap_base_role)"',
    'media_worker_role="$(discover_media_worker_runtime_role)"',
    'staff_role="$(discover_webapp_staff_runtime_role)"',
    '[ "$role_name" != "$staff_role" ]',
    '[ "$role_name" != "$media_worker_role" ]',
    'role_safe="$(sudo -u postgres psql',
    '[ "$role_safe" = "1" ]',
    'sudo -u postgres psql -d "$DB"',
    '-f "$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS"',
  ]);
  forbidFragments(`${files.testDeploySaas} default TEST D3.4 composition`, d34Installer, [
    'd3_4_skip_media_worker',
    'd3_4_skip_bootstrap_role_normalization',
  ]);
  const wallInstaller = extractBashFunction(loaded.testDeploySaas, 'install_p0_5b_runtime_wall');
  requireOrderedFragments(`${files.testDeploySaas} unconditional P0.5b installer`, wallInstaller, [
    '-f "$DEPLOY_REPO/$P0_5B_ROLES"',
    '-f "$DEPLOY_REPO/$P0_5B_GRANTS"',
  ]);
  forbidFragments(`${files.testDeploySaas} unconditional P0.5b installer`, wallInstaller, [
    '$DEPLOY_REPO/$P2_B_CONTEXT',
    '$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS',
    '$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS',
    '$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS',
  ]);
  const protectedInstaller = extractBashFunction(
    loaded.testDeploySaas,
    'install_p2_b_protected_principal_context',
  );
  requireOrderedFragments(`${files.testDeploySaas} signed P2-B branch`, protectedInstaller, [
    'if ! resolve_p2_b_signing_secret; then',
    'P2-B protected principal context: skipped (legacy-guc without signing secret)',
    'return 0',
    'sudo -u deploy cat "$DEPLOY_REPO/$P2_B_CONTEXT"',
  ]);
  forbidFragments(`${files.testDeploySaas} signed P2-B branch`, protectedInstaller, [
    '$DEPLOY_REPO/$P0_5B_ROLES',
    '$DEPLOY_REPO/$P0_5B_GRANTS',
    '$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS',
    '$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS',
    '$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS',
  ]);
  const overlayInstaller = extractBashFunction(
    loaded.testDeploySaas,
    'rehydrate_post_restore_runtime_overlays',
  );
  requireOrderedFragments(
    `${files.testDeploySaas} shared post-restore overlay invocation`,
    overlayInstaller,
    [
      'e1_runtime_role="$(discover_webapp_bootstrap_base_role)"',
      'runtime_overlay_apply_post_migration_chain',
      '"$DEPLOY_REPO"',
      '"$DB"',
      '"$e1_runtime_role"',
      '"$P2_B_CONTEXT_INSTALLED"',
    ],
  );
  requireOrderedFragments(
    `${files.runtimeOverlayLib} canonical post-restore overlay order`,
    loaded.runtimeOverlayLib,
    [
      'deploy/postgres/organization-member-invites-rls.sql',
      'deploy/postgres/patient-invites-rls.sql',
      'deploy/postgres/store-p0-entitlements-rls.sql',
      'deploy/postgres/patient-course-assignment-wall.sql',
      'deploy/postgres/specialist-signup-public-bootstrap-rls.sql',
      'deploy/postgres/specialist-owner-provisioning-rls.sql',
      'deploy/postgres/u9a-platform-settings-role.sql',
      'deploy/postgres/c5a-platform-operations-runtime.sql',
      'deploy/postgres/runtime-overlay-app-owner-handoff.sql',
      'deploy/postgres/reference-catalog-rls.sql',
      'deploy/postgres/patient-visible-catalog-rls.sql',
      'deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
      'deploy/postgres/public-booking-bootstrap-resolver.sql',
      'deploy/postgres/public-clinic-slug-bootstrap-resolver.sql',
      'deploy/postgres/e1-webapp-runtime-config.sql',
    ],
  );
  const sharedClosure = extractBashFunction(
    loaded.testDeploySaas,
    'run_strict_post_migration_closure',
  );
  requireOrderedFragments(`${files.testDeploySaas} shared strict closure`, sharedClosure, [
    'log "strict closure: roles + grants"',
    'install_p0_5b_runtime_wall',
    'install_p2_b_protected_principal_context',
    'rehydrate_post_restore_runtime_overlays',
    'grant_api_runtime_migration_ledger_read',
    'grant_webapp_bootstrap_base_login_d3_4',
    'log "strict closure: TEST settings override"',
  ]);
  requireOrderedFragments(`${files.testDeploySaas} D3.4 grant order`, sharedClosure, [
    'install_p0_5b_runtime_wall',
    'install_p2_b_protected_principal_context',
    'rehydrate_post_restore_runtime_overlays',
    'grant_api_runtime_migration_ledger_read',
    'assert_api_runtime_can_read_migration_ledger',
    'grant_webapp_bootstrap_base_login_d3_4',
    'log "strict closure: TEST settings override"',
  ]);
  const deployMain = extractDeployMain(loaded.testDeploySaas);
  requireFragments(`${files.testDeploySaas} supported deploy entrypoints`, deployMain, [
    'run_strict_post_migration_closure',
  ]);
  requireFragments(files.hardProtocol, loaded.hardProtocol, [
    'D3.4 bootstrap/base-login grant closure',
    'deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql',
    'before',
    'service restart or product smoke',
    'not final D3.4 PASS until the owner-authorized locked TEST',
    'd3_4_skip_media_worker=1',
    'd3_4_skip_bootstrap_role_normalization=1',
    'without changing the\ncluster-global C0 role',
    'smoke reruns',
    'deploy/postgres/organization-member-invites-rls.sql',
    'deploy/postgres/store-p0-entitlements-rls.sql',
    'deploy/postgres/patient-course-assignment-wall.sql',
    'deploy/postgres/specialist-owner-provisioning-rls.sql',
    'deploy/postgres/runtime-overlay-app-owner-handoff.sql',
    'deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
    'after any optional P2-B replacement',
    'LOGIN NOINHERIT NOBYPASSRLS',
    'remove every unexpected direct membership',
    'ADMIN FALSE, INHERIT FALSE, SET TRUE',
    'the separate staff-pool login is not passed to or changed',
    'effective reads of both `public.system_settings` and `public.app_runtime_settings`',
    '`SET ROLE app_patient` lifecycle',
    'reject any equality with the nonstaff login',
    'before `psql -f`',
    'revoke stale base-login privileges and grant options',
    '`is_grantable=false`',
    'is the fourth direct bootstrap accessor',
    'must not add table grants',
  ]);
  assertPackageScript(loaded.packageJson);
}

if (process.argv.includes('--self-test')) {
  runChecks();
  const cases = [
    {
      c5aRuntimeSql: read(files.c5aRuntimeSql).replace(
        'GRANT SELECT ON TABLE public.be_organization_members TO app_platform_settings;',
        '-- removed platform organization-members SELECT by self-test',
      ),
    },
    {
      c5aRuntimeSql: read(files.c5aRuntimeSql).replace(
        c5aStaffCurrentOrgReadPolicies[0],
        'CREATE POLICY saas_organization_trials_staff_current_org_read ON public.saas_organization_trials FOR SELECT TO app_staff USING (true);',
      ),
    },
    {
      c5aRuntimeSql: read(files.c5aRuntimeSql).replace(
        c5aStaffCurrentOrgReadPolicies[1],
        'CREATE POLICY saas_org_entitlement_overrides_staff_current_org_read ON public.saas_org_entitlement_overrides FOR SELECT TO app_staff USING (true);',
      ),
    },
    {
      c5aRuntimeSql: read(files.c5aRuntimeSql).replace(
        c5aStaffCurrentOrgReadPolicies[2],
        'CREATE POLICY be_organizations_staff_current_org_read ON public.be_organizations FOR SELECT TO app_staff USING (true);',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT SELECT ON TABLE public.platform_users TO :"d3_4_bootstrap_base_role";',
        '-- removed by self-test',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT SELECT ON TABLE public.app_runtime_settings TO :"d3_4_media_worker_runtime_role";',
        '-- removed media runtime SELECT by self-test',
      ),
    },
    {
      mediaRuntimeMigration: read(files.mediaRuntimeMigration).replace(
        'GRANT SELECT ON TABLE public.app_runtime_settings TO app_worker;',
        '-- removed app_worker runtime SELECT by self-test',
      ),
    },
    {
      mediaRuntimeReader: read(files.mediaRuntimeReader).replaceAll(
        'app.read_media_worker_runtime_setting($1)',
        'app.read_unrestricted_runtime_setting($1)',
      ),
    },
    {
      appWorkerSql: read(files.appWorkerSql).replace(
        'GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_worker;',
        '-- removed app_worker policy helper grant by self-test',
      ),
    },
    {
      appWorkerSql: `${read(files.appWorkerSql)}\nGRANT EXECUTE ON FUNCTION app.reset_principal_context() TO app_worker;\n`,
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.get_public_config_bool(text) TO :"d3_4_bootstrap_base_role";',
        '-- removed public-bootstrap base-login EXECUTE by self-test',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_media_worker_runtime_role";',
        '-- removed media-worker cleanup EXECUTE by self-test',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.current_org_id() TO :"d3_4_media_worker_runtime_role";',
        '-- removed media-worker policy helper EXECUTE by self-test',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;',
        '-- removed app_staff credential helper EXECUTE by self-test',
      ),
    },
    {
      grantSql: `${read(files.grantSql)}\nGRANT app_staff TO :"d3_4_bootstrap_base_role";\n`,
    },
    {
      grantSql: `${read(files.grantSql)}\nGRANT SELECT ON TABLE public.media_files TO :"d3_4_bootstrap_base_role";\n`,
    },
    {
      grantSql: read(files.grantSql).replaceAll('d3_4_bootstrap_grants_down', 'd3_4_missing_down'),
    },
    {
      grantSql: read(files.grantSql).replace(
        'reachable_roles(roleid)',
        'reachable_roles_removed(roleid)',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;',
        '-- topology normalization removed by self-test',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        "'public.system_settings', 'SELECT'",
        "'public.system_settings', 'UPDATE'",
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'AND NOT privilege.is_grantable',
        'AND privilege.is_grantable',
      ),
    },
    {
      grantSql: read(files.grantSql).replace('AND 6 = (', 'AND 5 = ('),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO :"d3_4_bootstrap_base_role";',
        '-- missing direct bootstrap resolver grant',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO :"d3_4_bootstrap_base_role";',
        '-- missing direct bootstrap canonical slug resolver grant',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO :"d3_4_bootstrap_base_role";',
        '-- missing direct bootstrap slug resolver grant',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'membership.inherit_option = false',
        'membership.inherit_option = true',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'membership.set_option = true',
        'membership.set_option = false',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'count(membership.roleid) AS direct_membership_count',
        "count(*) FILTER (WHERE granted.rolname LIKE 'app_%') AS direct_membership_count",
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'direct_membership_count = 1',
        'direct_membership_count >= 1',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'membership.admin_option = false',
        'membership.admin_option = true',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        "NOT pg_has_role(:'d3_4_media_worker_runtime_role', 'app_staff', 'MEMBER')",
        'true',
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        "NOT pg_has_role(:'d3_4_media_worker_runtime_role', 'app_patient', 'MEMBER')",
        'true',
      ),
    },
    {
      grantSql: read(files.grantSql).replaceAll('\\if :d3_4_has_p2_b_context_bundle', '\\if true'),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        'grant_webapp_bootstrap_base_login_d3_4',
        'grant_webapp_bootstrap_base_login_missing',
      ),
    },
    {
      p05bGrantSql: `${read(files.p05bGrantSql)}\n-- generated drift\n`,
    },
    {
      p05bGrantSql: `${read(files.p05bGrantSql)}\nGRANT SELECT ON TABLE public.app_runtime_settings TO app_staff;\n`,
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        'CREATE OR REPLACE FUNCTION app.current_patient_has_password_credentials()',
        'CREATE OR REPLACE FUNCTION app.missing_patient_password_accessor()',
      ),
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        'GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;',
        'GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_patient;',
      ),
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        'REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_password_credentials_owner_ident;',
        '-- leaked owner helper grant in DOWN self-test',
      ),
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        'GRANT USAGE ON SCHEMA app TO :specialist_signup_staff_security_owner_ident;',
        '-- missing derived owner schema usage in self-test',
      ),
    },
    {
      platformAccessRepo: read(files.platformAccessRepo).replace(
        'app.current_patient_has_password_credentials()',
        'EXISTS (SELECT 1 FROM user_password_credentials) AS has_password_credentials',
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replace(
        'acl.grantee = 0',
        'acl.grantee = 42',
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replace(
        'UPDATE public.media_transcode_jobs',
        'UPDATE public.missing_media_transcode_jobs',
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replace(
        "audience <> 'server' OR organization_id IS NOT NULL",
        'false',
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replace(
        'GRANT SELECT ON TABLE public.system_settings TO ${intermediaryIdent};',
        '-- adversarial intermediary grant removed by self-test',
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replaceAll(
        'TO ${bootstrapIdent} WITH GRANT OPTION;',
        'TO ${bootstrapIdent};',
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replaceAll(
        'TO ${staffIdent}, ${patientIdent}, ${arbitraryCapabilityIdent};',
        'TO ${staffIdent};',
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        '[ "$role_name" != "$staff_role" ]',
        'true',
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        '[ "$role_name" != "$media_worker_role" ]',
        'true',
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        'log "strict closure: roles + grants"\n  install_p0_5b_runtime_wall',
        'log "strict closure: roles + grants removed by self-test"',
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        'log "strict closure: reviewed runtime overlays"\n  rehydrate_post_restore_runtime_overlays',
        'log "strict closure: reviewed runtime overlays removed by self-test"',
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        'log "strict closure: protected principal helpers"\n  install_p2_b_protected_principal_context\n  log "strict closure: reviewed runtime overlays"\n  rehydrate_post_restore_runtime_overlays',
        'log "strict closure: reviewed runtime overlays"\n  rehydrate_post_restore_runtime_overlays\n  log "strict closure: protected principal helpers"\n  install_p2_b_protected_principal_context',
      ),
    },
    {
      hardProtocol: read(files.hardProtocol).replace(
        'D3.4 bootstrap/base-login grant closure',
        'final PASS',
      ),
    },
    {
      hardProtocol: read(files.hardProtocol).replace(
        'remove every unexpected direct membership',
        'preserve every unexpected direct membership',
      ),
    },
    {
      hardProtocol: read(files.hardProtocol).replace(
        'reject any equality with the nonstaff login',
        'accept equality with the nonstaff login',
      ),
    },
    {
      hardProtocol: read(files.hardProtocol).replace(
        'is the fourth direct bootstrap accessor',
        'is not a bootstrap accessor',
      ),
    },
  ];
  let detected = 0;
  const undetected = [];
  for (const [index, testCase] of cases.entries()) {
    try {
      runChecks(testCase);
      undetected.push(index + 1);
    } catch {
      detected += 1;
    }
  }
  if (detected === cases.length) {
    console.log('check-saas-d3-4-bootstrap-base-login-grants self-test: OK');
    process.exit(0);
  }
  fail(`self-test did not detect all D3.4 contract regressions (cases: ${undetected.join(', ')})`);
}

try {
  runChecks();
  console.log('check-saas-d3-4-bootstrap-base-login-grants: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-d3-4-bootstrap-base-login-grants: ${message}`);
  process.exit(1);
}
