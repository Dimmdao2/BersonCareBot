#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { getAppStaffGrantTables, renderP05bGrantsSql } from "./p0-5b-grants-sql.mjs";

const files = {
  grantSql: "deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
  d2GrantSql: "deploy/postgres/d2-fb1-bootstrap-phone-write-grants.sql",
  p05bGrantSql: "deploy/postgres/p0-5b-grants.sql",
  organizationMemberInvitesSql: "deploy/postgres/organization-member-invites-rls.sql",
  storeEntitlementsSql: "deploy/postgres/store-p0-entitlements-rls.sql",
  patientCourseWallSql: "deploy/postgres/patient-course-assignment-wall.sql",
  publicBootstrapSql: "deploy/postgres/specialist-signup-public-bootstrap-rls.sql",
  specialistOwnerProvisioningSql: "deploy/postgres/specialist-owner-provisioning-rls.sql",
  patientVapidAccessorSql: "deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
  testDeploySaas: "deploy/host/deploy-test-saas.sh",
  platformAccessRepo: "apps/webapp/src/infra/repos/pgPlatformAccess.ts",
  hardProtocol: "docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md",
  runtimeHelperSmoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-d3-4-runtime-helper-grants.mjs",
  packageJson: "package.json",
};

const requiredTables = [
  "public.be_organization_members",
  "public.platform_users",
  "public.user_channel_bindings",
  "public.be_external_entity_mappings",
  "public.be_specialist_service_availability",
  "public.be_branches",
  "public.be_clinic_services",
  "public.be_specialists",
];

const requiredFunctions = [
  "app.release_principal_context()",
  "app.current_org_id()",
  "app.current_patient_user_id()",
  "app.current_integrator_user_id()",
  "app.close_active_user_phone_history(uuid)",
  "app.is_staff()",
  "app.get_public_config_bool(text)",
  "app.current_patient_has_password_credentials()",
  "app.current_patient_has_web_oauth_binding()",
  "app.email_password_register_pending(text, text, text, text)",
  "app.email_password_delete_unverified_registration(uuid)",
  "app.email_password_find_user_id_by_email_challenge(uuid)",
  "app.email_password_find_login_candidate(text)",
  "app.create_specialist_signup_intent(uuid, uuid, text, text, text)",
  "app.get_pending_specialist_signup_intent(uuid, uuid)",
  "app.get_specialist_signup_intent_by_challenge(uuid)",
  "app.provision_specialist_owner(uuid, uuid)",
  "app.lookup_pending_org_invite(text)",
  "app.accept_org_invite(text, uuid, text)",
  "app.email_otp_public_find_or_create_user(text)",
  "app.email_otp_public_find_latest_email_challenge_by_email(text, bigint)",
  "app.email_otp_public_find_email_send_cooldown_by_email(text)",
  "app.email_auth_find_email_send_cooldown(uuid, text)",
  "app.email_auth_delete_email_challenges_for_user(uuid)",
  "app.email_auth_insert_email_challenge(uuid, text, text, bigint)",
  "app.email_auth_delete_email_challenge_by_id(uuid)",
  "app.email_auth_upsert_email_send_cooldown(uuid, text)",
  "app.email_auth_find_email_challenge_for_confirm(uuid, uuid)",
  "app.email_auth_update_email_challenge_attempts(uuid, integer)",
  "app.email_auth_find_email_owner_conflict(uuid, text)",
  "app.email_auth_verify_user_email(uuid, text)",
  "app.email_auth_find_email_challenge_for_consume(uuid, uuid)",
  "app.email_auth_find_latest_email_challenge_for_user(uuid, bigint)",
  "app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint)",
];

const overlayManagedAppStaffTables = [
  "public.organization_member_invites",
  "public.saas_org_entitlement_overrides",
  "public.saas_tariffs",
  "public.specialist_signup_intents",
];

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function requireOccurrenceCount(label, text, fragment, expectedCount) {
  const actualCount = text.split(fragment).length - 1;
  if (actualCount !== expectedCount) {
    fail(
      `${label} expected ${expectedCount} occurrences of ${fragment}, got ${actualCount}`,
    );
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) {
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
    const nextIndex = text.indexOf(fragment, cursor);
    if (nextIndex < 0) {
      fail(`${label} missing ordered fragment after offset ${cursor}: ${fragment}`);
    }
    cursor = nextIndex + fragment.length;
  }
}

