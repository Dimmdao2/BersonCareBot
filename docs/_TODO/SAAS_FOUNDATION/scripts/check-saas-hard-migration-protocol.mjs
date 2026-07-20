#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  protocol: 'docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md',
  deployTestFullReset: 'deploy/host/deploy-test-full-reset.sh',
  deployTestSaas: 'deploy/host/deploy-test-saas.sh',
  runtimeOverlayLib: 'deploy/host/runtime-overlay-rehydrate-lib.sh',
  devRuntimeOverlay: 'deploy/host/dev-runtime-overlay-rehydrate.sh',
  refreshDevFromTest: 'deploy/host/refresh-dev-from-test.sh',
  devDatabaseUrlParser: 'deploy/host/parse-dev-database-url.mjs',
  deployTestCodeOnly: 'deploy/host/deploy-test.sh',
  fixtureSeeder: 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts',
  fixturePacket: 'deploy/host/saas-test-fixture-packet.mjs',
  productSmokeFixtureValidator: 'deploy/host/validate-saas-product-smoke-fixture.sh',
  fixtureSeederTest: 'apps/webapp/src/modules/saas-test-fixture/contract.test.ts',
  webappPackageJson: 'apps/webapp/package.json',
  s3Walkthrough: 'docs/_TODO/SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md',
  hostDeployReadme: 'deploy/HOST_DEPLOY_README.md',
  serverConventions: 'docs/ARCHITECTURE/SERVER CONVENTIONS.md',
  testNginxApply: 'deploy/host/apply-test-nginx-webapp.sh',
  testModeSwitch: 'deploy/host/saas-test-mode.sh',
  testModeSwitchChecker: 'docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-mode-switch.mjs',
  b1Checker: 'docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs',
  disposableChecker: 'docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-disposable-dormant-wrapper.mjs',
  disposableWrapper: 'docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs',
  d2Checker: 'docs/_TODO/SAAS_FOUNDATION/scripts/check-d2-fb1-bootstrap-phone-write.mjs',
  integratorMain: 'apps/integrator/src/main.ts',
  integratorMigrate: 'apps/integrator/src/infra/db/migrate.ts',
  integratorStartupTest: 'apps/integrator/src/infra/db/startupMigrationGate.test.ts',
  packageJson: 'package.json',
  tenantLog: 'docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md',
  saasDeploySequence: 'docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md',
};

function usage() {
  return [
    'Usage:',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-hard-migration-protocol.mjs',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-hard-migration-protocol.mjs --self-test',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { selfTest: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }
  return options;
}

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function requireFragments(label, text, fragments) {
  const missing = fragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    fail(`${label} missing required fragment(s):\n- ${missing.join('\n- ')}`);
  }
}

function requirePatterns(label, text, patterns) {
  const missing = patterns
    .filter(({ pattern }) => !pattern.test(text))
    .map(({ description }) => description);
  if (missing.length > 0) {
    fail(`${label} missing required semantic pattern(s):\n- ${missing.join('\n- ')}`);
  }
}

function forbidFragments(label, text, fragments) {
  const present = fragments.filter((fragment) => text.includes(fragment));
  if (present.length > 0) {
    fail(`${label} contains forbidden fragment(s):\n- ${present.join('\n- ')}`);
  }
}

function requireOrderedFragments(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor);
    if (index < 0) {
      fail(`${label} missing ordered fragment after offset ${cursor}: ${fragment}`);
    }
    cursor = index + fragment.length;
  }
}

function load(overrides = {}) {
  return Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );
}

