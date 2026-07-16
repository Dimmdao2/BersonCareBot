#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  migration: "apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql",
  identityMigration: "apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql",
  historyMigration: "apps/webapp/db/drizzle-migrations/0195_e1_patient_maintenance_history.sql",
  planOpenedMigration: "apps/webapp/db/drizzle-migrations/0197_patient_plan_opened_capability.sql",
  visibleCatalogMigration: "apps/webapp/db/drizzle-migrations/0198_patient_visible_catalog_reads.sql",
  visibleCatalogOverlay: "deploy/postgres/patient-visible-catalog-rls.sql",
  bookingRowsMigration: "apps/webapp/db/drizzle-migrations/0199_current_patient_booking_rows.sql",
  productAnalyticsMigration: "apps/webapp/db/drizzle-migrations/0200_current_patient_product_analytics.sql",
  authRoleMigration: "apps/webapp/db/drizzle-migrations/0201_e1_webapp_auth_role_runtime_config.sql",
  overlay: "deploy/postgres/e1-webapp-runtime-config.sql",
  telemetryOverlay: "deploy/postgres/saas-isolation-telemetry.sql",
  runtime: "apps/webapp/src/modules/system-settings/runtimeConfig.ts",
  adapter: "apps/webapp/src/modules/system-settings/configAdapter.ts",
  envRole: "apps/webapp/src/modules/auth/envRole.ts",
  publicSnapshot: "apps/webapp/src/modules/auth/publicAuthSnapshot.ts",
  oauthProviders: "apps/webapp/src/app/api/auth/oauth/providers/route.ts",
  patientMaintenance: "apps/webapp/src/modules/system-settings/patientMaintenance.ts",
  maintenanceScreen: "apps/webapp/src/app/app/patient/PatientMaintenanceScreen.tsx",
  playback: "apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts",
  phoneStart: "apps/webapp/src/app/api/auth/phone/start/route.ts",
  authObservability: "apps/webapp/src/modules/auth/authRouteObservability.ts",
  authExchange: "apps/webapp/src/app/api/auth/exchange/route.ts",
  presignTtl: "apps/webapp/src/app-layer/media/videoPresignTtl.ts",
  operationContext: "apps/webapp/src/infra/db/saasIsolationOperationContext.ts",
  pgRuntime: "apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts",
  pgSystemSettings: "apps/webapp/src/infra/repos/pgSystemSettings.ts",
  pgMaintenanceHistory: "apps/webapp/src/infra/repos/pgPatientMaintenanceHistory.ts",
  pgPatientBookings: "apps/webapp/src/infra/repos/pgPatientBookings.ts",
  pgTreatmentProgramInstance: "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
  pgProductAnalytics: "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
  patientLayout: "apps/webapp/src/app/app/patient/layout.tsx",
  smoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-e1-webapp-runtime-config.mjs",
  poolProvider: "apps/webapp/src/infra/db/webappPoolProvider.ts",
  poolProviderTest: "apps/webapp/src/infra/db/webappPoolProvider.test.ts",
  diagnostics: "apps/webapp/src/modules/operator-health/saasIsolationDiagnostics.ts",
  deploy: "deploy/host/deploy-test-saas.sh",
  deployProd: "deploy/host/deploy-prod.sh",
  deployWebappProd: "deploy/host/deploy-webapp-prod.sh",
  deploy667: "scripts/deploy-saas-667.sh",
  journal: "apps/webapp/db/drizzle-migrations/meta/_journal.json",
  dbRegression: "scripts/check-saas-db-regression.mjs",
  migrateWrapper: "apps/webapp/scripts/run-webapp-drizzle-migrate.mjs",
  packageJson: "package.json",
  p05bGenerator: "docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs",
  p05bOverlay: "deploy/postgres/p0-5b-grants.sql",
  capabilityRehearsal: "docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-e1-patient-runtime-capabilities.mjs",
};