function extractBashFunction(text, functionName) {
  const marker = `${functionName}(){`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`${files.testDeploySaas} missing function ${functionName}`);
  const bodyStart = start + marker.length;
  const relativeEnd = text.slice(bodyStart).search(/^}\s*$/m);
  if (relativeEnd < 0) fail(`${files.testDeploySaas} has unterminated function ${functionName}`);
  return text.slice(bodyStart, bodyStart + relativeEnd);
}

function extractDeployMain(text) {
  const marker = "# 0. preflight";
  const start = text.indexOf(marker);
  if (start < 0) fail(`${files.testDeploySaas} missing main preflight marker`);
  return text.slice(start);
}

function assertPackageScript(packageJsonText) {
  const packageJson = JSON.parse(packageJsonText);
  const expected =
    "node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs && bash -n deploy/host/deploy-test-saas.sh && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs --self-test";
  if (packageJson.scripts?.["check:saas-d3-4-bootstrap-base-login-grants"] !== expected) {
    fail("package.json has an unexpected check:saas-d3-4-bootstrap-base-login-grants script");
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.grantSql, loaded.grantSql, [
    "D3.4 bootstrap/base-login direct read grant closure",
    "d3_4_bootstrap_base_role",
    "d3_4_media_worker_runtime_role",
    "d3_4_bootstrap_grants_down",
    "d3_4_bootstrap_base_role_exists",
    "d3_4_bootstrap_base_role_no_rls_bypass",
    "d3_4_bootstrap_base_role_not_staff_member",
    "d3_4_bootstrap_base_role_is_patient_member",
    "d3_4_media_worker_runtime_role_is_restricted",
    "d3_4_p2_b_context_bundle_is_complete_or_absent",
    "d3_4_has_p2_b_context_bundle",
    "to_regprocedure('app.release_principal_context()')",
    "to_regprocedure('app.close_active_user_phone_history(uuid)')",
    "pg_has_role(:'d3_4_bootstrap_base_role', 'app_patient', 'MEMBER')",
    "GRANT USAGE ON SCHEMA public, app TO :\"d3_4_bootstrap_base_role\";",
    "GRANT USAGE ON SCHEMA app TO :\"d3_4_media_worker_runtime_role\";",
    "REVOKE USAGE ON SCHEMA app FROM :\"d3_4_bootstrap_base_role\";",
    "REVOKE USAGE ON SCHEMA public FROM :\"d3_4_bootstrap_base_role\";",
    "REVOKE USAGE ON SCHEMA app FROM :\"d3_4_media_worker_runtime_role\";",
    "GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :\"d3_4_media_worker_runtime_role\";",
    "REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM :\"d3_4_media_worker_runtime_role\";",
    "REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;",
    "Do not add clinical/media/content/full-settings tables here",
  ]);
  requireOccurrenceCount(
    files.grantSql,
    loaded.grantSql,
    "\\if :d3_4_has_p2_b_context_bundle",
    2,
  );
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
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :\"d3_4_bootstrap_base_role\";",
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :\"d3_4_bootstrap_base_role\";",
    "REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_phone_history FROM :\"d3_4_bootstrap_base_role\";",
    "REVOKE SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts FROM :\"d3_4_bootstrap_base_role\";",
  ]);
  forbidFragments(files.grantSql, loaded.grantSql, [
    "/opt/env",
    "api.prod",
    "webapp.prod",
    "bcb_webapp_prod",
    "bcb_webapp_dev",
    "public.system_settings",
    "public.content_pages",
    "public.media_files",
  ]);
  forbidRegex(files.grantSql, loaded.grantSql, [
    /\bALTER\s+ROLE\b/i,
    /\bGRANT\s+app_staff\b/i,
    /\bGRANT\s+app_owner\b/i,
    /\bGRANT\s+app_patient\b/i,
    /\bGRANT\s+SELECT\s+ON\s+ALL\s+TABLES\b/i,
    /\bGRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\./i,
  ]);

  requireFragments(files.d2GrantSql, loaded.d2GrantSql, [
    "d2_fb1_bootstrap_base_role",
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :\"d2_fb1_bootstrap_base_role\";",
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :\"d2_fb1_bootstrap_base_role\";",
  ]);

  if (loaded.p05bGrantSql !== renderP05bGrantsSql()) {
    fail(`${files.p05bGrantSql} is not in sync with p0-5b-grants-sql.mjs`);
  }
  const appStaffGrantTables = getAppStaffGrantTables();
  if (appStaffGrantTables.length !== 219) {
    fail(`P0.5b app_staff grant surface must remain the reviewed 219-table snapshot, got ${appStaffGrantTables.length}`);
  }
  for (const qualifiedName of overlayManagedAppStaffTables) {
    if (appStaffGrantTables.some((table) => table.qualifiedName === qualifiedName)) {
      fail(`P0.5b app_staff grant surface must leave ${qualifiedName} to its dedicated overlay`);
    }
  }
  requireFragments(files.p05bGrantSql, loaded.p05bGrantSql, [
    'REVOKE ALL PRIVILEGES ON TABLE "public"."user_password_credentials" FROM app_patient;',
    'REVOKE ALL PRIVILEGES ON TABLE "public"."user_oauth_bindings" FROM app_patient;',
    "'REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM app_patient'",
  ]);
  forbidRegex(files.p05bGrantSql, loaded.p05bGrantSql, [
    /GRANT\s+[^;]*ON\s+TABLE\s+"public"\."user_password_credentials"\s+TO\s+app_patient/i,
    /GRANT\s+[^;]*ON\s+TABLE\s+"public"\."user_oauth_bindings"\s+TO\s+app_patient/i,
  ]);

  requireFragments(files.organizationMemberInvitesSql, loaded.organizationMemberInvitesSql, [
    "R1 clinic member invites RLS/grants overlay",
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" TO app_staff;',
  ]);
  requireFragments(files.storeEntitlementsSql, loaded.storeEntitlementsSql, [
    "Store P0 — entitlement foundation (dormant)",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_tariffs TO app_staff;",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides TO app_staff;",
  ]);
  requireFragments(files.patientCourseWallSql, loaded.patientCourseWallSql, [
    "patient-course-assignment-wall UP complete",
    "GRANT SELECT ON TABLE public.courses TO app_patient;",
  ]);
  requireFragments(files.specialistOwnerProvisioningSql, loaded.specialistOwnerProvisioningSql, [
    "CREATE OR REPLACE FUNCTION app.provision_specialist_owner(",
    "SET search_path = pg_catalog",
    "GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid, uuid) TO app_patient;",
  ]);
  requireFragments(files.patientVapidAccessorSql, loaded.patientVapidAccessorSql, [
    "CREATE OR REPLACE FUNCTION app.get_web_push_vapid_public_key()",
    "SET search_path = pg_catalog",
    "GRANT EXECUTE ON FUNCTION app.get_web_push_vapid_public_key() TO app_patient;",
  ]);

  requireFragments(files.publicBootstrapSql, loaded.publicBootstrapSql, [
    "WHEN p_key <> 'specialist_signup_enabled' THEN NULL::boolean",
    "CREATE OR REPLACE FUNCTION app.current_patient_has_password_credentials()",
    "pg_catalog.to_regprocedure('app.current_patient_user_id()') IS NOT NULL",
    "v_patient_user_id := NULLIF(pg_catalog.current_setting('app.patient_user_id', true), '')::uuid;",
    "WHERE c.user_id = v_patient_user_id",
    "SELECT quote_ident(:'specialist_signup_password_credentials_owner') AS specialist_signup_password_credentials_owner_ident \\gset",
    "ALTER FUNCTION app.current_patient_has_password_credentials() OWNER TO :specialist_signup_password_credentials_owner_ident;",
    "REVOKE ALL ON FUNCTION app.current_patient_has_password_credentials() FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.current_patient_has_password_credentials() TO app_staff, app_patient;",
    "CREATE OR REPLACE FUNCTION app.staff_user_has_password_credentials(p_user_id uuid)",
    "REVOKE ALL ON FUNCTION app.staff_user_has_password_credentials(uuid) FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;",
    "CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)",
    "REVOKE ALL ON FUNCTION app.email_password_find_login_candidate(text) FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) TO app_patient;",
    "CREATE OR REPLACE FUNCTION app.current_patient_has_web_oauth_binding()",
    "ALTER FUNCTION app.current_patient_has_web_oauth_binding() OWNER TO :specialist_signup_oauth_bindings_owner_ident;",
    "GRANT EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() TO app_staff, app_patient;",
    "CREATE OR REPLACE FUNCTION app.staff_user_has_web_oauth_binding(p_user_id uuid)",
    "REVOKE ALL ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) TO app_staff;",
    "DROP FUNCTION IF EXISTS app.staff_user_has_password_credentials(uuid);",
    "DROP FUNCTION IF EXISTS app.staff_user_has_web_oauth_binding(uuid);",
    "REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_password_credentials_owner_ident;",
    "REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_oauth_bindings_owner_ident;",
  ]);
  forbidFragments(files.publicBootstrapSql, loaded.publicBootstrapSql, [
    "SET search_path = public, pg_catalog",
    "SET search_path = public, app, pg_catalog",
  ]);
  forbidFragments(files.organizationMemberInvitesSql, loaded.organizationMemberInvitesSql, [
    "SET search_path = public, pg_catalog",
  ]);

  requireFragments(files.platformAccessRepo, loaded.platformAccessRepo, [
    "CASE WHEN app.is_staff()",
    "app.staff_user_has_password_credentials(pu.id)",
    "app.current_patient_has_password_credentials()",
    "app.staff_user_has_web_oauth_binding(pu.id)",
    "app.current_patient_has_web_oauth_binding()",
  ]);
  requireFragments(files.runtimeHelperSmoke, loaded.runtimeHelperSmoke, [
    "d3_4_media_worker_runtime_role",
    "app.staff_user_has_password_credentials(uuid)",
    "app.release_principal_context()",
    "app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)",
    "app.current_org_id()",
    "app.reset_principal_context()",
    "acl.grantee = 0",
    'SET SESSION AUTHORIZATION ${mediaIdent}',
  ]);
  forbidRegex(files.platformAccessRepo, loaded.platformAccessRepo, [
    /FROM\s+(?:public\.)?user_password_credentials\b/i,
    /FROM\s+(?:public\.)?user_oauth_bindings\b/i,
  ]);

  requireFragments(files.testDeploySaas, loaded.testDeploySaas, [
    "D3_4_BOOTSTRAP_GRANTS=deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
    "P0_5B_GRANTS=deploy/postgres/p0-5b-grants.sql",
    "ORGANIZATION_MEMBER_INVITES_RLS=deploy/postgres/organization-member-invites-rls.sql",
    "STORE_P0_ENTITLEMENTS_RLS=deploy/postgres/store-p0-entitlements-rls.sql",
    "PATIENT_COURSE_WALL=deploy/postgres/patient-course-assignment-wall.sql",
    "PUBLIC_BOOTSTRAP_RLS=deploy/postgres/specialist-signup-public-bootstrap-rls.sql",
    "SPECIALIST_OWNER_PROVISIONING_RLS=deploy/postgres/specialist-owner-provisioning-rls.sql",
    "PATIENT_VAPID_ACCESSOR=deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
    "-f \"$DEPLOY_REPO/$P0_5B_GRANTS\"",
    "-f \"$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS\"",
    "-f \"$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS\"",
    "-f \"$DEPLOY_REPO/$PATIENT_COURSE_WALL\"",
    "-f \"$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS\"",
    "-f \"$DEPLOY_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS\"",
    "-f \"$DEPLOY_REPO/$PATIENT_VAPID_ACCESSOR\"",
    "sudo -u deploy cat \"$DEPLOY_REPO/$P2_B_CONTEXT\"",
    "[ -r \"$SRC_REPO/$P0_5B_GRANTS\" ]",
    "[ -r \"$SRC_REPO/$ORGANIZATION_MEMBER_INVITES_RLS\" ]",
    "[ -r \"$SRC_REPO/$STORE_P0_ENTITLEMENTS_RLS\" ]",
    "[ -r \"$SRC_REPO/$PATIENT_COURSE_WALL\" ]",
    "[ -r \"$SRC_REPO/$PUBLIC_BOOTSTRAP_RLS\" ]",
    "[ -r \"$SRC_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS\" ]",
    "[ -r \"$SRC_REPO/$PATIENT_VAPID_ACCESSOR\" ]",
    "discover_webapp_bootstrap_base_role(){",
    "discover_media_worker_runtime_role(){",
    "\\${DATABASE_URL_NONSTAFF:-\\${DATABASE_URL:-}}",
    "grant_webapp_bootstrap_base_login_d3_4(){",
    "role_name=\"$(discover_webapp_bootstrap_base_role)\"",
    "media_worker_role=\"$(discover_media_worker_runtime_role)\"",
    "-v d3_4_bootstrap_base_role=\"$role_name\"",
    "-v d3_4_media_worker_runtime_role=\"$media_worker_role\"",
    "-f \"$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS\"",
    "[ -r \"$SRC_REPO/$D3_4_BOOTSTRAP_GRANTS\" ]",
    "grant_webapp_bootstrap_base_login_d3_4",
  ]);
  const wallInstaller = extractBashFunction(
    loaded.testDeploySaas,
    "install_p0_5b_runtime_wall",
  );
  requireOrderedFragments(`${files.testDeploySaas} unconditional P0.5b installer`, wallInstaller, [
    "-f \"$DEPLOY_REPO/$P0_5B_ROLES\"",
    "-f \"$DEPLOY_REPO/$P0_5B_GRANTS\"",
  ]);
  forbidFragments(`${files.testDeploySaas} unconditional P0.5b installer`, wallInstaller, [
    "$DEPLOY_REPO/$P2_B_CONTEXT",
    "$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS",
    "$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS",
    "$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS",
  ]);
  const protectedInstaller = extractBashFunction(
    loaded.testDeploySaas,
    "install_p2_b_protected_principal_context",
  );
  requireOrderedFragments(`${files.testDeploySaas} signed P2-B branch`, protectedInstaller, [
    "if ! resolve_p2_b_signing_secret; then",
    "P2-B protected principal context: skipped (legacy-guc without signing secret)",
    "return 0",
    "sudo -u deploy cat \"$DEPLOY_REPO/$P2_B_CONTEXT\"",
  ]);
  forbidFragments(`${files.testDeploySaas} signed P2-B branch`, protectedInstaller, [
    "$DEPLOY_REPO/$P0_5B_ROLES",
    "$DEPLOY_REPO/$P0_5B_GRANTS",
    "$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS",
    "$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS",
    "$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS",
  ]);
  const overlayInstaller = extractBashFunction(
    loaded.testDeploySaas,
    "rehydrate_post_restore_runtime_overlays",
  );
  requireOrderedFragments(`${files.testDeploySaas} post-restore overlay rehydration`, overlayInstaller, [
    "-f \"$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS\"",
    "-f \"$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS\"",
    "-f \"$DEPLOY_REPO/$PATIENT_COURSE_WALL\"",
    "-f \"$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS\"",
    "-f \"$DEPLOY_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS\"",
    "if [ \"$P2_B_CONTEXT_INSTALLED\" = \"1\" ]; then",
    "-f \"$DEPLOY_REPO/$PATIENT_VAPID_ACCESSOR\"",
  ]);
  const sharedClosure = extractBashFunction(
    loaded.testDeploySaas,
    "run_strict_post_migration_closure",
  );
  requireOrderedFragments(`${files.testDeploySaas} shared strict closure`, sharedClosure, [
    "log \"strict closure: roles + grants\"",
    "install_p0_5b_runtime_wall",
    "install_p2_b_protected_principal_context",
    "rehydrate_post_restore_runtime_overlays",
    "grant_api_runtime_migration_ledger_read",
    "grant_webapp_bootstrap_base_login_d3_4",
    "log \"strict closure: TEST settings override\"",
  ]);
  requireOrderedFragments(`${files.testDeploySaas} D3.4 grant order`, sharedClosure, [
    "install_p0_5b_runtime_wall",
    "install_p2_b_protected_principal_context",
    "rehydrate_post_restore_runtime_overlays",
    "grant_api_runtime_migration_ledger_read",
    "assert_api_runtime_can_read_migration_ledger",
    "grant_webapp_bootstrap_base_login_d3_4",
    "log \"strict closure: TEST settings override\"",
  ]);
  const deployMain = extractDeployMain(loaded.testDeploySaas);
  requireFragments(`${files.testDeploySaas} supported deploy entrypoints`, deployMain, [
    "run_strict_post_migration_closure",
  ]);
  requireFragments(files.hardProtocol, loaded.hardProtocol, [
    "D3.4 bootstrap/base-login grant closure",
    "deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
    "before",
    "service restart or product smoke",
    "not final D3.4 PASS until the owner-authorized locked TEST",
    "smoke reruns",
    "deploy/postgres/organization-member-invites-rls.sql",
    "deploy/postgres/store-p0-entitlements-rls.sql",
    "deploy/postgres/patient-course-assignment-wall.sql",
    "deploy/postgres/specialist-owner-provisioning-rls.sql",
    "deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
    "after any optional P2-B replacement",
  ]);
  assertPackageScript(loaded.packageJson);
}