function runChecks(overrides = {}) {
  const loaded = load(overrides);
  const deployMainIndex = loaded.deployTestSaas.indexOf('# 0. preflight');
  if (deployMainIndex < 0) fail(`${files.deployTestSaas} missing main preflight marker`);
  const deployMain = loaded.deployTestSaas.slice(deployMainIndex);

  requireFragments(files.protocol, loaded.protocol, [
    '# SaaS hard migration protocol - fresh dump to TEST rehearsal',
    'Production is read-only for dump acquisition only.',
    '`pg_dump -Fc --no-owner --no-acl`',
    'No production writes, no production migrations, no production',
    'TEST is the rehearsal target.',
    'A plain `pnpm migrate`, or `restore + pnpm migrate`, is not valid proof',
    'No manual DB surgery.',
    'rerun from a fresh restore',
    'The TEST wrapper owns the migration window.',
    '`DB_PRINCIPAL_CONTEXT_MODE=locked`',
    'Runtime restart must not require an owner `DATABASE_URL`',
    'Integrator API startup is not a migration runner in `shadow|locked`.',
    'startup migration gate',
    'skip DDL migrations in `shadow|locked`',
    'migration-state verification against `integrator.schema_migrations`',
    'must prove the ledger exists',
    'contains every discovered integrator migration from the deployed repo',
    'Missing ledger, missing migration rows, connection failures, database permission denial, and table/schema SELECT\n   permission denial are fatal.',
    'protected principal helper surface',
    '`deploy/postgres/p2-b-protected-principal-context.sql`',
    '`DB_PRINCIPAL_SIGNING_SECRET` used by `api.test` and `webapp.test`',
    'runtime login can see and execute `app.release_principal_context()`',
    'repo-managed, narrow runtime grant',
    '`USAGE` on schema `integrator` and `SELECT` on\n   `integrator.schema_migrations`',
    '`api.test` `DATABASE_URL` role',
    'same runtime login can `SELECT` the ledger',
    'entrypoints still call `runMigrations()`',
    'historical TEST-only diagnostic artifact: redacted, default-dry-run and\n   backup-before-rewrite',
    'must not be used to recover a\n   failed strict TEST deployment by switching walls off',
    'Every fresh TEST restore must reconcile the repo-managed S3 A/B walkthrough fixture',
    'Fixture credential values\n    never enter the repository, command arguments, or logs.',
    'separate TEST fixture reconciliation\n   window',
    'Assert TEST runtime mode',
    'read only the `DB_PRINCIPAL_CONTEXT_MODE` key',
    'Missing mode means the application default `legacy-guc`',
    'Both files\nmust explicitly say `locked`',
    'continue to own migrations through the temporary owner-authority window',
    'restart TEST\nunits in locked mode',
    'after deploy has run `pnpm migrate`, API startup skips DDL migrations in `shadow|locked` and strictly\nverifies that `integrator.schema_migrations` contains every discovered integrator migration from the deployed repo.',
    'not required for a locked TEST restart',
    '`saas-test-mode.sh --mode locked` remains fail-fast',
    'Agents must not\nedit `/opt/env` manually',
    'only allowed\nledger grant',
    'repo-managed narrow `deploy-test-saas.sh` grant/check',
    'preflight must be read-only and must run before the `cleanup_exit` trap is installed',
    'must not call `cleanup_elevation`, must not execute `ALTER ROLE`, and must not perform DB\nwrites',
    "TEST deploy proof is the wrapper's migration/restart/health gate",
    'database owner is the expected runtime owner',
    '`public.platform_users` owner is the expected runtime owner',
    'Run doctor/admin data-fix with owner authority',
    'SET ROLE "bersoncarebot_test";',
    'Temporarily elevate only for migration window',
    'fail if that role already has pre-existing owner membership residue',
    "`PGOPTIONS='-c role=bersoncarebot_test'`",
    'Cleanup is not best-effort.',
    'runtime owner has `rolbypassrls=false`',
    'migrator no longer has the temporary runtime-owner membership',
    'install/refresh the protected principal context',
    '`api.test` and `webapp.test` `DB_PRINCIPAL_SIGNING_SECRET` to be present, equal, at least 32 characters',
    'run the fixed `app_staff` / `app_patient` role split SQL',
    '`app_owner` protected\n  helper owner, normalize `pgcrypto` into `app_ext`',
    '`ALTER EXTENSION pgcrypto SET SCHEMA app_ext`',
    '`pgcrypto_app_ext_conflicting_functions`',
    'normalize the existing migration-created `app.is_staff()` owner to `app_owner` immediately before P2-B install',
    'fail before P2-B if it is missing or still owned by another role',
    'Migration 0175 creates/replaces this helper as\n  `CURRENT_USER`',
    'P2-B runs `CREATE OR REPLACE FUNCTION app.is_staff()` under `SET ROLE app_owner`',
    'verify through the `api.test` runtime `DATABASE_URL` that `app.release_principal_context()` exists',
    'infra/bootstrap scheduler paths clear the protected context',
    'discover the integrator runtime role from `api.test` `DATABASE_URL`',
    'grant only `USAGE` on schema `integrator` and `SELECT` on table `integrator.schema_migrations`',
    'SELECT count(*) FROM integrator.schema_migrations',
    'Do not add broad `integrator.*` table grants',
    'P0.5b `app_staff`/`app_patient` DML grants',
    'deploy/postgres/organization-member-invites-rls.sql',
    'deploy/postgres/store-p0-entitlements-rls.sql',
    'deploy/postgres/patient-course-assignment-wall.sql',
    'deploy/postgres/patient-visible-catalog-rls.sql',
    'deploy/postgres/specialist-owner-provisioning-rls.sql',
    'deploy/postgres/runtime-overlay-app-owner-handoff.sql',
    'deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
    'deploy/postgres/saas-isolation-telemetry.sql',
    'after P0.5b/P2-B role/helper setup and reviewed runtime overlays',
    'before the strict base-policy render',
    'Ambient runtime logins receive only the closed event-writer function',
    'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
    'Only the separate operator login inherits the NOLOGIN',
    'after any optional P2-B replacement',
    'P2-B drops and\n  recreates `app.current_org_id()` and `app.current_patient_user_id()`',
    'must not be\n  broadened into P0.5b incidentally',
    'TEST-only override and send-safety',
    'Specialist consolidation',
    'must not run as the raw runtime',
    'same controlled temporary owner-role context',
    'revoke the temporary membership immediately after the consolidation step',
    'Specialist consolidation does not require `BYPASSRLS`',
    'B1, A2, and product smoke gates',
    '`apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts`',
    '`/opt/env/bersoncarebot/saas-test-fixture.env`',
    '`SAAS_TEST_FIXTURE_ENABLED=1`',
    'two synthetic verified email+password owners',
    'reserved non-deliverable `.test` top-level domain',
    'Clinic A three staff accounts',
    'solo Clinic B has one owner/specialist and three patients',
    'active package ledger',
    'Cleanup is limited to reserved fixture personas and manifest IDs',
    'queries `current_database()` before any write and accepts exactly `bersoncarebot_test`',
    'no real PII, message delivery, notification, S3, HTTP, or other external write path',
    'temporarily sets that owner role `BYPASSRLS` only for\n  the seeder command',
    'immediately reuses `cleanup_elevation` to revoke both',
    'fixture reconciliation privilege window is also not runtime',
    'repo-managed TEST nginx apply path before A2',
    '`bash deploy/host/apply-test-nginx-webapp.sh --apply`',
    'default-dry-run unless `--apply`',
    'refuse production-looking\n  paths/upstreams',
    'include `proxy_set_header X-Forwarded-Host $host`',
    '`proxy_set_header X-Forwarded-Proto $scheme` in the webapp `location /`',
    'backup active TEST nginx config',
    'run `nginx -t`, reload nginx only on success',
    'run the A2 checker against `nginx -T`',
    'same controlled temporary owner-role context as specialist consolidation',
    '`--required-current-user=bersoncarebot_test`',
    'B1 must not run as the raw TEST runtime `DATABASE_URL` role.',
    'verify `current_user` before',
    'database URL must remain explicit and unprinted',
    'B1 does not require',
    'Strict/FORCE TEST gate and D2/D3.4 checks',
    'Strict+FORCE is mandatory in both supported TEST deploy paths',
    'Do not claim a TEST deploy passed unless the wrapper has actually run',
    'pnpm run check:saas-hard-migration-protocol',
    'DEV/disposable dormant wrapper',
    '`d3_4_skip_media_worker=1`',
    '`d3_4_skip_bootstrap_role_normalization=1`',
    'without changing the\ncluster-global C0 role',
    'Partial opt-in combinations fail closed.',
    'Mode must be `locked`:',
    'shadow does not `SET ROLE` before installing signed context',
    'run-saas-disposable-dormant-rehearsal.mjs',
    'bcb_saas_dormant_rehearsal_',
    'does not touch TEST services',
    'Full disposable execution is still owner-authorized',
    '--superuser-sudo-postgres',
    'SAAS_DISPOSABLE_SUPERUSER_SUDO_POSTGRES=1',
    'SUPERUSER_SUDO_POSTGRES=1',
    '`env -i`',
    'wrapper owns',
    'treat any non-zero `pg_restore` exit as a failed restore gate',
    'representative row-count assertions are',
    'must not turn a non-zero restore into a pass',
    'pnpm run check:saas-disposable-dormant-wrapper',
    '`bcb_saas_*_scratch_*` or `bcb_saas_*_rehearsal_*`',
    'not restore+migration proof',
  ]);

  requireOrderedFragments(`${files.protocol} allowed sequence`, loaded.protocol, [
    '### 1. Assert TEST runtime mode',
    '### 2. Obtain a fresh dump',
    '### 3. Restore to TEST or a disposable DB',
    '### 4. Assert owner state before data-fix',
    '### 5. Run doctor/admin data-fix with owner authority',
    '### 6. Temporarily elevate only for migration window',
    '### 7. Cleanup and post-cleanup assertions are mandatory',
    '### 8. TEST-only override and send-safety',
    '### 9. Canonical identity, Rubitime history, and FIO normalization',
    '### 10. B1, A2, and product smoke gates',
    '### 11. Strict/FORCE TEST gate and D2/D3.4 checks',
  ]);

  forbidFragments(files.protocol, loaded.protocol, [
    'crontab -l',
    'crontab <',
    'manual ALTER OWNER',
    'manual UPDATE',
    'manual DELETE',
    'manual INSERT',
    'Known gap: DEV/disposable dormant wrapper',
    'There is still no complete repo-tracked DEV/disposable dormant wrapper',
    'Required next artifact before claiming DEV/disposable dormant rehearsal proof',
    'warning-only',
  ]);

  requireFragments(files.deployTestSaas, loaded.deployTestSaas, [
    'Runtime mode is locked-only; strict helper policies + FORCE are mandatory after every migration chain.',
    'this wrapper owns the DDL/backfill migration window via temporary owner authority',
    'TEST services run DB_PRINCIPAL_CONTEXT_MODE=locked after migrations',
    'integrator API startup must not attempt DDL migrations in locked runtime mode',
    'P0_5B_ROLES=deploy/postgres/p0-5b-role-split-staff-patient.sql',
    'P0_5B_GRANTS=deploy/postgres/p0-5b-grants.sql',
    'P2_B_CONTEXT=deploy/postgres/p2-b-protected-principal-context.sql',
    'RUNTIME_OVERLAY_APP_OWNER_HANDOFF=deploy/postgres/runtime-overlay-app-owner-handoff.sql',
    'ORGANIZATION_MEMBER_INVITES_RLS=deploy/postgres/organization-member-invites-rls.sql',
    'STORE_P0_ENTITLEMENTS_RLS=deploy/postgres/store-p0-entitlements-rls.sql',
    'PATIENT_COURSE_WALL=deploy/postgres/patient-course-assignment-wall.sql',
    'PATIENT_VISIBLE_CATALOG_RLS=deploy/postgres/patient-visible-catalog-rls.sql',
    'PUBLIC_BOOTSTRAP_RLS=deploy/postgres/specialist-signup-public-bootstrap-rls.sql',
    'SPECIALIST_OWNER_PROVISIONING_RLS=deploy/postgres/specialist-owner-provisioning-rls.sql',
    'PATIENT_VAPID_ACCESSOR=deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
    'SAAS_ISOLATION_TELEMETRY=deploy/postgres/saas-isolation-telemetry.sql',
    'P2_B_OWNER_ROLE=app_owner',
    'P2_B_STAFF_ROLE=app_staff',
    'P2_B_PATIENT_ROLE=app_patient',
    'read_deploy_env_value',
    'discover_database_role_from_env',
    'discover_api_runtime_role',
    'grant_api_runtime_migration_ledger_read',
    'assert_api_runtime_can_read_migration_ledger',
    'assert_test_runtime_mode_ready',
    'has_signed_runtime_mode',
    'resolve_p2_b_signing_secret',
    'install_p2_b_protected_principal_context',
    'assert_api_runtime_can_release_principal_context',
    'mode="$(read_deploy_env_value "$env_file" DB_PRINCIPAL_CONTEXT_MODE)"',
    'mode="${mode:-legacy-guc}"',
    'must use DB_PRINCIPAL_CONTEXT_MODE=locked for strict TEST',
    'strict TEST runtime',
    'log "TEST runtime mode preflight"\nassert_test_runtime_mode_ready',
    'ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH" "sudo -u postgres pg_dump -Fc --no-owner --no-acl $PROD_DB" > "$DUMP"',
    'sudo -u postgres bash "$RESTORE" "$DUMP"',
    'assert_test_db_owner_ready',
    "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB';",
    "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_users';",
    'run_test_db_owner_sql_file "$DEPLOY_REPO/$DATAFIX"',
    'run_deploy_repo_with_test_db_owner_role',
    'local command_status cleanup_status',
    'if [ -z "${MIGRATOR_ROLE:-}" ]; then',
    "sudo -u deploy bash -lc \"cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \\",
    'node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs',
    '--allow-test-target',
    '--database-url \\"\\$DATABASE_URL\\"',
    "export DB_PRINCIPAL_CONTEXT_MODE=legacy-guc PGOPTIONS='-c role=$DBROLE' && \\\n    $deploy_command",
    'command_status=$?',
    'cleanup_status=$?',
    '[ "$cleanup_status" -eq 0 ] || return "$cleanup_status"',
    'MIGRATOR_ROLE="$(discover_webapp_migrator_role)"',
    'grant_migrator_owner_membership "$MIGRATOR_ROLE"',
    'ALTER ROLE $DBROLE BYPASSRLS',
    "export PGOPTIONS='-c role=$DBROLE'",
    'cleanup_elevation',
    'log "grant + verify integrator migration ledger runtime read"',
    'GRANT USAGE ON SCHEMA integrator TO "$role_name";',
    'GRANT SELECT ON TABLE integrator.schema_migrations TO "$role_name";',
    'SELECT count(*) FROM integrator.schema_migrations;',
    'integrator.schema_migrations: OK',
    'DB_PRINCIPAL_SIGNING_SECRET is required in api.test and webapp.test for shadow/locked runtime',
    'api.test and webapp.test DB_PRINCIPAL_SIGNING_SECRET values differ',
    'DB_PRINCIPAL_SIGNING_SECRET must be at least 32 characters',
    'DB_PRINCIPAL_SIGNING_SECRET must not contain whitespace or backslashes',
    'sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$P0_5B_ROLES"',
    'sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$P0_5B_GRANTS"',
    'CREATE ROLE %I NOLOGIN BYPASSRLS',
    'CREATE EXTENSION pgcrypto WITH SCHEMA app_ext',
    'pgcrypto_app_ext_conflicting_functions',
    'ALTER EXTENSION pgcrypto SET SCHEMA app_ext',
    'pgcrypto_must_be_installed_in_app_ext',
    'GRANT USAGE ON SCHEMA app_ext TO :"p2_b_owner_role";',
    'p2_b_app_is_staff_missing_before_install',
    'ALTER FUNCTION app.is_staff() OWNER TO %I',
    'p2_b_app_is_staff_owner_not_normalized',
    'sudo -u deploy cat "$DEPLOY_REPO/$P2_B_CONTEXT"',
    'rehydrate_post_restore_runtime_overlays',
    'install_saas_isolation_telemetry_overlay',
    'webapp_runtime_role="$(discover_webapp_bootstrap_base_role)"',
    'api_runtime_role="$(discover_api_runtime_role)"',
    'operator_runtime_role="$(discover_saas_isolation_operator_role)"',
    '-v telemetry_webapp_runtime_role="$webapp_runtime_role"',
    '-v telemetry_api_runtime_role="$api_runtime_role"',
    '-v telemetry_operator_runtime_role="$operator_runtime_role"',
    'RUNTIME_OVERLAY_LIB="$DEPLOY_TEST_SAAS_SCRIPT_DIR/runtime-overlay-rehydrate-lib.sh"',
    'source "$RUNTIME_OVERLAY_LIB"',
    'runtime_overlay_apply_post_migration_chain',
    "has_function_privilege(current_user, 'app.release_principal_context()', 'EXECUTE')",
    'app.release_principal_context: OK',
    'trap cleanup_exit EXIT',
    "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$DBROLE';",
    "SELECT pg_has_role('$MIGRATOR_ROLE', '$DBROLE', 'member');",
    'sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$OVERRIDE"',
    'rubitime:db-cleanup:one-pass',
    '--commit-cleanup --allow-test-target',
    'fio:owner-reviewed-test:apply',
    '--confirm-review-source-sha256',
    'run_deploy_repo_with_test_db_owner_role \\\n    "node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs',
    "--required-current-user='$DBROLE'",
    'run_b1_doctor_admin_identity_assertion',
    'assert_test_units_active',
    'systemctl is-active --quiet "$unit"',
    'OK (active)',
    'assert_test_health_ok',
    'curl -fsk --max-time 10 https://test.bersoncare.ru/api/health',
    '[[ "$health_response" == *\'"ok":true\'* ]]',
    '[[ "$health_response" == *\'"db":"up"\'* ]]',
    'apply_test_nginx_webapp_config',
    'bash deploy/host/apply-test-nginx-webapp.sh --apply',
    'run_a2_nginx_preflight',
    'run_locked_product_smoke',
    'assert_awg_relay_active',
    'systemctl is-active --quiet awg-quick@awg0',
    'assert_test_units_active',
    'assert_test_health_ok',
    'assert_awg_relay_active',
    'DONE — full data-ready TEST migration (Rubitime history + reviewed FIO + locked runtime verified)',
  ]);

  requireOrderedFragments(`${files.runtimeOverlayLib} canonical overlay sequence`, loaded.runtimeOverlayLib, [
    'deploy/postgres/organization-member-invites-rls.sql',
    'deploy/postgres/store-p0-entitlements-rls.sql',
    'deploy/postgres/patient-course-assignment-wall.sql',
    'deploy/postgres/specialist-signup-public-bootstrap-rls.sql',
    'deploy/postgres/specialist-owner-provisioning-rls.sql',
    'deploy/postgres/runtime-overlay-app-owner-handoff.sql',
    'deploy/postgres/reference-catalog-rls.sql',
    'deploy/postgres/patient-visible-catalog-rls.sql',
    'deploy/postgres/patient-web-push-vapid-public-key-accessor.sql',
    'deploy/postgres/public-booking-bootstrap-resolver.sql',
    'deploy/postgres/public-clinic-slug-bootstrap-resolver.sql',
    'deploy/postgres/e1-webapp-runtime-config.sql',
  ]);

  requireFragments(files.devRuntimeOverlay, loaded.devRuntimeOverlay, [
    'TARGET_OWNER_ROLE="bcb_webapp_dev_user"',
    'TARGET_RUNTIME_ROLE="bcb_dev_runtime_nonstaff_login"',
    '"$NODE_BIN" "$DEV_ENV_PARSER" --snapshot-stream "$DEV_ENV"',
    '{ set +x; } 2>/dev/null',
    'cat <&"$DEV_SNAPSHOT_READ_FD"',
    '\\copy pg_temp.dev_p2_b_secret_input(secret) FROM STDIN',
    'runtime_overlay_assert_separate_roles "DEV" "$owner_role" "$runtime_role"',
    "member_role.rolname IN ('app_owner', 'app_staff', 'app_patient')",
    'dev_base_runtime_role_safe_before_overlay',
    'PHASE4_LOCKED_POLICIES="$REPO_ROOT/deploy/postgres/phase4-locked-helper-rls-policies.sql"',
    '-v phase4_enforce_locked_context=1',
    '-f "$PHASE4_LOCKED_POLICIES"',
    'NOT rolcreatedb',
    'NOT rolcreaterole',
    'NOT rolreplication',
    "NOT pg_has_role(:'expected_runtime_role', 'app_owner', 'MEMBER')",
    "pg_has_role(:'expected_runtime_role', relation.relowner, 'MEMBER')",
    "aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner)))",
    "aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner)))",
    'runtime_overlay_apply_post_migration_chain "$REPO_ROOT" "$TARGET_DB" "$TARGET_RUNTIME_ROLE" 1',
    'd3_4_bootstrap_base_role=$TARGET_RUNTIME_ROLE',
    'd3_4_skip_media_worker=1',
    'd3_4_skip_bootstrap_role_normalization=1',
    'SELECT app.release_principal_context();',
    'DEV C0 dual-pool runtime requires locked principal-context mode',
  ]);
  requireOrderedFragments(`${files.devRuntimeOverlay} strict base before specialized overlays`, loaded.devRuntimeOverlay, [
    'runtime_overlay_admin_psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 -f "$P0_5B_GRANTS"',
    '-v phase4_enforce_locked_context=1',
    '-f "$PHASE4_LOCKED_POLICIES"',
    'runtime_overlay_apply_post_migration_chain "$REPO_ROOT" "$TARGET_DB" "$TARGET_RUNTIME_ROLE" 1',
  ]);
  requireOrderedFragments(`${files.refreshDevFromTest} preflight before destructive refresh`, loaded.refreshDevFromTest, [
    'bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --preflight',
    'actual_source=',
    'pg_dump -Fc',
    'DROP DATABASE IF EXISTS "$TARGET_DB" WITH (FORCE)',
    'exec pnpm run migrate',
    'bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --execute',
  ]);
  requireFragments(files.devDatabaseUrlParser, loaded.devDatabaseUrlParser, [
    'DATABASE_URL_NONSTAFF',
    'bcb_dev_runtime_nonstaff_login',
    'assertExactLocalDevNonstaffDatabaseUrl',
    'openCanonicalRegularFile',
    '--snapshot-stream',
  ]);

  requireOrderedFragments(
    `${files.deployTestSaas} A2 nginx apply before active preflight`,
    loaded.deployTestSaas,
    [
      'log "A2 nginx forwarded-host preflight"',
      'apply_test_nginx_webapp_config',
      'run_a2_nginx_preflight',
    ],
  );

  requireFragments(files.testNginxApply, loaded.testNginxApply, [
    'apply-test-nginx-webapp.sh',
    'SERVER_NAME="test.bersoncare.ru"',
    'TARGET_AVAILABLE="/etc/nginx/sites-available/test.bersoncare.ru"',
    'TARGET_ENABLED="/etc/nginx/sites-enabled/test.bersoncare.ru"',
    'PROJECT_ROOT="/opt/projects/bersoncarebot-test"',
    'WEBAPP_UPSTREAM="http://127.0.0.1:6300"',
    'INTEGRATOR_UPSTREAM="http://127.0.0.1:3300"',
    'ACTION="dry-run"',
    '--apply',
    'refusing production-looking nginx target or upstream',
    'proxy_set_header X-Forwarded-Host $host;',
    'proxy_set_header X-Forwarded-Proto $scheme;',
    'sudo cp -p -- "$TARGET_AVAILABLE" "$backup"',
    'sudo nginx -t',
    'sudo systemctl reload nginx',
    'check-saas-a2-nginx-forwarded-host.mjs',
    '--nginx-dump',
  ]);

  requireOrderedFragments(
    `${files.deployTestSaas} dormant env preflight before cleanup trap`,
    loaded.deployTestSaas,
    [
      '# 0. preflight (env files are deploy-owned',
      'log "TEST runtime mode preflight"\nassert_test_runtime_mode_ready',
      'trap cleanup_exit EXIT',
      '# 1. fresh test DB = FRESH dump streamed',
    ],
  );
  {
    const preflightIndex = deployMain.indexOf(
      'log "TEST runtime mode preflight"\nassert_test_runtime_mode_ready',
    );
    const firstTrapIndex = deployMain.indexOf('trap cleanup_exit EXIT');
    if (preflightIndex < 0 || firstTrapIndex < 0 || firstTrapIndex < preflightIndex) {
      fail(
        `${files.deployTestSaas} must not install cleanup_exit trap before dormant TEST env preflight`,
      );
    }
  }

  requireFragments(files.b1Checker, loaded.b1Checker, [
    'if (arg.startsWith("--database-url="))',
    'if (arg === "--database-url")',
    'if (arg.startsWith("--required-current-user="))',
    'if (arg === "--required-current-user")',
    'const value = argv[index + 1];',
    'options.databaseUrl = value;',
    'options.requiredCurrentUser = value;',
    'index += 1;',
    '--database-url requires a value',
    '--required-current-user requires a value',
    'TEST target execution requires --required-current-user to pin the owner-role context',
    'assertCurrentUser(databaseUrl, options.requiredCurrentUser);',
    'SELECT current_user;',
    'owner context mismatch',
    'self-test expected --database-url=<url> parsing',
    'self-test expected --database-url <url> parsing',
    'self-test expected wrapper-style test target flag parsing',
    'self-test expected --required-current-user parsing',
    'self-test expected TEST target execution without owner context to fail',
    'assertSafeDatabaseUrl(databaseUrl, { allowTestTarget: options.allowTestTarget });',
  ]);

  forbidFragments(files.deployTestSaas, loaded.deployTestSaas, [
    '|| true',
    '/opt/backups/postgres/hourly/*.dump',
    'ls -t /opt/backups/postgres/hourly',
    'trap revoke_bypass EXIT',
    'psql \\"\\$DATABASE_URL\\" -v ON_ERROR_STOP=1 -f \'$DATAFIX\'',
    "sudo -u deploy bash -lc \"cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \\\n  pnpm --dir apps/webapp run consolidate-specialist-identity",
    "sudo -u deploy bash -lc \"cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \\\n    node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs",
    'for u in "${UNITS[@]}"; do printf "   %-13s %s\\n" "$u:" "$(systemctl is-active "bersoncarebot-$u-test")"; done',
    'echo -n "   health: "; curl -sk --max-time 10 https://test.bersoncare.ru/api/health || true; echo',
    'echo "   awg-quick@awg0 (must stay active): $(systemctl is-active awg-quick@awg0)"',
    'GRANT SELECT ON ALL TABLES IN SCHEMA integrator',
    'GRANT ALL ON SCHEMA integrator',
  ]);

  requireOrderedFragments(
    `${files.deployTestSaas} runtime wall and overlays before restart`,
    deployMain,
    [
      'echo "   drizzle migrations = $CNT (org columns present)"',
      '# 4. test-only settings override',
      'log "B1 doctor/admin identity assertion"',
      'run_strict_post_migration_closure',
    ],
  );

  requireOrderedFragments(
    `${files.deployTestSaas} shared strict post-migration closure`,
    loaded.deployTestSaas,
    [
      'run_strict_post_migration_closure(){',
      'install_p0_5b_runtime_wall',
      'install_p2_b_protected_principal_context',
      'rehydrate_post_restore_runtime_overlays',
      'install_saas_isolation_telemetry_overlay',
      'grant_api_runtime_migration_ledger_read',
      'grant_webapp_bootstrap_base_login_d3_4',
      'apply_test_strict_rls_finalizer',
      'run_deploy_repo_with_test_db_owner_bypass',
      'assert_cleanup_elevation',
      'assert_test_units_active',
      'assert_test_health_ok',
      'run_locked_product_smoke',
      'assert_awg_relay_active',
      'SERVICES_RELEASED=1',
    ],
  );

  requireFragments(files.integratorMain, loaded.integratorMain, [
    'runStartupMigrationGate',
    'await runStartupMigrationGate();',
  ]);

  requireFragments(files.integratorMigrate, loaded.integratorMigrate, [
    "export type StartupMigrationMode = 'run-ddl-migrations' | 'verify-ledger-only';",
    'resolveStartupMigrationMode',
    "normalized === 'locked' || normalized === 'shadow'",
    'verifyMigrationLedgerExists',
    'SELECT to_regclass($1) AS ledger_regclass',
    'is missing; run integrator migrations before starting shadow/locked runtime',
    'verifyStartupMigrationState',
    'migrations.filter((migration) => !applied.has(migration.version))',
    'Run deploy migrations before starting shadow/locked runtime.',
    'runStartupMigrationGateWithDeps',
    'runStartupMigrationGate',
    "startupMode === 'run-ddl-migrations'",
    'await (deps.runMigrationsFn ?? runMigrations)();',
    'Integrator startup skipped DDL migrations in locked runtime topology; migration state is verified',
  ]);

  requireFragments(files.integratorStartupTest, loaded.integratorStartupTest, [
    'resolveStartupMigrationMode(undefined)',
    "resolveStartupMigrationMode('legacy-guc')",
    "resolveStartupMigrationMode('shadow')",
    "resolveStartupMigrationMode('locked')",
    'runStartupMigrationGateWithDeps',
    'locked mode passes when all discovered migrations are applied',
    'locked mode fails when the integrator migration ledger is missing',
    'locked mode fails when any discovered migration is not applied',
    'locked mode treats ledger SELECT permission denied as fatal',
    'legacy startup calls runMigrations',
  ]);

  requireFragments(files.testModeSwitch, loaded.testModeSwitch, [
    'TEST-only SaaS runtime mode preflight/switch helper',
    'API_ENV="/opt/env/bersoncarebot/api.test"',
    'WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"',
    'ACTION="dry-run"',
    '--check',
    '--mode dormant',
    '--apply',
    '--restart',
    'assert_test_only_paths',
    'render_redacted_report',
    'assert_dormant_topology',
    'DATABASE_URL is not the known dormant TEST owner topology',
    'DB_PRINCIPAL_CONTEXT_MODE=legacy-guc',
    'locked mode is not implemented by this TEST env rollback helper',
    'cp -p -- "$file" "$backup"',
    'mktemp "${file}.tmp.XXXXXX"',
    'mv -f -- "$tmp" "$file"',
    'secret values redacted',
    'sudo systemctl restart "bersoncarebot-$unit-test"',
  ]);

  requireFragments(files.testModeSwitchChecker, loaded.testModeSwitchChecker, [
    'check-saas-test-mode-switch',
    'saas-test-mode.sh',
    'TEST-only paths',
    'check:saas-hard-migration-protocol must include check:saas-test-mode-switch',
  ]);

  requireFragments(files.deployTestSaas, loaded.deployTestSaas, [
    'direct destructive invocation is disabled; use deploy/host/deploy-test-full-reset.sh',
    '[ "${BCB_TEST_FULL_RESET_ENTRYPOINT:-}" = "deploy-test-full-reset-v1" ]',
  ]);

  requireFragments(files.deployTestFullReset, loaded.deployTestFullReset, [
    'Explicit owner-gated entrypoint for the destructive TEST migration rehearsal.',
    '--confirm-full-reset',
    'case " ${*:-} " in\n  *" --confirm-full-reset "*) ;;',
    'For ordinary code deploys use: bash deploy/host/deploy-test.sh [branch]',
    'export BCB_TEST_FULL_RESET_ENTRYPOINT=deploy-test-full-reset-v1',
    'exec bash "$SCRIPT_DIR/deploy-test-saas.sh" "$@"',
  ]);

  requireFragments(files.deployTestCodeOnly, loaded.deployTestCodeOnly, [
    'code-only путь НИКОГДА не восстанавливает и не пересоздаёт TEST-БД',
    'STRICT_CLOSURE=deploy/host/deploy-test-saas.sh',
    'APP_OWNER_ROLE=app_owner',
    'GRANT \\\"$APP_OWNER_ROLE\\\" TO \\\"$DBROLE\\\"',
    'REVOKE \\\"$APP_OWNER_ROLE\\\" FROM \\\"$DBROLE\\\"',
    "SELECT pg_has_role('$DBROLE', '$APP_OWNER_ROLE', 'member');",
    'bash "$DEPLOY_REPO/$STRICT_CLOSURE" --strict-preflight',
    'bash "$DEPLOY_REPO/$STRICT_CLOSURE" --post-migration-closure',
  ]);
  forbidFragments(files.deployTestCodeOnly, loaded.deployTestCodeOnly, [
    'deploy-test-full-reset.sh',
    'BCB_TEST_FULL_RESET_ENTRYPOINT',
    '--confirm-full-reset',
    'restore-test-db.sh',
    'pg_dump',
    'pg_restore',
  ]);

  requireFragments(files.d2Checker, loaded.d2Checker, [
    'assertCleanupIsNotBestEffort',
    'assertPreExistingMigratorMembershipFails',
    'trap cleanup_exit EXIT',
    'run_test_db_owner_sql_file',
    "export PGOPTIONS='-c role=$DBROLE'",
  ]);

  requireFragments(files.deployTestSaas, loaded.deployTestSaas, [
    'SAAS_TEST_FIXTURE_ENV=/opt/env/bersoncarebot/saas-test-fixture.env',
    'assert_saas_test_fixture_packet_ready',
    'saas-test-fixture-packet.mjs',
    'SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1',
    'node --input-type=module - "$SAAS_TEST_FIXTURE_ENV" < "$validator"',
    'run_deploy_repo_with_test_db_owner_bypass \\',
    "export SAAS_TEST_FIXTURE_ENV_FILE='$SAAS_TEST_FIXTURE_ENV' && pnpm --dir apps/webapp run seed:saas-test-walkthrough",
    'run_deploy_repo_with_test_db_owner_bypass(){',
    'ALTER ROLE \\"$DBROLE\\" BYPASSRLS;',
    'unset DATABASE_URL_STAFF DATABASE_URL_NONSTAFF DATABASE_URL_WEB_PUSH_REMINDER',
    'export DB_PRINCIPAL_CONTEXT_MODE=legacy-guc PGOPTIONS=',
    'LOCKED_SMOKE_FIXTURE_VALIDATOR=deploy/host/validate-saas-product-smoke-fixture.sh',
    'bash "$validator" --validate "$fixture_path" "$SRC_REPO" "$DEPLOY_REPO"',
    'sudo -u deploy test -r "$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL"',
    'sudo install -d -o deploy -g deploy -m 0700 "$smoke_dir"',
    'sudo -u deploy node "$DEPLOY_REPO/docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs"',
    'stage_hash_bound_rubitime_csv',
    'assert_staged_rubitime_csv_ready',
    'root:deploy:440',
    "run_deploy_repo_with_test_db_owner_role \\\n  \"pnpm run rubitime:db-cleanup:one-pass",
  ]);
  forbidFragments(files.deployTestSaas, loaded.deployTestSaas, [
    ". '$SAAS_TEST_FIXTURE_ENV'",
    'source "$SAAS_TEST_FIXTURE_ENV"',
  ]);
  requireOrderedFragments(files.deployTestSaas, deployMain, [
    'assert_test_runtime_mode_ready',
    'assert_saas_test_fixture_packet_ready',
    'assert_locked_product_smoke_fixture_ready',
    'trap cleanup_exit EXIT',
    'log "test settings override"',
    'log "canonical Rubitime/history cleanup-import chain"',
    'log "owner-reviewed FIO manifest apply"',
    'log "B1 doctor/admin identity assertion"',
    'run_strict_post_migration_closure',
  ]);
  const lockedSmokeHelper = loaded.deployTestSaas.slice(
    loaded.deployTestSaas.indexOf('run_locked_product_smoke(){'),
    loaded.deployTestSaas.indexOf('assert_awg_relay_active(){'),
  );
  requireOrderedFragments(
    `${files.deployTestSaas} locked smoke consumption revalidation`,
    lockedSmokeHelper,
    [
      'assert_locked_product_smoke_fixture_ready',
      'fixture_path="$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL"',
      'sudo -u deploy node "$DEPLOY_REPO/docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs"',
      '--fixture-file="$fixture_path"',
    ],
  );
  requireFragments(files.productSmokeFixtureValidator, loaded.productSmokeFixtureValidator, [
    'canonical_fixture="$(realpath -e -- "$fixture_path")"',
    '[ "$fixture_path" = "$canonical_fixture" ]',
    '"$canonical_source"|"$canonical_source"/*|"$canonical_deploy"|"$canonical_deploy"/*)',
    "stat -Lc '%u:%g:%a'",
    '[ "$metadata" = "$expected_uid:$expected_gid:$expected_mode" ]',
    'validate_fixture "$2" "$3" "$4" 0 "$deploy_gid" 640',
  ]);
  const fixtureBypassHelper = loaded.deployTestSaas.slice(
    loaded.deployTestSaas.indexOf('run_deploy_repo_with_test_db_owner_bypass(){'),
    loaded.deployTestSaas.indexOf('run_a2_nginx_preflight(){'),
  );
  requireOrderedFragments(`${files.deployTestSaas} fixture BYPASS cleanup`, fixtureBypassHelper, [
    'grant_migrator_owner_membership',
    'ALTER ROLE \\"$DBROLE\\" BYPASSRLS;',
    'set +e',
    '$deploy_command',
    'command_status=$?',
    'cleanup_elevation',
    'cleanup_status=$?',
    'set -e',
    '[ "$cleanup_status" -eq 0 ] || return "$cleanup_status"',
    'return "$command_status"',
  ]);

  requireFragments(files.fixtureSeeder, loaded.fixtureSeeder, [
    "const REQUIRED_DATABASE = 'bersoncarebot_test'",
    "const PACKET_PATH_ENV = 'SAAS_TEST_FIXTURE_ENV_FILE'",
    'readSaasTestFixturePacket',
    'resolveDeployGroupId',
    "import { Pool } from 'pg'",
    "import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'",
    "const databaseUrl = env.DATABASE_URL?.trim() ?? ''",
    "if (!databaseUrl) throw new Error('fixture_database_url_required')",
    'const pool = new Pool({',
    'await assertFixtureDatabaseTarget(',
    "const REHEARSAL_MODE_ENV = 'SAAS_TEST_FIXTURE_REHEARSAL_MODE'",
    "const REHEARSAL_DATABASE_ENV = 'SAAS_TEST_FIXTURE_REHEARSAL_DATABASE'",
    "const REHEARSAL_DATABASE_PATTERN = /^bcb_saas_[a-z0-9_]+_rehearsal_[a-z0-9_]+$/",
    "throw new Error('refusing_fixture_rehearsal_target')",
    "hostname === 'localhost'",
    "hostname === '127.0.0.1'",
    "hostname === '::1'",
    'await reconcileFixtures(db, config)',
    'await pool.end()',
    'SAAS_TEST_FIXTURE_CLINIC_A_EMAIL',
    'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
    'SAAS_TEST_FIXTURE_CLINIC_B_EMAIL',
    'SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD',
    'SELECT current_database()::text AS database_name',
    'REQUIRED_DATABASE',
    "if (!normalized.endsWith('.test'))",
    'await db.transaction(async (tx) =>',
    'await argon2.verify(existingHash, password)',
    'argon2.hash(password, { type: argon2.argon2id })',
    'emailVerifiedAt: email ? nowIso : null',
    "membershipRole: 'owner'",
    "status: 'active'",
    'SAAS_TEST_FIXTURE_MANIFEST',
    "namespace: 'saas_test_walkthrough'",
    'version: 2',
    'schema.patientDiaryDaySnapshots',
    'schema.bePatientPackages',
    'schema.bePackageUsages',
    'schema.treatmentProgramInstances',
    'schema.programActionLog',
    'schema.treatmentProgramEvents',
    'schema.lfkExercises',
    'schema.beSpecialistServiceAvailability',
    'schema.beServiceLocationAvailability',
    'schema.beWorkingHours',
    'schema.beExternalEntityMappings',
    'legacy_branch_service_id',
    "assertCount('public_booking_mappings'",
    'schema.mediaFiles',
    's3Key: null',
    "localMediaPath: '/test-fixtures/saas-exercise.svg'",
    "assertCount('local_media'",
    "providerId: 'fixture_noop'",
    'schema.userNotificationTopics',
    'isEnabled: false',
    'schema.messageLog',
    'fixture_delivery_disabled',
    'global-admin@saas-fixture.test',
    "assertCount('global_admin'",
    "assertCount('noop_payments'",
    "assertCount('tariff'",
    "assertCount('safe_products'",
    "assertCount('captured_payments'",
    "assertCount('active_purchases'",
    "assertCount('disabled_notifications'",
    "assertCount('send_safe_messages'",
    "assertCount('fixture_outbox_jobs'",
    'sharedPatient',
    'eq(schema.patientDiaryDaySnapshots.planInstanceId, ids.programInstances[0])',
    'fixture_diary_manual_collision',
    'fixture_package_display_number_collision',
    'inArray(schema.beAppointments.id, [...ids.appointmentsA, ...ids.appointmentsB])',
    'inArray(schema.orgEnrollments.id, [...ids.enrollmentsA, ...ids.enrollmentsB])',
    'buildSaasTestFixturePlan',
    "status: 'completed'",
    "status: 'confirmed'",
    "assertCount('staff'",
    "assertCount('patients'",
    "assertCount('appointments'",
    "assertCount('program_actions'",
    'manifest v2; Clinic A staff=3 patients=5; Clinic B staff=1 patients=3',
    "writeError('[saas-test-fixture] FAILED\\n')",
  ]);
  requirePatterns(files.fixtureSeeder, loaded.fixtureSeeder, [
    {
      description:
        'assertCount(public_booking_schedulable_contexts, bookingProof.rows[0].schedulable_count ?? 0, 2)',
      pattern:
        /assertCount\s*\(\s*['"]public_booking_schedulable_contexts['"]\s*,\s*bookingProof\.rows\[0\]\?\.schedulable_count\s*\?\?\s*0\s*,\s*2\s*,?\s*\)/s,
    },
  ]);
  forbidFragments(files.fixtureSeeder, loaded.fixtureSeeder, [
    'fetch(',
    'axios',
    'console.log(config',
    'console.log(owner',
    'console.log(process.env',
    'error.message',
    'String(error)',
    'getDrizzle',
  ]);

  requireFragments(files.fixturePacket, loaded.fixturePacket, [
    'lstatSync',
    'SAAS_TEST_FIXTURE_PACKET_KEYS.length',
    'const ALLOWED_KEYS = new Set',
    'UNSAFE_VALUE_PATTERN',
    'if (UNSAFE_VALUE_PATTERN.test(encodedValue)) fail("unsafe_value")',
    'if (UNSAFE_VALUE_PATTERN.test(value)) fail("unsafe_value")',
    'metadata.isSymbolicLink()',
    'metadata.isFile()',
    'metadata.uid !== expectedOwnerId',
    'metadata.gid !== expectedGroupId',
    '(metadata.mode & 0o777) !== 0o640',
    'if (!ALLOWED_KEYS.has(key)) fail("unknown_key")',
    'if (seen.has(key)) fail("duplicate_key")',
    'JSON.parse(encodedValue)',
    'resolveDeployGroupId',
    'candidate.startsWith("deploy:")',
    'SaaS TEST fixture packet: INVALID',
  ]);
  forbidFragments(files.fixturePacket, loaded.fixturePacket, [
    'DATABASE_URL"',
    'PGOPTIONS"',
    'node:child_process',
  ]);
  requireFragments(files.fixtureSeederTest, loaded.fixtureSeederTest, [
    'accepts exactly the five data-only JSON-quoted keys',
    'symlink_forbidden',
    'owner_must_be_root',
    'group_must_be_deploy',
    'mode_must_be_0640',
    'unknown DATABASE_URL',
    'unknown PGOPTIONS',
    'duplicate_key',
    'command substitution',
    'SENTINEL_SECRET',
    "toBe('[saas-test-fixture] FAILED\\n')",
    'builds the manifest-v2 multi-staff and solo-clinic product fixture',
    'clinicAStaff: 3',
    'clinicBStaff: 1',
    'toHaveLength(8)',
    'toHaveLength(16)',
    'toHaveLength(18)',
    'toHaveLength(21)',
    'anchors representative past and future appointments',
    'attributes rolling diary cleanup only to reserved program roots',
    'publishes deterministic legacy booking mappings and the committed local media contract',
  ]);
  requireFragments(files.s3Walkthrough, loaded.s3Walkthrough, [
    '/opt/env/bersoncarebot/saas-test-fixture.env',
    'Clinic A —\n  управляющий и два специалиста, пять пациентов',
    'Clinic B — соло-специалист и три пациента',
  ]);
  requireFragments(files.hostDeployReadme, loaded.hostDeployReadme, [
    '`deploy-test.sh` — **code-only/no-fresh-restore**',
    'deploy-test-full-reset.sh',
    '--confirm-full-reset',
    '--fio-manifest-file-sha256',
    'install -o root -g deploy -m 0640 /dev/null /opt/env/bersoncarebot/saas-test-fixture.env',
    'SAAS_TEST_FIXTURE_ENABLED="1"',
    'обычным файлом `root:deploy 0640`',
    'ручной/plain restore **не поддерживается и запрещён**',
  ]);
  requireFragments(files.serverConventions, loaded.serverConventions, [
    'code-only/no-fresh-restore',
    'deploy-test-full-reset.sh',
    'Любой fresh prod-dump restore поддерживается **только** через',
    'exact `root:deploy 0640`',
    'файл никогда не shell-source-ится',
  ]);

  requireFragments(files.disposableWrapper, loaded.disposableWrapper, [
    'scripts/deploy-saas-667.sh',
    'safeDbNamePattern',
    'unsafeNameTokenPattern',
    'bcb_saas_dormant_rehearsal_',
    'validateDumpIfPresent',
    'superuserSudoEnv',
    '--superuser-sudo-postgres',
    'deploySuperuserSudoEnv',
    'pg_restore',
    '"--list"',
    '"--no-owner"',
    '"--no-acl"',
    '"--no-comments"',
    'assertCleanup',
    'rolbypassrls::text',
    'pg_has_role',
    'self-test expected pg_restore to fail closed without tolerateFailure',
    'self-test expected pg_restore non-zero to be fatal, not warning-only',
    '--drop-on-success',
    '--dry-run',
    '--self-test',
    'sanitizedChildEnv',
  ]);
  forbidFragments(files.disposableWrapper, loaded.disposableWrapper, [
    'tolerateFailure: true',
    'pg_restore returned non-zero',
    'representative restored row counts passed',
  ]);

  requireFragments(files.disposableChecker, loaded.disposableChecker, [
    'check-saas-disposable-dormant-wrapper',
    'run-saas-disposable-dormant-rehearsal.mjs',
    'env -i',
    'rolbypassrls::text',
    'pg_has_role',
    'bersoncarebot_test',
    'does not touch TEST services',
    '"tolerateFailure: true",',
    '"pg_restore returned non-zero",',
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const script = packageJson.scripts?.['check:saas-hard-migration-protocol'];
  if (
    script !==
    'node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-hard-migration-protocol.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-hard-migration-protocol.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-hard-migration-protocol.mjs --self-test && pnpm run check:public-booking-bootstrap-resolver && pnpm run check:saas-test-strict-finalizer && pnpm run check:saas-test-mode-switch && pnpm run check:saas-disposable-dormant-wrapper'
  ) {
    fail(
      `${files.packageJson} must wire check:saas-hard-migration-protocol to syntax, main check, self-test, public booking resolver, strict finalizer, mode switch, and disposable wrapper gates`,
    );
  }
  const auditScript = packageJson.scripts?.audit;
  if (
    auditScript !==
    'node scripts/check-saas-db-regression.mjs && pnpm run check:saas-hard-migration-protocol && pnpm run check:saas-isolation-diagnostics && pnpm run check:saas-product-smoke-contract && node scripts/registry-prod-audit.mjs'
  ) {
    fail(
      `${files.packageJson} audit must run DB regression, hard migration, isolation diagnostics, product-smoke mutation gates, and registry audit`,
    );
  }
  const webappPackageJson = JSON.parse(loaded.webappPackageJson);
  if (
    webappPackageJson.scripts?.['seed:saas-test-walkthrough'] !==
    'tsx scripts/seed-saas-test-walkthrough-fixtures.ts'
  ) {
    fail(
      `${files.webappPackageJson} must wire seed:saas-test-walkthrough to the repo-managed seeder`,
    );
  }

  requireFragments(files.tenantLog, loaded.tenantLog, [
    'Hard migration protocol artifact',
    'check:saas-hard-migration-protocol',
    'No TEST deploy was run',
  ]);

  requireFragments(files.saasDeploySequence, loaded.saasDeploySequence, [
    'Superseded hard protocol',
    'HARD_MIGRATION_PROTOCOL.md',
    'deploy-test-full-reset.sh',
  ]);
}

function runSelfTest() {
  const cases = [
    {
      protocol: read(files.protocol).replace(
        'No manual DB surgery.',
        'Manual DB surgery is allowed.',
      ),
    },
    {
      protocol: read(files.protocol).replace(
        '### 7. Cleanup and post-cleanup assertions are mandatory',
        '### 7. Cleanup is optional',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'trap cleanup_exit EXIT',
        'trap revoke_bypass EXIT',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'log "TEST runtime mode preflight"\nassert_test_runtime_mode_ready',
        'log "TEST runtime mode preflight"\n# missing runtime mode preflight call',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'log "SaaS TEST fixture operator packet preflight"\nassert_saas_test_fixture_packet_ready',
        '# missing fixture packet preflight',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        "export SAAS_TEST_FIXTURE_ENV_FILE='$SAAS_TEST_FIXTURE_ENV' && pnpm --dir apps/webapp run seed:saas-test-walkthrough",
        '# missing walkthrough fixture reconciliation',
      ),
    },
    {
      deployTestSaas: `${read(files.deployTestSaas)}\n. '$SAAS_TEST_FIXTURE_ENV'\n`,
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if (metadata.isSymbolicLink()) fail("symlink_forbidden");',
        '// symlink accepted',
      ),
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if (metadata.uid !== expectedOwnerId) fail("owner_must_be_root");',
        '// arbitrary owner accepted',
      ),
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if (metadata.gid !== expectedGroupId) fail("group_must_be_deploy");',
        '// arbitrary group accepted',
      ),
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if ((metadata.mode & 0o777) !== 0o640) fail("mode_must_be_0640");',
        '// arbitrary mode accepted',
      ),
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if (!ALLOWED_KEYS.has(key)) fail("unknown_key");',
        '// unknown keys accepted',
      ),
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if (seen.has(key)) fail("duplicate_key");',
        '// duplicate keys accepted',
      ),
    },
    {
      fixturePacket: read(files.fixturePacket).replace(
        'if (UNSAFE_VALUE_PATTERN.test(encodedValue)) fail("unsafe_value");',
        '// shell syntax accepted',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'run_deploy_repo_with_test_db_owner_bypass(){',
        'run_deploy_repo_with_test_db_owner_bypass_disabled(){',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replaceAll(
        'unset DATABASE_URL_STAFF DATABASE_URL_NONSTAFF DATABASE_URL_WEB_PUSH_REMINDER',
        '# operational runtime pools were left enabled inside the migration window',
      ),
    },
    {
      fixtureSeeder: read(files.fixtureSeeder).replace(
        "const REQUIRED_DATABASE = 'bersoncarebot_test'",
        "const REQUIRED_DATABASE = 'bersoncarebot'",
      ),
    },
    {
      fixtureSeeder: read(files.fixtureSeeder).replace(
        "'public_booking_schedulable_contexts'",
        "'public_booking_contexts_without_schedulability_proof'",
      ),
    },
    {
      fixtureSeeder: read(files.fixtureSeeder).replace(
        /assertCount\s*\(\s*['"]public_booking_schedulable_contexts['"]\s*,\s*bookingProof\.rows\[0\]\?\.schedulable_count\s*\?\?\s*0\s*,\s*2\s*,?\s*\);?/s,
        '// missing public booking schedulability assertion',
      ),
    },
    {
      deployTestFullReset: read(files.deployTestFullReset).replace(
        'case " ${*:-} " in\n  *" --confirm-full-reset "*) ;;',
        'case " ${*:-} " in\n  *) ;;',
      ),
    },
    {
      deployTestCodeOnly: `${read(files.deployTestCodeOnly)}\nbash deploy/host/deploy-test-full-reset.sh --confirm-full-reset\n`,
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        '# 0. preflight (env files are deploy-owned → check as deploy, not as dev)',
        '# 0. preflight (env files are deploy-owned → check as deploy, not as dev)\ntrap cleanup_exit EXIT',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replaceAll(
        "export PGOPTIONS='-c role=$DBROLE'",
        '# missing role options',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        '  log "grant + verify integrator migration ledger runtime read"\n  grant_api_runtime_migration_ledger_read\n  assert_api_runtime_can_read_migration_ledger',
        '# missing runtime ledger grant and verification',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        '  log "strict closure: reviewed runtime overlays"\n  rehydrate_post_restore_runtime_overlays',
        '# missing post-restore runtime overlay rehydration',
      ),
    },
    {
      devRuntimeOverlay: read(files.devRuntimeOverlay).replace(
        '  -v phase4_enforce_locked_context=1 \\\n  -f "$PHASE4_LOCKED_POLICIES" >/dev/null',
        '  # missing strict locked-helper base-policy application',
      ),
    },
    {
      runtimeOverlayLib: read(files.runtimeOverlayLib).replace(
        '    deploy/postgres/public-booking-bootstrap-resolver.sql\n',
        '',
      ),
    },
    {
      runtimeOverlayLib: read(files.runtimeOverlayLib).replace(
        '    deploy/postgres/public-booking-bootstrap-resolver.sql\n    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql',
        '    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql\n    deploy/postgres/public-booking-bootstrap-resolver.sql',
      ),
    },
    {
      productSmokeFixtureValidator: read(files.productSmokeFixtureValidator).replace(
        '[ "$fixture_path" = "$canonical_fixture" ]',
        'true',
      ),
    },
    {
      productSmokeFixtureValidator: read(files.productSmokeFixtureValidator).replace(
        '[ "$metadata" = "$expected_uid:$expected_gid:$expected_mode" ]',
        'true',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'webapp_runtime_role="$(discover_webapp_bootstrap_base_role)"',
        'webapp_runtime_role="$(discover_webapp_migrator_role)"',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replaceAll(
        'api_runtime_role="$(discover_api_runtime_role)"',
        'api_runtime_role="$(discover_webapp_bootstrap_base_role)"',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'GRANT SELECT ON TABLE integrator.schema_migrations TO "$role_name";',
        'GRANT SELECT ON ALL TABLES IN SCHEMA integrator TO "$role_name";',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'ALTER EXTENSION pgcrypto SET SCHEMA app_ext;',
        '-- missing repo-controlled pgcrypto schema normalization',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'ALTER FUNCTION app.is_staff() OWNER TO %I',
        '-- missing app.is_staff owner normalization before P2-B',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        "run_deploy_repo_with_test_db_owner_role \\\n  \"pnpm run rubitime:db-cleanup:one-pass",
        "sudo -u deploy bash -lc \"cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \\\n  pnpm run rubitime:db-cleanup:one-pass",
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'run_deploy_repo_with_test_db_owner_role \\\n    "node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs',
        "sudo -u deploy bash -lc \"cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \\\n    node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs",
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        "      --required-current-user='$DBROLE' \\\n",
        '',
      ),
    },
    {
      deployTestSaas: `${read(files.deployTestSaas)}\n# regression: curl -sk --max-time 10 https://test.bersoncare.ru/api/health || true\n`,
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'assert_test_units_active',
        'for u in "${UNITS[@]}"; do printf "   %-13s %s\\n" "$u:" "$(systemctl is-active "bersoncarebot-$u-test")"; done',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'assert_awg_relay_active',
        'echo "   awg-quick@awg0 (must stay active): $(systemctl is-active awg-quick@awg0)"',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        '  apply_test_nginx_webapp_config\n  run_a2_nginx_preflight',
        '# missing repo-managed TEST nginx apply\nrun_a2_nginx_preflight',
      ),
    },
    {
      testNginxApply: read(files.testNginxApply).replaceAll('ACTION="dry-run"', 'ACTION="apply"'),
    },
    {
      testNginxApply: read(files.testNginxApply).replaceAll(
        'proxy_set_header X-Forwarded-Host $host;',
        '# missing forwarded host',
      ),
    },
    {
      testNginxApply: read(files.testNginxApply).replaceAll(
        'sudo nginx -t',
        '# missing nginx config test',
      ),
    },
    {
      b1Checker: read(files.b1Checker).replace(
        'if (arg === "--database-url")',
        'if (arg === "--database-url-disabled")',
      ),
    },
    {
      b1Checker: read(files.b1Checker).replace(
        'assertCurrentUser(databaseUrl, options.requiredCurrentUser);',
        '// missing owner-context runtime assertion',
      ),
    },
    {
      d2Checker: read(files.d2Checker).replaceAll(
        'assertCleanupIsNotBestEffort',
        'assertCleanupBestEffort',
      ),
    },
    {
      disposableWrapper: read(files.disposableWrapper).replace(
        '{ label: "pg_restore disposable DB" }',
        '{ label: "pg_restore disposable DB", tolerateFailure: true }',
      ),
    },
    {
      disposableWrapper: read(files.disposableWrapper).replace(
        'self-test expected pg_restore to fail closed without tolerateFailure',
        'self-test no longer checks pg_restore fail-closed behavior',
      ),
    },
    {
      disposableChecker: read(files.disposableChecker).replaceAll('"tolerateFailure: true",', ''),
    },
    {
      packageJson: read(files.packageJson).replace(
        'check:saas-hard-migration-protocol',
        'check:saas-hard-migration-protocol-broken',
      ),
    },
    {
      packageJson: read(files.packageJson).replace(
        'pnpm run check:saas-product-smoke-contract && node scripts/registry-prod-audit.mjs',
        'node scripts/registry-prod-audit.mjs',
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

  if (detected !== cases.length) {
    fail(
      `self-test detected ${detected}/${cases.length} broken cases; undetected case(s): ${undetected.join(', ')}`,
    );
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    console.log('check-saas-hard-migration-protocol self-test: OK');
  } else {
    runChecks();
    console.log('check-saas-hard-migration-protocol: OK');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-hard-migration-protocol: ${message}`);
  process.exit(1);
}