function read(path) { return readFileSync(path, "utf8"); }
function fail(message) { throw new Error(message); }
function requireText(label, text, fragments) {
  for (const fragment of fragments) if (!text.includes(fragment)) fail(`${label} missing: ${fragment}`);
}
function requireOrderedText(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor);
    if (index < 0) fail(`${label} missing ordered fragment: ${fragment}`);
    cursor = index + fragment.length;
  }
}
function forbidText(label, text, fragments) {
  for (const fragment of fragments) if (text.includes(fragment)) fail(`${label} forbidden: ${fragment}`);
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]));
  requireText(files.migration, loaded.migration, [
    "0193_e1_safe_runtime_config",
    "oauth_yandex_enabled", "oauth_google_enabled", "oauth_apple_enabled",
    "public_sms_fallback_enabled", "patient_booking_url",
    "debug_forward_to_admin", "video_presign_ttl_seconds",
    "'public'", "'authenticated_client'", "'server'",
    "count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5",
    "CREATE OR REPLACE FUNCTION public.sync_registered_app_runtime_setting()",
    "CREATE OR REPLACE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text)",
    "SECURITY DEFINER",
    "REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC",
    "CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)",
    "setting.audience = 'server'",
    "setting.key IN ('debug_forward_to_admin', 'video_presign_ttl_seconds')",
    "Never provide a global fallback for a clinic-owned booking destination",
    "NEW.key = 'patient_booking_url'", "NEW.organization_id IS NULL",
    "('webapp','public_auth_config')", "('webapp','patient_runtime_config')",
    "('webapp','public_booking_config')",
  ]);
  forbidText(files.migration, loaded.migration, [
    "GRANT SELECT ON TABLE public.system_settings TO app_patient",
    "GRANT SELECT ON TABLE public.system_settings TO PUBLIC",
    "OWNER TO app_owner",
    "FROM app_patient",
    "TO app_patient",
  ]);
  requireText(files.identityMigration, loaded.identityMigration, [
    "0194_e1_patient_identity_exception",
    "CREATE OR REPLACE FUNCTION app.is_current_patient_test_account()",
    "RETURNS boolean", "SECURITY DEFINER", "SET search_path = pg_catalog",
    "v_organization_id uuid := app.current_org_id()",
    "v_patient_user_id uuid := app.current_patient_user_id()",
    "FROM public.org_enrollments AS enrollment",
    "enrollment.status = 'active'",
    "setting.key = 'test_account_identifiers'",
    "setting.organization_id IS NULL",
    "FROM public.platform_users AS platform_user",
    "FROM public.user_channel_bindings AS binding",
    "binding.channel_code = 'telegram'", "binding.channel_code = 'max'",
    "RETURN false;", "REVOKE ALL ON FUNCTION app.is_current_patient_test_account() FROM PUBLIC",
    "('webapp','patient_identity_exception_check')",
    "('webapp','patient_booking_history')",
  ]);
  forbidText(files.identityMigration, loaded.identityMigration, [
    "OWNER TO app_owner",
    "GRANT SELECT ON TABLE public.system_settings TO app_patient",
    "GRANT SELECT ON TABLE public.platform_users TO app_patient",
    "GRANT SELECT ON TABLE public.user_channel_bindings TO app_patient",
    "GRANT SELECT ON TABLE public.org_enrollments TO app_patient",
  ]);
  requireText(files.historyMigration, loaded.historyMigration, [
    "0195_e1_patient_maintenance_history",
    "CREATE OR REPLACE FUNCTION app.read_current_patient_appointment_history()",
    "RETURNS TABLE (", "SECURITY DEFINER", "SET search_path = pg_catalog",
    "v_organization_id uuid := app.current_org_id()",
    "v_patient_user_id uuid := app.current_patient_user_id()",
    "FROM public.org_enrollments AS enrollment", "enrollment.status = 'active'",
    "FROM public.be_appointments AS appointment",
    "appointment.organization_id = v_organization_id",
    "appointment.platform_user_id = v_patient_user_id",
    "appointment.deleted_at IS NULL",
    "specialist.organization_id = v_organization_id",
    "branch.organization_id = v_organization_id",
    "room.organization_id = v_organization_id",
    "service.organization_id = v_organization_id",
    "ORDER BY appointment.start_at DESC, appointment.id DESC", "LIMIT 100",
    "REVOKE ALL ON FUNCTION app.read_current_patient_appointment_history() FROM PUBLIC",
  ]);
  forbidText(files.historyMigration, loaded.historyMigration, [
    "OWNER TO app_owner", "TO app_patient", "p_organization_id", "p_patient_user_id",
  ]);
  requireText(files.planOpenedMigration, loaded.planOpenedMigration, [
    "app.touch_current_patient_plan_last_opened(uuid)", "SECURITY DEFINER",
    "app.current_org_id()", "app.current_patient_user_id()", "enrollment.status = 'active'",
    "instance.organization_id = v_organization_id", "instance.patient_user_id = v_patient_user_id",
    "REVOKE ALL ON FUNCTION app.touch_current_patient_plan_last_opened(uuid) FROM PUBLIC",
  ]);
  requireText(files.bookingRowsMigration, loaded.bookingRowsMigration, [
    "app.read_current_patient_booking_rows", "RETURNS TABLE (booking jsonb)", "SECURITY DEFINER",
    "app.current_org_id()", "app.current_patient_user_id()", "enrollment.status = 'active'",
    "appointment.organization_id = v_org", "appointment.platform_user_id = v_patient",
    "LIMIT 100", "jsonb_build_object(",
  ]);
  forbidText(files.bookingRowsMigration, loaded.bookingRowsMigration, [
    "RETURNS SETOF", "SELECT * FROM public.patient_bookings", "p_organization_id", "p_patient_user_id",
  ]);
  requireText(files.productAnalyticsMigration, loaded.productAnalyticsMigration, [
    "app.record_current_patient_analytics_event", "SECURITY DEFINER", "app.current_org_id()",
    "app.current_patient_user_id()", "enrollment.status = 'active'", "organization_id, occurred_at",
    "product_analytics_hourly_org_unique", "product_analytics_user_hourly_org_unique",
    "GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at)",
    "app.record_current_patient_push_open", "push.organization_id = v_org",
    "push.user_id = v_patient", "ON CONFLICT (push_tracking_id)",
  ]);
  requireText(files.authRoleMigration, loaded.authRoleMigration, [
    "0201_e1_webapp_auth_role_runtime_config",
    "('webapp','auth_role_config')",
    "('admin_telegram_ids', '{\"value\":\"\"}'::jsonb)",
    "('admin_max_ids', '{\"value\":\"\"}'::jsonb)",
    "('admin_phones', '{\"value\":\"\"}'::jsonb)",
    "('doctor_telegram_ids', '{\"value\":\"\"}'::jsonb)",
    "('doctor_max_ids', '{\"value\":\"\"}'::jsonb)",
    "('doctor_phones', '{\"value\":\"\"}'::jsonb)",
    "'server'",
    "CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting",
    "SECURITY DEFINER",
    "setting.audience = 'server'",
    "REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC",
  ]);
  forbidText(files.authRoleMigration, loaded.authRoleMigration, [
    "GRANT SELECT ON TABLE public.system_settings",
    "TO app_patient",
    "GRANT EXECUTE",
  ]);
  requireText(files.pgPatientBookings, loaded.pgPatientBookings, [
    "app.read_current_patient_booking_rows('upcoming'", "app.read_current_patient_booking_rows('history'",
  ]);
  requireText(files.pgTreatmentProgramInstance, loaded.pgTreatmentProgramInstance, [
    "app.touch_current_patient_plan_last_opened",
  ]);
  requireText(files.pgProductAnalytics, loaded.pgProductAnalytics, [
    'runWithWebappDbOperationFamily("patient_product_analytics"',
    "app.record_current_patient_analytics_event",
    "app.record_current_patient_push_open",
  ]);
  requireText(files.p05bGenerator, loaded.p05bGenerator, [
    '"public.product_analytics_events_recent",', '"public.product_push_notifications",',
    "Direct table access would bypass the closed event semantics and org proof",
  ]);
  forbidText(files.p05bOverlay, loaded.p05bOverlay, [
    "('public', 'product_analytics_events_recent', 'SELECT, INSERT')",
    "('public', 'product_push_notifications', 'SELECT')",
  ]);
  requireText(files.capabilityRehearsal, loaded.capabilityRehearsal, [
    "--execute", "bcb_webapp_dev", "BEGIN", "ROLLBACK",
    'resolve("deploy/postgres/e1-webapp-runtime-config.sql")',
    "TO app_staff WITH GRANT OPTION", "shared capability patient",
    "app.touch_current_patient_plan_last_opened", "app.read_current_patient_booking_rows",
    "app.record_current_patient_analytics_event", "app.record_current_patient_push_open",
    "product_analytics_events_recent", "product_push_notifications",
    "NOT has_table_privilege('app_patient','public.product_analytics_events_recent','SELECT,INSERT')",
  ]);
  requireText(files.packageJson, loaded.packageJson, [
    "rehearse:e1-patient-capabilities",
    "rehearse-e1-patient-runtime-capabilities.mjs",
  ]);
  requireText(files.overlay, loaded.overlay, [
    "0193_e1_safe_runtime_config.sql", "0194_e1_patient_identity_exception.sql",
    "0195_e1_patient_maintenance_history.sql", "0197_patient_plan_opened_capability.sql",
    "0198_patient_visible_catalog_reads.sql", "0199_current_patient_booking_rows.sql",
    "0200_current_patient_product_analytics.sql", "0201_e1_webapp_auth_role_runtime_config.sql",
    "e1_webapp_runtime_role",
    "GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text)",
    "GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text)",
    "REVOKE ALL PRIVILEGES ON FUNCTION",
    "FROM :\"e1_webapp_runtime_role\" CASCADE;",
    "AND NOT privilege.is_grantable",
    "NOT has_function_privilege(",
    "NOT has_table_privilege(\n    :'e1_webapp_runtime_role',\n    'public.system_settings',\n    'SELECT'\n  )",
    "CROSS JOIN LATERAL aclexplode(",
    "COALESCE(relation.relacl, acldefault('r', relation.relowner))",
    "privilege.grantee IN (",
    "pg_has_role(",
    "relation.relowner",
    "ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner",
    "ALTER FUNCTION app.read_webapp_server_runtime_setting(text, text) OWNER TO app_owner",
    "ALTER FUNCTION app.is_current_patient_test_account() OWNER TO app_owner",
    "ALTER FUNCTION app.read_current_patient_appointment_history() OWNER TO app_owner",
    "public.be_appointments", "public.be_specialists", "public.be_branches",
    "public.be_rooms", "public.be_clinic_services", "TO app_owner",
    "REVOKE ALL PRIVILEGES ON FUNCTION app.is_current_patient_test_account()\n  FROM app_patient CASCADE",
    "DO $acl_scrub$", "SELECT DISTINCT privilege.grantee, role.rolname",
    "privilege.grantee <> procedure.proowner",
    "privilege.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')",
    "FROM PUBLIC CASCADE", "FROM %I CASCADE",
    "GRANT EXECUTE ON FUNCTION app.is_current_patient_test_account()\n  TO app_patient",
    "REVOKE ALL PRIVILEGES ON FUNCTION app.read_current_patient_appointment_history()\n  FROM app_patient CASCADE",
    "DO $history_acl_scrub$",
    "GRANT EXECUTE ON FUNCTION app.read_current_patient_appointment_history()\n  TO app_patient",
    "'app.read_current_patient_appointment_history()'::regprocedure",
    "'app.is_current_patient_test_account()'::regprocedure",
    "WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure\n      AND privilege.grantee NOT IN (",
    "privilege.grantee NOT IN (",
    "privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable",
    "NOT pg_has_role('app_patient', 'app_owner', 'MEMBER')",
    "NOT pg_has_role('app_staff', 'app_owner', 'MEMBER')",
    "NOT pg_has_role(:'e1_webapp_runtime_role', 'app_owner', 'MEMBER')",
    "REVOKE ALL ON TABLE public.system_settings, public.system_settings_audit FROM app_patient",
    "GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient",
    "DO $capability_acl_scrub$", "e1_patient_capability_acl_exact",
    "e1_patient_capability_no_direct_table_dml",
    "app.record_current_patient_push_open(timestamptz,text,uuid)",
    "GRANT USAGE ON SCHEMA app TO app_owner, app_patient",
    "REVOKE ALL ON TABLE public.product_analytics_events_recent, public.product_push_notifications FROM app_patient",
  ]);
  forbidText(files.overlay, loaded.overlay, [
    "NOT has_table_privilege(:'e1_webapp_runtime_role', 'public.app_runtime_settings', 'SELECT')",
    "GRANT SELECT ON TABLE public.system_settings TO app_patient",
    "GRANT SELECT ON TABLE public.platform_users TO app_patient",
    "GRANT SELECT ON TABLE public.user_channel_bindings TO app_patient",
    "GRANT SELECT ON TABLE public.org_enrollments TO app_patient",
    "GRANT SELECT ON TABLE public.be_appointments TO app_patient",
    "GRANT SELECT ON TABLE public.be_specialists TO app_patient",
    "GRANT SELECT ON TABLE public.be_branches TO app_patient",
    "GRANT SELECT ON TABLE public.be_rooms TO app_patient",
    "GRANT SELECT ON TABLE public.be_clinic_services TO app_patient",
  ]);
  requireText(files.telemetryOverlay, loaded.telemetryOverlay, [
    "saas_isolation_events_source_operation_check",
    "('webapp','auth_role_config')",
    "('webapp', 'auth_role_config')",
    "CREATE OR REPLACE FUNCTION app.report_saas_isolation_event",
  ]);
  requireOrderedText(files.deploy, loaded.deploy, [
    'log "strict closure: reviewed runtime overlays"',
    "rehydrate_post_restore_runtime_overlays",
    'log "strict closure: SaaS isolation telemetry privilege overlay"',
    "install_saas_isolation_telemetry_overlay",
  ]);
  requireText(files.smoke, loaded.smoke, [
    "TO app_patient WITH GRANT OPTION",
    `TO \${arbitraryRole}`,
    "SET SESSION AUTHORIZATION app_patient",
    "TO PUBLIC",
    "FROM app_patient CASCADE",
    "DO $acl_scrub$",
    "GRANT EXECUTE ON FUNCTION app.is_current_patient_test_account() TO ${arbitraryRole}",
    "NOT has_function_privilege('${publicRole}','app.is_current_patient_test_account()','EXECUTE')",
    "NOT has_function_privilege('${arbitraryRole}','app.is_current_patient_test_account()','EXECUTE')",
    "psql(runtimeAcl);",
    "0195_e1_patient_maintenance_history.sql",
    "read_current_patient_appointment_history()",
    "60000000-0000-4000-8000-000000000002",
    "appointment_id IN (",
    "0201_e1_webapp_auth_role_runtime_config.sql",
    "app.read_webapp_server_runtime_setting('admin_phones','admin')",
    "app.read_webapp_server_runtime_setting('doctor_phones','admin')",
    "app.read_webapp_server_runtime_setting('test_account_identifiers','admin')",
    "v2:role_pool_mismatch:webapp:auth_role_config",
  ]);
  requireText(files.runtime, loaded.runtime, [
    '"public_auth_config"', '"auth_role_config"', '"patient_runtime_config"', '"public_booking_config"',
    "getPublicBoolean", "getPublicString", "getAuthenticatedBoolean", "getAuthenticatedString",
    "getServerBoolean", "getServerTokenList", "getServerInteger", "public_sms_fallback_enabled: false",
    'allowGlobalFallback: key !== "patient_booking_url"',
  ]);
  requireText(files.adapter, loaded.adapter, [
    "getPublicRuntimeBool", "getPublicRuntimeValue", "getPatientRuntimeBool", "getPatientRuntimeValue",
    "getServerRuntimeBool", "getServerRuntimeTokenList", "getServerRuntimeInteger",
    "return envFallback;",
  ]);
  forbidText(files.adapter, loaded.adapter, ["return getConfigBool(key, envFallback);"]);
  requireText(files.envRole, loaded.envRole, [
    "getServerRuntimeTokenList",
    'getServerRuntimeTokenList("admin_telegram_ids"',
    'getServerRuntimeTokenList("admin_max_ids"',
    'getServerRuntimeTokenList("admin_phones"',
    'getServerRuntimeTokenList("doctor_telegram_ids"',
    'getServerRuntimeTokenList("doctor_max_ids"',
    'getServerRuntimeTokenList("doctor_phones"',
  ]);
  forbidText(files.envRole, loaded.envRole, ["getConfigValue(", "readAdminSystemSettingString"]);
  for (const text of [loaded.publicSnapshot, loaded.oauthProviders]) {
    requireText("public oauth availability", text, [
      'getPublicRuntimeBool("oauth_yandex_enabled")',
      'getPublicRuntimeBool("oauth_google_enabled")',
      'getPublicRuntimeBool("oauth_apple_enabled")',
    ]);
    forbidText("public oauth availability", text, [
      "getYandexOauthClientSecret", "getGoogleClientSecret", "getAppleOauthPrivateKey",
      "getYandexOauthClientId", "getGoogleClientId", "getAppleOauthClientId",
    ]);
  }
  requireText(files.patientMaintenance, loaded.patientMaintenance, [
    "getPatientRuntimeBool", "getPatientRuntimeValue", "organizationId: string | null",
    "organizationId === null", "Promise.resolve(\"\")",
    "resolvePatientMaintenanceOrganizationId",
  ]);
  forbidText(files.patientMaintenance, loaded.patientMaintenance, [
    "dmitryberson.rubitime.ru", "DEFAULT_PATIENT_BOOKING_URL",
  ]);
  requireText(files.maintenanceScreen, loaded.maintenanceScreen, [
    "bookingUrl: string | null", "safeExternal ? (",
  ]);
  requireText(files.playback, loaded.playback, [
    'getPatientRuntimeBool("video_playback_api_enabled")',
    'getPatientRuntimeValue("video_default_delivery")',
  ]);
  requireText(files.operationContext, loaded.operationContext, [
    "AsyncLocalStorage", '"public_auth_config"', '"auth_role_config"', '"patient_runtime_config"', '"public_booking_config"',
    '"patient_identity_exception_check"', '"patient_booking_history"',
  ]);
  requireText(files.pgRuntime, loaded.pgRuntime, [
    "FROM app.read_public_runtime_setting($1, $2)",
    'input.allowedAudiences[0] === "public"',
    "FROM app.read_webapp_server_runtime_setting($1, $2)",
    'input.allowedAudiences[0] === "server"',
    'runWithDbBootstrapPrincipal({ source: "webapp-server-runtime-config" }',
    'runWithDbBootstrapPrincipal({ source: "webapp-public-runtime-config" }',
    "input.allowGlobalFallback !== false",
  ]);
  requireText(files.pgSystemSettings, loaded.pgSystemSettings, [
    "isCurrentPatientTestAccount", 'runWithWebappDbOperationFamily("patient_identity_exception_check"',
    "SELECT app.is_current_patient_test_account() AS allowed",
  ]);
  requireText(files.patientLayout, loaded.patientLayout, [
    "deps.patientMaintenanceHistory.listCurrentPatientHistory()",
    "deps.systemSettings.isCurrentPatientTestAccount()",
  ]);
  forbidText(files.patientLayout, loaded.patientLayout, [
    "patientBooking.listMyBookings", "clientHistory.listVisitHistory",
    "isTestPatientSession", "test_account_identifiers",
  ]);
  requireText(files.pgMaintenanceHistory, loaded.pgMaintenanceHistory, [
    'runWithWebappDbOperationFamily("patient_booking_history"',
    "SELECT * FROM app.read_current_patient_appointment_history()",
    "result.rows.map(mapRow)",
  ]);
  forbidText(files.pgMaintenanceHistory, loaded.pgMaintenanceHistory, [
    "be_appointments", "organizationId", "patientUserId", "platformUserId",
  ]);
  requireText(files.poolProvider, loaded.poolProvider, [
    'getCurrentWebappDbOperationFamily() ?? "webapp_db_request"',
    "sourceOperation: currentWebappDbSourceOperation()",
  ]);
  forbidText(files.poolProvider, loaded.poolProvider, [
    'sourceOperation: "webapp_db_request"',
  ]);
  requireText(files.poolProviderTest, loaded.poolProviderTest, [
    'runWithWebappDbOperationFamily("public_booking_config"',
    '"public_auth_config"', '"auth_role_config"', '"patient_runtime_config"', '"public_booking_config"',
    '"patient_identity_exception_check"', '"patient_booking_history"',
    'sourceOperation: "webapp_db_request"',
    "sourceOperation: family",
  ]);
  requireText(files.phoneStart, loaded.phoneStart, [
    'getPublicRuntimeBool("public_sms_fallback_enabled")',
  ]);
  requireText(files.authObservability, loaded.authObservability, [
    'getServerRuntimeBool("debug_forward_to_admin")',
  ]);
  requireText(files.authExchange, loaded.authExchange, [
    'getServerRuntimeBool("debug_forward_to_admin")',
  ]);
  requireText(files.presignTtl, loaded.presignTtl, [
    'getServerRuntimeInteger("video_presign_ttl_seconds")',
  ]);
  for (const text of [loaded.phoneStart, loaded.authObservability, loaded.authExchange, loaded.presignTtl]) {
    forbidText("closed E1 call chain", text, [
      "getSmsFallbackEnabled", "getConfigBool", "getConfigPositiveInt", "getConfigValue",
    ]);
  }
  requireText(files.diagnostics, loaded.diagnostics, [
    '"public_auth_config"', '"auth_role_config"', '"patient_runtime_config"', '"public_booking_config"',
    '"patient_identity_exception_check"', '"patient_booking_history"',
  ]);
  requireText(files.deploy, loaded.deploy, [
    "E1_WEBAPP_RUNTIME_CONFIG=deploy/postgres/e1-webapp-runtime-config.sql",
    'e1_webapp_runtime_role="$e1_runtime_role"',
    '"$DEPLOY_REPO/$E1_WEBAPP_RUNTIME_CONFIG"',
  ]);
  requireText(files.journal, loaded.journal, [
    '"idx": 193', '"tag": "0193_e1_safe_runtime_config"',
    '"idx": 194', '"tag": "0194_e1_patient_identity_exception"',
    '"idx": 195', '"tag": "0195_e1_patient_maintenance_history"',
    '"idx": 201', '"tag": "0201_e1_webapp_auth_role_runtime_config"',
  ]);
  requireText(files.visibleCatalogMigration, loaded.visibleCatalogMigration, [
    "to_regprocedure('app.current_org_id()') IS NULL",
    "to_regprocedure('app.current_patient_user_id()') IS NULL",
    "deferring patient catalog policies to post-P2-B overlay",
  ]);
  requireText(files.visibleCatalogOverlay, loaded.visibleCatalogOverlay, [
    "patient_visible_catalog_principal_helpers_missing",
    "CREATE POLICY patient_current_org_select ON public.patient_home_blocks",
    "CREATE POLICY patient_current_org_select ON public.patient_home_block_items",
    "CREATE POLICY patient_visible_current_org_select ON public.content_sections",
    "CREATE POLICY patient_current_org_select ON public.content_section_slug_history",
    "enrollment.status = 'active'",
  ]);
  requireText(files.deploy, loaded.deploy, [
    "PATIENT_VISIBLE_CATALOG_RLS=deploy/postgres/patient-visible-catalog-rls.sql",
    '"$DEPLOY_REPO/$PATIENT_VISIBLE_CATALOG_RLS"',
  ]);
  requireText(files.deployProd, loaded.deployProd, [
    "PATIENT_VISIBLE_CATALOG_RLS=deploy/postgres/patient-visible-catalog-rls.sql",
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_VISIBLE_CATALOG_RLS}"',
  ]);
  requireText(files.deployWebappProd, loaded.deployWebappProd, [
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-visible-catalog-rls.sql"',
  ]);
  requireText(files.deploy667, loaded.deploy667, [
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f deploy/postgres/patient-visible-catalog-rls.sql',
  ]);
  requireOrderedText(`${files.deploy} post-P2-B order`, loaded.deploy, [
    "  install_p2_b_protected_principal_context\n",
    "  rehydrate_post_restore_runtime_overlays\n",
  ]);
  requireOrderedText(`${files.deployProd} post-migrate order`, loaded.deployProd, [
    "pnpm --dir apps/webapp run migrate",
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_VISIBLE_CATALOG_RLS}"',
  ]);
  requireOrderedText(`${files.deployWebappProd} post-migrate order`, loaded.deployWebappProd, [
    "pnpm --dir apps/webapp run migrate",
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-visible-catalog-rls.sql"',
  ]);
  requireOrderedText(`${files.deploy667} post-P2-B order`, loaded.deploy667, [
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${p2_b_psql_file}"',
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f deploy/postgres/patient-visible-catalog-rls.sql',
  ]);
  requireText(files.dbRegression, loaded.dbRegression, [
    '"docs/_TODO/SAAS_FOUNDATION/scripts/check-e1-webapp-runtime-config.mjs"',
    '"--self-test"',
  ]);
  requireText(files.migrateWrapper, loaded.migrateWrapper, [
    "classifyMigrationFailureOutput", "renderStructuredMigrationFailureDiagnostic",
    "findMigrationIdentity", "classifyStructuredMigrationFailure",
    "OBJECT_CONFLICT_SQLSTATES", "SCHEMA_MISMATCH_SQLSTATES",
    "role_membership_required", "permission_denied", "migration_failed",
    'migration=${identity?.tag ?? "unknown"}', 'idx=${identity?.idx ?? "unknown"}',
    'sqlstate=${diagnostic.sqlstate ?? "unknown"}',
    "raw SQL and parameters suppressed",
    'process.argv.includes("--self-test")',
  ]);
  forbidText(files.migrateWrapper, loaded.migrateWrapper, [
    'stdio: "inherit"', "sanitizeMigrationFailureOutput", "Sanitized underlying diagnostics",
    "console.error(`[migrate] ${line}`)", "console.error(error)", "console.error(error.cause)",
  ]);
  requireText(files.packageJson, loaded.packageJson, [
    "node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test",
  ]);
}