if (process.argv.includes("--self-test")) {
  const cases = [
    {
      grantSql: read(files.grantSql).replace(
        'GRANT SELECT ON TABLE public.platform_users TO :"d3_4_bootstrap_base_role";',
        "-- removed by self-test",
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.get_public_config_bool(text) TO :"d3_4_bootstrap_base_role";',
        "-- removed public-bootstrap base-login EXECUTE by self-test",
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        'GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_media_worker_runtime_role";',
        "-- removed media-worker cleanup EXECUTE by self-test",
      ),
    },
    {
      grantSql: read(files.grantSql).replace(
        "GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;",
        "-- removed app_staff credential helper EXECUTE by self-test",
      ),
    },
    {
      grantSql: `${read(files.grantSql)}\nGRANT app_staff TO :"d3_4_bootstrap_base_role";\n`,
    },
    {
      grantSql: `${read(files.grantSql)}\nGRANT SELECT ON TABLE public.media_files TO :"d3_4_bootstrap_base_role";\n`,
    },
    {
      grantSql: read(files.grantSql).replaceAll("d3_4_bootstrap_grants_down", "d3_4_missing_down"),
    },
    {
      grantSql: read(files.grantSql).replace(
        "d3_4_bootstrap_base_role_is_patient_member",
        "d3_4_bootstrap_base_role_missing_patient_member_assertion",
      ),
    },
    {
      grantSql: read(files.grantSql).replaceAll(
        "\\if :d3_4_has_p2_b_context_bundle",
        "\\if true",
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        "grant_webapp_bootstrap_base_login_d3_4",
        "grant_webapp_bootstrap_base_login_missing",
      ),
    },
    {
      p05bGrantSql: `${read(files.p05bGrantSql)}\n-- generated drift\n`,
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        "CREATE OR REPLACE FUNCTION app.current_patient_has_password_credentials()",
        "CREATE OR REPLACE FUNCTION app.missing_patient_password_accessor()",
      ),
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        "GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;",
        "GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_patient;",
      ),
    },
    {
      publicBootstrapSql: read(files.publicBootstrapSql).replace(
        "REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_password_credentials_owner_ident;",
        "-- leaked owner helper grant in DOWN self-test",
      ),
    },
    {
      platformAccessRepo: read(files.platformAccessRepo).replace(
        "app.current_patient_has_password_credentials()",
        "EXISTS (SELECT 1 FROM user_password_credentials) AS has_password_credentials",
      ),
    },
    {
      runtimeHelperSmoke: read(files.runtimeHelperSmoke).replace(
        "acl.grantee = 0",
        "acl.grantee = 42",
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
        "D3.4 bootstrap/base-login grant closure",
        "final PASS",
      ),
    },
  ];
  let detected = 0;
  for (const testCase of cases) {
    try {
      runChecks(testCase);
    } catch {
      detected += 1;
    }
  }
  if (detected === cases.length) {
    console.log("check-saas-d3-4-bootstrap-base-login-grants self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect all D3.4 contract regressions");
}

try {
  runChecks();
  console.log("check-saas-d3-4-bootstrap-base-login-grants: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-d3-4-bootstrap-base-login-grants: ${message}`);
  process.exit(1);
}