if (process.argv.includes("--self-test")) {
  const cases = [
    ["patient system_settings grant", { overlay: read(files.overlay).replace("REVOKE ALL ON TABLE public.system_settings, public.system_settings_audit FROM app_patient", "-- removed") }],
    ["migration protected-owner coupling", { migration: `${read(files.migration)}\nALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner;\n` }],
    ["identity migration owner coupling", { identityMigration: `${read(files.identityMigration)}\nALTER FUNCTION app.is_current_patient_test_account() OWNER TO app_owner;\n` }],
    ["identity signed context", { identityMigration: read(files.identityMigration).replace("app.current_patient_user_id()", "NULL::uuid") }],
    ["identity active enrollment", { identityMigration: read(files.identityMigration).replace("enrollment.status = 'active'", "true") }],
    ["identity raw source grant", { identityMigration: `${read(files.identityMigration)}\nGRANT SELECT ON TABLE public.system_settings TO app_patient;\n` }],
    ["identity capability callsite", { pgSystemSettings: read(files.pgSystemSettings).replace("SELECT app.is_current_patient_test_account() AS allowed", "SELECT false AS allowed") }],
    ["history migration signed identity", { historyMigration: read(files.historyMigration).replace("app.current_patient_user_id()", "NULL::uuid") }],
    ["history migration active enrollment", { historyMigration: read(files.historyMigration).replace("enrollment.status = 'active'", "true") }],
    ["history migration bound", { historyMigration: read(files.historyMigration).replace("LIMIT 100", "") }],
    ["history migration raw grant", { historyMigration: `${read(files.historyMigration)}\nGRANT SELECT ON TABLE public.be_appointments TO app_patient;\n` }],
    ["booking capability unbounded", { bookingRowsMigration: read(files.bookingRowsMigration).replace("LIMIT 100", "") }],
    ["booking capability raw projection", { bookingRowsMigration: read(files.bookingRowsMigration).replace("SELECT jsonb_build_object(", "SELECT * FROM public.patient_bookings; SELECT jsonb_build_object(") }],
    ["analytics org attribution", { productAnalyticsMigration: read(files.productAnalyticsMigration).replaceAll("organization_id, occurred_at", "occurred_at") }],
    ["analytics monotonic last seen", { productAnalyticsMigration: read(files.productAnalyticsMigration).replaceAll("GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at)", "EXCLUDED.last_seen_at") }],
    ["push open org proof", { productAnalyticsMigration: read(files.productAnalyticsMigration).replace("push.organization_id = v_org", "true") }],
    ["push open patient proof", { productAnalyticsMigration: read(files.productAnalyticsMigration).replace("push.user_id = v_patient", "true") }],
    ["p0 raw analytics grant", { p05bOverlay: `${read(files.p05bOverlay)}\n('public', 'product_analytics_events_recent', 'SELECT, INSERT')\n` }],
    ["capability rehearsal raw denial", { capabilityRehearsal: read(files.capabilityRehearsal).replace("NOT has_table_privilege('app_patient','public.product_analytics_events_recent','SELECT,INSERT')", "true") }],
    ["booking history attribution", { pgMaintenanceHistory: read(files.pgMaintenanceHistory).replace('runWithWebappDbOperationFamily("patient_booking_history"', 'runWithWebappDbOperationFamily("patient_runtime_config"') }],
    ["booking history accessor", { pgMaintenanceHistory: read(files.pgMaintenanceHistory).replace("SELECT * FROM app.read_current_patient_appointment_history()", "SELECT * FROM be_appointments") }],
    ["legacy booking callsite", { patientLayout: `${read(files.patientLayout)}\nvoid patientBooking.listMyBookings;\n` }],
    ["oauth source cardinality", { migration: read(files.migration).replaceAll("count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5", "true") }],
    ["public generic fallback", { adapter: read(files.adapter).replace("return envFallback;", "return getConfigBool(key, envFallback);") }],
    ["public OAuth secret read", { publicSnapshot: `${read(files.publicSnapshot)}\nvoid getGoogleClientSecret();\n` }],
    ["patient organization scope", { patientMaintenance: read(files.patientMaintenance).replace("organizationId: string | null", "organizationId: string") }],
    ["patient booking null guard", { patientMaintenance: read(files.patientMaintenance).replace("organizationId === null", "false") }],
    ["operation attribution", { operationContext: read(files.operationContext).replace('"public_booking_config"', '"removed_booking_config"') }],
    ["public accessor", { pgRuntime: read(files.pgRuntime).replace("FROM app.read_public_runtime_setting($1, $2)", "FROM public.app_runtime_settings") }],
    ["public bootstrap principal", { pgRuntime: read(files.pgRuntime).replace('runWithDbBootstrapPrincipal({ source: "webapp-public-runtime-config" }', 'Promise.resolve') }],
    ["server accessor", { pgRuntime: read(files.pgRuntime).replace("FROM app.read_webapp_server_runtime_setting($1, $2)", "FROM public.app_runtime_settings") }],
    ["pool operation attribution", { poolProvider: read(files.poolProvider).replace('getCurrentWebappDbOperationFamily() ?? "webapp_db_request"', '"webapp_db_request"') }],
    ["legacy SMS read", { phoneStart: `${read(files.phoneStart)}\nvoid getSmsFallbackEnabled();\n` }],
    ["legacy server read", { presignTtl: `${read(files.presignTtl)}\nvoid getConfigPositiveInt();\n` }],
    ["deploy overlay", { deploy: read(files.deploy).replace("E1_WEBAPP_RUNTIME_CONFIG=deploy/postgres/e1-webapp-runtime-config.sql", "E1_WEBAPP_RUNTIME_CONFIG=") }],
    ["telemetry auth role operation", { telemetryOverlay: read(files.telemetryOverlay).replaceAll("auth_role_config", "removed_auth_role_config") }],
    ["visible catalog fresh guard", { visibleCatalogMigration: read(files.visibleCatalogMigration).replace("to_regprocedure('app.current_patient_user_id()') IS NULL", "false") }],
    ["visible catalog post-P2-B overlay", { visibleCatalogOverlay: read(files.visibleCatalogOverlay).replace("patient_visible_catalog_principal_helpers_missing", "removed") }],
    ["visible catalog full prod wiring", { deployProd: read(files.deployProd).replace('psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_VISIBLE_CATALOG_RLS}"', "# removed") }],
    ["visible catalog webapp prod wiring", { deployWebappProd: read(files.deployWebappProd).replace('psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-visible-catalog-rls.sql"', "# removed") }],
    ["visible catalog disposable wiring", { deploy667: read(files.deploy667).replace('psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f deploy/postgres/patient-visible-catalog-rls.sql', "# removed") }],
    ["visible catalog TEST post-P2-B order", { deploy: read(files.deploy).replace("  install_p2_b_protected_principal_context\n", "  rehydrate_post_restore_runtime_overlays\n") }],
    ["visible catalog full prod post-migrate order", { deployProd: read(files.deployProd).replace("pnpm --dir apps/webapp run migrate", "# removed migrate marker") }],
    ["visible catalog webapp prod post-migrate order", { deployWebappProd: read(files.deployWebappProd).replace("pnpm --dir apps/webapp run migrate", "# removed migrate marker") }],
    ["visible catalog disposable post-P2-B order", { deploy667: read(files.deploy667).replace('psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${p2_b_psql_file}"', "# removed P2-B marker") }],
    ["overlay direct ACL closure", { overlay: read(files.overlay).replace("COALESCE(relation.relacl, acldefault('r', relation.relowner))", "relation.relacl") }],
    ["overlay effective source-table denial", { overlay: read(files.overlay).replace("'public.system_settings',\n    'SELECT'", "'public.system_settings',\n    'UPDATE'") }],
    ["overlay stale effective ACL predicate", { overlay: `${read(files.overlay)}\nSELECT NOT has_table_privilege(:'e1_webapp_runtime_role', 'public.app_runtime_settings', 'SELECT');\n` }],
    ["overlay stale accessor grant option", { overlay: read(files.overlay).replaceAll("AND NOT privilege.is_grantable", "AND privilege.is_grantable") }],
    ["patient capability stale grant option", { overlay: read(files.overlay).replaceAll("FROM app_patient CASCADE", "FROM app_patient") }],
    ["patient capability arbitrary grantee scrub", { overlay: read(files.overlay).replace("DO $acl_scrub$", "DO $removed_acl_scrub$") }],
    ["patient capability final ACL allowlist", { overlay: read(files.overlay).replace("WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure\n      AND privilege.grantee NOT IN (", "WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure\n      AND privilege.grantee IN (") }],
    ["patient capability owner membership path", { overlay: read(files.overlay).replace("AND NOT pg_has_role('app_patient', 'app_owner', 'MEMBER')", "") }],
    ["patient capability adversarial smoke", { smoke: read(files.smoke).replace("TO app_patient WITH GRANT OPTION", "TO app_patient") }],
    ["migration diagnostics allowlist", { migrateWrapper: `${read(files.migrateWrapper)}\nconsole.error(error);\n` }],
  ];
  let detected = 0;
  const missed = [];
  for (const [label, testCase] of cases) {
    try { runChecks(testCase); missed.push(label); } catch { detected += 1; }
  }
  if (missed.length > 0) fail(`self-test missed: ${missed.join(", ")}`);
  if (detected !== cases.length) fail(`self-test detected ${detected}/${cases.length}`);
  console.log("check-e1-webapp-runtime-config self-test: OK");
} else {
  runChecks();
  console.log("check-e1-webapp-runtime-config: OK");
}
