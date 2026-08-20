#!/usr/bin/env bash
# deploy-test-saas.sh — shared strict TEST closure engine plus the guarded implementation used only by
# deploy-test-full-reset.sh for one clean cycle from zero: fresh prod-copy test DB → deploy branch code →
# apply the one PROD-dump -> current DEV schema migration → restart test units → verify healthy.
# Runtime mode is strict: locked during legacy signed-context operation, port-context during the mTLS
# cutover. Strict helper policies + FORCE are mandatory after every migration chain. Proven sequence;
# see docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md.
#
# Why the plain deploy-test.sh is not enough:
#   - a migration asserts the doctor/admin membership seed → needs p0-data-fix-doctor-admin-split.sql FIRST;
#   - some migrations backfill under already-installed FORCE RLS → need a TEMP BYPASSRLS migrator.
#   - this wrapper owns the DDL/backfill migration window via temporary owner authority.
#     TEST services run DB_PRINCIPAL_CONTEXT_MODE=locked or port-context after migrations:
#     integrator API startup must not attempt DDL migrations in strict runtime mode.
#
# Run as user `dev` (uses sudo for postgres/deploy/systemctl). This is NOT the normal code deploy:
# it deliberately recreates TEST from a clean dump and therefore requires an explicit destructive confirmation
# plus hash-bound FIO inputs. Normal code deploys use deploy/host/deploy-test.sh and never restore TEST.
# Public destructive entrypoint: bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset [branch]
# Protected FIO inputs default to /opt/env/bersoncarebot/protected-inputs/fio-owner-reviewed-test.manifest.json
# and its fio-owner-reviewed-test.sha256 sidecar. Explicit --fio-manifest* arguments override those defaults.
set -euo pipefail

DEPLOY_TEST_SAAS_SCRIPT_DIR="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
RUNTIME_OVERLAY_LIB="$DEPLOY_TEST_SAAS_SCRIPT_DIR/runtime-overlay-rehydrate-lib.sh"
if [[ -L "$RUNTIME_OVERLAY_LIB" || ! -f "$RUNTIME_OVERLAY_LIB" || "$(realpath "$RUNTIME_OVERLAY_LIB")" != "$RUNTIME_OVERLAY_LIB" ]]; then
  echo "FATAL: shared runtime-overlay library path guard failed" >&2
  exit 1
fi
# shellcheck source=deploy/host/runtime-overlay-rehydrate-lib.sh
source "$RUNTIME_OVERLAY_LIB"
MEDIA_CONTROL_CUTOVER_LIB="$DEPLOY_TEST_SAAS_SCRIPT_DIR/media-control-cutover-sequence.sh"
if [[ -L "$MEDIA_CONTROL_CUTOVER_LIB" || ! -f "$MEDIA_CONTROL_CUTOVER_LIB" || "$(realpath "$MEDIA_CONTROL_CUTOVER_LIB")" != "$MEDIA_CONTROL_CUTOVER_LIB" ]]; then
  echo "FATAL: shared media-control cutover library path guard failed" >&2
  exit 1
fi
# shellcheck source=deploy/host/media-control-cutover-sequence.sh
source "$MEDIA_CONTROL_CUTOVER_LIB"

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
PROTECTED_INPUTS_DIR=/opt/env/bersoncarebot/protected-inputs
CANONICAL_FIO_MANIFEST="$PROTECTED_INPUTS_DIR/fio-owner-reviewed-test.manifest.json"
CANONICAL_FIO_HASH_SIDECAR="$PROTECTED_INPUTS_DIR/fio-owner-reviewed-test.sha256"
BRANCH="feat/doctor-ui-rebuild"
CONFIRM_FULL_RESET=0
PREPARE_CUTOVER_SOURCE_ONLY=0
CUTOVER_MODE=commit
FIO_MANIFEST=""
FIO_MANIFEST_FILE_SHA256=""
FIO_MANIFEST_SHA256=""
FIO_REVIEW_SOURCE_SHA256=""
API_ENV=/opt/env/bersoncarebot/api.test
WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
MEDIA_WORKER_ENV=/opt/env/bersoncarebot/media-worker.test
MEDIA_WORKER_TEST_UNIT=deploy/systemd/bersoncarebot-media-worker-test.service
MEDIA_WORKER_TEST_UNIT_ASSERTION=deploy/host/assert-media-worker-test-unit-properties.sh
SAAS_TEST_FIXTURE_ENV=/opt/env/bersoncarebot/saas-test-fixture.env
SAAS_SMOKE_LOGIN_ENV=/opt/env/bersoncarebot/saas-smoke-login.env
SAAS_SMOKE_PASSWORD_CONVERGER=apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs
BUNDLE=/tmp/bcb-test-deploy.bundle
DB=bersoncarebot_test
# Removed by the revision-10 declarative checkpoint. The reset may encounter this role on an old
# cluster, but it must neither create it nor grant it membership/BYPASSRLS.
RETIRED_LEGACY_DBROLE=bersoncarebot_test
RESTORE=deploy/host/restore-test-db-from-dump.sh
OVERRIDE=deploy/postgres/test-settings-override.sql   # repo-tracked (was /tmp); post-migrate partial-index upserts + identity normalization
DATAFIX=deploy/postgres/p0-data-fix-doctor-admin-split.sql
OWNER_IDENTITY_CONSOLIDATION=apps/webapp/scripts/consolidate-owner-identity.sql
LEGACY_APPOINTMENT_CARRY=deploy/postgres/prod-to-target-carry-legacy-appointments.sql
PRE_CUTOVER_DATA_ASSERTIONS=deploy/postgres/pre-cutover-data-stage-assertions.sql
CUTOVER_MIGRATION=deploy/postgres/prod-to-target-cutover.sql
TARGET_LEDGER_ARTIFACT=deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql
C4D_MEDIA_OWNER_ONLINE_INDEX=deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql
P0_5B_ROLES=deploy/postgres/p0-5b-role-split-staff-patient.sql
P0_5B_GRANTS=deploy/postgres/p0-5b-grants.sql
PRIVILEGE_GENERATOR=deploy/postgres/privileges/generate-cli.mjs
PRE_MIGRATION_TARGET_BRIDGE=deploy/postgres/pre-migration-target-bridge.sql
P2_B_CONTEXT=deploy/postgres/p2-b-protected-principal-context.sql
ORGANIZATION_MEMBER_INVITES_RLS=deploy/postgres/organization-member-invites-rls.sql
PATIENT_INVITES_RLS=deploy/postgres/patient-invites-rls.sql
STORE_P0_ENTITLEMENTS_RLS=deploy/postgres/store-p0-entitlements-rls.sql
PATIENT_COURSE_WALL=deploy/postgres/patient-course-assignment-wall.sql
PUBLIC_BOOTSTRAP_RLS=deploy/postgres/specialist-signup-public-bootstrap-rls.sql
SPECIALIST_OWNER_PROVISIONING_RLS=deploy/postgres/specialist-owner-provisioning-rls.sql
REFERENCE_CATALOG_RLS=deploy/postgres/reference-catalog-rls.sql
PATIENT_VISIBLE_CATALOG_RLS=deploy/postgres/patient-visible-catalog-rls.sql
PATIENT_VAPID_ACCESSOR=deploy/postgres/patient-web-push-vapid-public-key-accessor.sql
PUBLIC_BOOKING_BOOTSTRAP_RESOLVER=deploy/postgres/public-booking-bootstrap-resolver.sql
PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER=deploy/postgres/public-clinic-slug-bootstrap-resolver.sql
D3_4_BOOTSTRAP_GRANTS=deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql
TEST_STRICT_RLS_FINALIZER=deploy/postgres/test-strict-rls-finalizer.sql
TEST_PATIENT_IDENTITY_CAPABILITY_GATE=deploy/postgres/test-patient-identity-capability-gate.sql
OWNER_READY_LOCKED_MATRIX=deploy/postgres/test-owner-ready-locked-matrix.sql
SAAS_ISOLATION_TELEMETRY=deploy/postgres/saas-isolation-telemetry.sql
SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES=deploy/postgres/test-saas-isolation-telemetry-fixtures.sql
SAAS_SYSTEM_HEALTH_DIAGNOSTICS=deploy/postgres/saas-system-health-diagnostics.sql
INTEGRATOR_SERVER_RUNTIME_CONFIG=deploy/postgres/integrator-server-runtime-config.sql
INTEGRATOR_LOGIN_PUBLIC_IDENTITY_GRANTS=deploy/postgres/integrator-login-public-identity-grants.sql
E1_WEBAPP_RUNTIME_CONFIG=deploy/postgres/e1-webapp-runtime-config.sql
C4_OPERATIONAL_RUNTIME=deploy/postgres/c4-operational-runtime.sql
C4_OPERATIONAL_PROVISIONER=deploy/host/provision-c4-operational-runtime.sh
C4_OPERATIONAL_READINESS=deploy/host/assert-c4-operational-runtime-ready.sh
C4_MEDIA_CONTROL_CUTOVER=deploy/host/media-control-cutover-sequence.sh
C4_MEDIA_LOGIN_RETIREMENT=deploy/host/retire-media-db-login.sh
C4_OPERATIONAL_PASSWORD_SETTER=deploy/host/set-postgres-role-password.mjs
C4_OPERATIONAL_PASSWORD_SMOKE=deploy/host/smoke-set-postgres-role-password.sh
PORT_CONTEXT_CAPABILITY_SEED=deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql
SAAS_ISOLATION_OPERATOR_PROVISIONER=deploy/host/render-saas-isolation-operator-provisioning.mjs
UNITS=(api worker scheduler webapp media-worker)
P2_B_OWNER_ROLE=app_object_owner
P2_B_STAFF_ROLE=app_staff
P2_B_PATIENT_ROLE=app_patient
P2_B_SIGNING_SECRET_VALUE=""
P2_B_CONTEXT_INSTALLED=0
WRITERS_STOPPED=0
SERVICES_RELEASED=0
LEGACY_ELEVATION_CLEANUP_REQUIRED=1
POSTGRES_CUTOVER_INPUT_DIR=""
POSTGRES_FIO_MANIFEST=""
TEST_SMTP_SNAPSHOT=""
SMTP_SNAPSHOT_VALIDATOR="$DEPLOY_TEST_SAAS_SCRIPT_DIR/validate-smtp-outbound-snapshot.mjs"
# Post-health gate failures collected instead of aborting. See run_closure_gate + CLOSURE_GATE_RED_EXIT.
CLOSURE_GATE_FAILURES=()
# Distinct exit code meaning "gates are red BUT the TEST units are up and healthy". The caller
# (deploy-test.sh) must treat it as a red deploy that is NOT an outage, and must not stop the units.
CLOSURE_GATE_RED_EXIT=3
FIXTURE_VALIDATOR_ROOT="$SRC_REPO"
E1_RUNTIME_COVERAGE_STARTED_AT=""

# ── KNOWN ANCHORS (owner's real, stable prod identities — the whole sequence keys off these; same on prod) ──
#   doctor phone   +79643805480   (p0-data-fix + override: role=doctor, owns yandex email, doctor allowlist)
#   client phone   +79189000782   (p0-data-fix: same-name client, must NOT hold the doctor email)
#   doctor email   dimmdao@yandex.ru   admin email  dimmdao@gmail.com
#   org id         a0000000-0000-4000-8000-000000000001
#   canonical specialist  c9515025-7224-4d9b-86b6-9cb7d26ea503  (the "Дмитрий Берсон" row holding the full
#                         appointment history)
ORG_ID=a0000000-0000-4000-8000-000000000001
CANONICAL_SPECIALIST=c9515025-7224-4d9b-86b6-9cb7d26ea503
# LIVE prod source (adelaide / 135.106.162.170). The local /opt/backups on THIS (test/151.x) box are of a
# DEAD June-28 prod copy — NEVER use them for a real rehearsal. Pull a fresh dump from live prod via ssh.
PROD_SSH=bcb-clone
PROD_DB=bersoncarebot

log(){ echo; echo "== [deploy-test-saas] $* =="; }
# The fresh PROD cluster has neither target seam/capability roles nor three retired identities still
# named by the historical migration chain. Install only NOLOGIN role prerequisites here. Database ACL,
# login shells, credentials and port-context grants remain downstream of the completed schema migration.
install_pre_migration_role_prerequisites(){
  node --experimental-strip-types "$DEPLOY_REPO/$PRIVILEGE_GENERATOR" --shared-role-baseline |
    sudo -u postgres psql -X -1 -d postgres -v ON_ERROR_STOP=1
  node --experimental-strip-types "$DEPLOY_REPO/$PRIVILEGE_GENERATOR" --shared-role-verify |
    sudo -u postgres psql -X -1 -d postgres -v ON_ERROR_STOP=1
}

assert_cleanup_elevation(){
  local bypass_state membership_exists
  bypass_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$RETIRED_LEGACY_DBROLE';")"
  # The port-context cluster zero may already have removed the retired legacy role. Absence is the
  # strongest possible cleanup result: no BYPASSRLS bit or membership can survive on a missing role.
  if [ -z "$bypass_state" ]; then
    return 0
  fi
  [ "$bypass_state" = "false" ] || { echo "FATAL: retired role $RETIRED_LEGACY_DBROLE has BYPASSRLS (rolbypassrls=$bypass_state)" >&2; return 1; }
  # The retired app_owner role must not retain a path through the legacy elevation role.
  if [ "$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_owner');")" = "t" ]; then
    membership_exists="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$RETIRED_LEGACY_DBROLE', 'app_owner', 'member');")"
    [ "$membership_exists" = "f" ] || { echo "FATAL: retired role $RETIRED_LEGACY_DBROLE has membership in retired app_owner" >&2; return 1; }
  fi
}
cleanup_elevation(){
  if [ "$LEGACY_ELEVATION_CLEANUP_REQUIRED" != "1" ]; then
    return 0
  fi
  assert_cleanup_elevation
}
cleanup_postgres_cutover_inputs(){
  if [ -z "${POSTGRES_CUTOVER_INPUT_DIR:-}" ]; then
    return 0
  fi
  case "$POSTGRES_CUTOVER_INPUT_DIR" in
    /tmp/bcb-test-cutover-inputs.*) ;;
    *)
      echo "FATAL: refusing unsafe cutover input cleanup path: $POSTGRES_CUTOVER_INPUT_DIR" >&2
      return 1
      ;;
  esac
  if [ -L "$POSTGRES_CUTOVER_INPUT_DIR" ]; then
    echo "FATAL: refusing symlink cutover input cleanup path: $POSTGRES_CUTOVER_INPUT_DIR" >&2
    return 1
  fi
  if [ -d "$POSTGRES_CUTOVER_INPUT_DIR" ]; then
    sudo -u postgres rm -rf -- "$POSTGRES_CUTOVER_INPUT_DIR" || return 1
  fi
  POSTGRES_CUTOVER_INPUT_DIR=""
  POSTGRES_FIO_MANIFEST=""
}
cleanup_test_smtp_snapshot(){
  if [ -z "${TEST_SMTP_SNAPSHOT:-}" ]; then
    return 0
  fi
  case "$TEST_SMTP_SNAPSHOT" in
    /tmp/bcb-test-smtp-outbound.*.json) ;;
    *)
      echo "FATAL: refusing unsafe TEST SMTP snapshot cleanup path: $TEST_SMTP_SNAPSHOT" >&2
      return 1
      ;;
  esac
  if [ -L "$TEST_SMTP_SNAPSHOT" ]; then
    echo "FATAL: refusing symlink TEST SMTP snapshot cleanup path: $TEST_SMTP_SNAPSHOT" >&2
    return 1
  fi
  if [ -e "$TEST_SMTP_SNAPSHOT" ]; then
    sudo -u postgres rm -f -- "$TEST_SMTP_SNAPSHOT" || return 1
  fi
  TEST_SMTP_SNAPSHOT=""
}
cleanup_exit(){
  local original_status=$?
  local cleanup_status
  set +e
  cleanup_elevation
  cleanup_status=$?
  cleanup_postgres_cutover_inputs || cleanup_status=1
  cleanup_test_smtp_snapshot || cleanup_status=1
  if [ "$original_status" -ne 0 ] && [ "${WRITERS_STOPPED:-0}" = "1" ] && [ "${SERVICES_RELEASED:-0}" != "1" ]; then
    for unit_name in "${UNITS[@]}"; do
      sudo systemctl stop "bersoncarebot-$unit_name-test" >/dev/null 2>&1 || cleanup_status=1
    done
  fi
  if [ "$original_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then
    exit "$cleanup_status"
  fi
  exit "$original_status"
}

snapshot_test_smtp_outbound(){
  local configured has_organization_column smtp_where snapshot_mode system_settings_exists
  system_settings_exists="$(sudo -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -tAc \
    "SELECT to_regclass('public.system_settings') IS NOT NULL;")"
  case "$system_settings_exists" in
    t) ;;
    f)
      # A previous reset can legitimately have restored schema A and then failed before the
      # A→B cutover. There is no TEST SMTP setting to preserve in that state; the reset overlay
      # creates the safe null value after schema migration, so retry from the same named TEST DB
      # must remain possible.
      echo "   TEST SMTP: schema A retry has no prior TEST setting; reset overlay will retain the safe null value"
      return 0
      ;;
    *)
      echo "FATAL: could not determine whether TEST system_settings exists before full reset" >&2
      return 1
      ;;
  esac
  has_organization_column="$(sudo -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -tAc \
    "SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'system_settings'
         AND column_name = 'organization_id'
     );")"
  case "$has_organization_column" in
    t) smtp_where="key = 'smtp_outbound' AND scope = 'admin' AND organization_id IS NULL" ;;
    f) smtp_where="key = 'smtp_outbound' AND scope = 'admin'" ;;
    *)
      echo "FATAL: could not determine TEST system_settings schema before full reset" >&2
      return 1
      ;;
  esac
  configured="$(sudo -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -tAc \
    "SELECT count(*) = 1
       FROM public.system_settings
      WHERE $smtp_where;")"
  [ "$configured" = "t" ] || {
    echo "FATAL: TEST smtp_outbound must have exactly one global admin row before a full reset" >&2
    return 1
  }

  TEST_SMTP_SNAPSHOT="$(sudo -u postgres mktemp /tmp/bcb-test-smtp-outbound.XXXXXX.json)"
  sudo -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -At \
    -o "$TEST_SMTP_SNAPSHOT" \
    -c "SELECT value_json::text FROM public.system_settings WHERE $smtp_where;"
  sudo -u postgres chmod 0600 "$TEST_SMTP_SNAPSHOT"
  snapshot_mode="$(stat -Lc '%U:%G:%a' -- "$TEST_SMTP_SNAPSHOT")"
  [ "$snapshot_mode" = "postgres:postgres:600" ] || {
    echo "FATAL: TEST SMTP snapshot must be postgres:postgres 0600 (got $snapshot_mode)" >&2
    return 1
  }
  sudo -u postgres cat -- "$TEST_SMTP_SNAPSHOT" | node "$SMTP_SNAPSHOT_VALIDATOR" --stdin
  echo "   TEST SMTP: statically valid value snapshotted without printing it"
}

restore_test_smtp_outbound(){
  [ -n "${TEST_SMTP_SNAPSHOT:-}" ] || {
    echo "   TEST SMTP: no prior TEST setting to restore; reset overlay value retained"
    return 0
  }
  sudo -u postgres cat -- "$TEST_SMTP_SNAPSHOT" | node "$SMTP_SNAPSHOT_VALIDATOR" --stdin
  sudo -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 \
    -v smtp_snapshot="$TEST_SMTP_SNAPSHOT" <<'SQL'
BEGIN;
CREATE TEMP TABLE restore_test_smtp_snapshot (value_json jsonb) ON COMMIT DROP;
INSERT INTO restore_test_smtp_snapshot (value_json)
VALUES (pg_catalog.pg_read_file(:'smtp_snapshot')::jsonb);
SELECT 1 / ((count(*) = 1)::int)
FROM restore_test_smtp_snapshot;
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by, organization_id)
SELECT 'smtp_outbound', 'admin', value_json, pg_catalog.now(), NULL, NULL
FROM restore_test_smtp_snapshot
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;
COMMIT;
SQL
  echo "   TEST SMTP: preserved statically valid value restored"
}

validate_pg_identifier(){
  runtime_overlay_validate_pg_identifier "$@"
}

read_deploy_env_value(){
  local env_file="$1"
  local key="$2"
  sudo -u deploy node -e '
const fs = require("node:fs");
const [file, key] = process.argv.slice(1);
for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
  if (!match || match[1] !== key) continue;
  let value = match[2].trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.charCodeAt(0) === 39 && value.charCodeAt(value.length - 1) === 39)
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  process.stdout.write(value);
  process.exit(0);
}
' "$env_file" "$key"
}

read_deploy_env_url_password(){
  local env_file="$1"
  local key="$2"
  local expected_user="$3"
  local expected_database="$4"
  sudo -u deploy node -e '
const fs = require("node:fs");
const [file, key, expectedUser, expectedDatabase] = process.argv.slice(1);
function fail(message) {
  process.stderr.write(`FATAL: ${message}\n`);
  process.exit(1);
}
let found = "";
for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
  if (!match || match[1] !== key) continue;
  let value = match[2].trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.charCodeAt(0) === 39 && value.charCodeAt(value.length - 1) === 39)
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  found = value;
  break;
}
if (!found) fail(`${file} is missing ${key}`);
let url;
try {
  url = new URL(found);
} catch {
  fail(`${file} ${key} must be a PostgreSQL URL`);
}
if (decodeURIComponent(url.username) !== expectedUser) {
  fail(`${file} ${key} username must be ${expectedUser}`);
}
if (decodeURIComponent(url.pathname).replace(/^\//, "") !== expectedDatabase) {
  fail(`${file} ${key} must target ${expectedDatabase}`);
}
if (!url.password) fail(`${file} ${key} must contain a password`);
for (const parameter of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey"]) {
  if (url.searchParams.has(parameter)) fail(`${file} ${key} must not override mTLS through ${parameter}`);
}
process.stdout.write(decodeURIComponent(url.password));
' "$env_file" "$key" "$expected_user" "$expected_database"
}

assert_test_runtime_mode_ready(){
  local label env_file mode
  for spec in "api:$API_ENV" "webapp:$WEBAPP_ENV"; do
    label="${spec%%:*}"
    env_file="${spec#*:}"
    mode="$(read_deploy_env_value "$env_file" DB_PRINCIPAL_CONTEXT_MODE)"
    mode="${mode:-legacy-guc}"
    [[ "$mode" == "locked" || "$mode" == "port-context" ]] || {
      echo "FATAL: $env_file must use DB_PRINCIPAL_CONTEXT_MODE=locked or port-context for strict TEST, got $mode" >&2
      exit 1
    }
    printf "   %-10s DB_PRINCIPAL_CONTEXT_MODE=%s (strict TEST runtime)\n" "$label:" "$mode"
  done
}

bootstrap_test_env_preflight(){
  local repository_root="$1"
  local mode
  mode="$(read_deploy_env_value "$API_ENV" DB_PRINCIPAL_CONTEXT_MODE)"
  case "${mode:-legacy-guc}" in
    port-context)
      sudo node --experimental-strip-types \
        "$repository_root/deploy/host/bootstrap-c4-test-env.mjs" --port-context-check
      ;;
    locked|shadow)
      sudo node --experimental-strip-types \
        "$repository_root/deploy/host/bootstrap-c4-test-env.mjs" --check
      ;;
    *)
      echo "FATAL: unsupported TEST DB_PRINCIPAL_CONTEXT_MODE for bootstrap preflight: ${mode:-missing}" >&2
      return 1
      ;;
  esac
}

assert_saas_test_fixture_packet_ready(){
  local validator="$FIXTURE_VALIDATOR_ROOT/deploy/host/saas-test-fixture-packet.mjs"
  [ -r "$validator" ] || { echo "FATAL: missing TEST fixture packet validator" >&2; exit 1; }
  sudo -u deploy env SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1 \
    node --input-type=module - "$SAAS_TEST_FIXTURE_ENV" < "$validator"
}

assert_test_writers_stopped(){
  local unit_name
  for unit_name in "${UNITS[@]}"; do
    if systemctl is-active --quiet "bersoncarebot-$unit_name-test"; then
      echo "FATAL: bersoncarebot-$unit_name-test is still active inside the strict closure" >&2
      exit 1
    fi
  done
}

has_signed_runtime_mode(){
  local mode
  for env_file in "$API_ENV" "$WEBAPP_ENV"; do
    mode="$(read_deploy_env_value "$env_file" DB_PRINCIPAL_CONTEXT_MODE)"
    mode="${mode:-legacy-guc}"
    case "$mode" in
      shadow|locked) return 0 ;;
    esac
  done
  return 1
}

resolve_p2_b_signing_secret(){
  local api_secret webapp_secret
  P2_B_SIGNING_SECRET_VALUE=""
  api_secret="$(read_deploy_env_value "$API_ENV" DB_PRINCIPAL_SIGNING_SECRET)"
  webapp_secret="$(read_deploy_env_value "$WEBAPP_ENV" DB_PRINCIPAL_SIGNING_SECRET)"

  if [ -z "$api_secret" ] && [ -z "$webapp_secret" ]; then
    if has_signed_runtime_mode; then
      echo "FATAL: DB_PRINCIPAL_SIGNING_SECRET is required in api.test and webapp.test for shadow/locked runtime" >&2
      exit 1
    fi
    return 1
  fi

  [ -n "$api_secret" ] || { echo "FATAL: api.test missing DB_PRINCIPAL_SIGNING_SECRET while webapp.test has one" >&2; exit 1; }
  [ -n "$webapp_secret" ] || { echo "FATAL: webapp.test missing DB_PRINCIPAL_SIGNING_SECRET while api.test has one" >&2; exit 1; }
  [ "$api_secret" = "$webapp_secret" ] || { echo "FATAL: api.test and webapp.test DB_PRINCIPAL_SIGNING_SECRET values differ" >&2; exit 1; }
  [ "${#api_secret}" -ge 32 ] || { echo "FATAL: DB_PRINCIPAL_SIGNING_SECRET must be at least 32 characters" >&2; exit 1; }
  if [[ "$api_secret" =~ [[:space:]\\] ]]; then
    echo "FATAL: DB_PRINCIPAL_SIGNING_SECRET must not contain whitespace or backslashes" >&2
    exit 1
  fi

  P2_B_SIGNING_SECRET_VALUE="$api_secret"
  return 0
}

install_p0_5b_runtime_wall(){
  validate_pg_identifier "P0.5b staff role" "$P2_B_STAFF_ROLE"
  validate_pg_identifier "P0.5b patient role" "$P2_B_PATIENT_ROLE"

  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$P0_5B_ROLES"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$P0_5B_GRANTS"
  echo "   P0.5b runtime wall: OK"
}

install_p2_b_protected_principal_context(){
  P2_B_CONTEXT_INSTALLED=0
  validate_pg_identifier "P2-B owner role" "$P2_B_OWNER_ROLE"
  validate_pg_identifier "P2-B staff role" "$P2_B_STAFF_ROLE"
  validate_pg_identifier "P2-B patient role" "$P2_B_PATIENT_ROLE"

  if ! resolve_p2_b_signing_secret; then
    echo "   P2-B protected principal context: skipped (legacy-guc without signing secret)"
    return 0
  fi

  # pgcrypto-schema move + is_staff/current_*() ownership pre-normalization used to run here
  # inline (CREATE ROLE p2_b_owner_role + ALTER FUNCTION ... OWNER TO). That duplicated what
  # deploy/postgres/p2-b-protected-principal-context.sql itself now does (its own pgcrypto move +
  # DROP/SET ROLE/CREATE needs no pre-existing ownership), and app_object_owner is created by the
  # declarative shared-role-baseline (install_pre_migration_role_prerequisites), not by this wrapper.
  # Removed 2026-08-20 (restore-ab2); see B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md.

  {
    printf '\\set p2_b_owner_role %s\n' "$P2_B_OWNER_ROLE"
    printf '\\set p2_b_staff_role %s\n' "$P2_B_STAFF_ROLE"
    printf '\\set p2_b_patient_role %s\n' "$P2_B_PATIENT_ROLE"
    printf '\\set p2_b_signing_secret %s\n' "$P2_B_SIGNING_SECRET_VALUE"
    sudo -u deploy cat "$DEPLOY_REPO/$P2_B_CONTEXT"
  } | sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1
  P2_B_SIGNING_SECRET_VALUE=""
  P2_B_CONTEXT_INSTALLED=1
}

rehydrate_post_restore_runtime_overlays(){
  local e1_runtime_role
  e1_runtime_role="$(discover_webapp_bootstrap_base_role)"
  validate_pg_identifier "webapp.test E1 runtime role" "$e1_runtime_role"
  runtime_overlay_apply_post_migration_chain \
    "$DEPLOY_REPO" \
    "$DB" \
    "$e1_runtime_role" \
    "$P2_B_CONTEXT_INSTALLED"
  echo "   post-restore runtime overlays: OK"
}

runtime_overlay_admin_psql(){
  sudo -u postgres psql "$@"
}

assert_api_runtime_can_release_principal_context(){
  local ok
  sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT app.release_principal_context();\" >/dev/null"
  ok="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT (to_regnamespace('app') IS NOT NULL AND to_regprocedure('app.release_principal_context()') IS NOT NULL AND has_function_privilege(current_user, 'app.release_principal_context()', 'EXECUTE') AND NOT has_function_privilege(current_user, 'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)', 'EXECUTE') AND NOT has_function_privilege(current_user, 'app.reset_principal_context()', 'EXECUTE') AND NOT has_function_privilege(current_user, 'app.current_org_id()', 'EXECUTE'))::text;\"")"
  [ "$ok" = "true" ] || { echo "FATAL: api.test runtime cannot see/execute app.release_principal_context()" >&2; exit 1; }
  echo "   app.release_principal_context: OK (actual base-login call; install/reset/current remain denied)"
}

assert_media_worker_runtime_can_release_principal_context(){
  sudo -u deploy bash -lc "set -a && . '$MEDIA_WORKER_ENV' && set +a && \\
    [ -n \"\${MEDIA_WORKER_CONTROL_URL:-}\" ] && [ -n \"\${INTERNAL_JOB_SECRET:-}\" ] && \\
    curl --fail --silent --show-error --max-time 10 -H \"Authorization: Bearer \$INTERNAL_JOB_SECRET\" \\
      -H 'content-type: application/json' --data '{\"type\":\"ready\"}' \\
      \"\$MEDIA_WORKER_CONTROL_URL/api/internal/media-worker/control\" | grep -q '\"ok\":true'"
  echo "   media-worker HTTP control ready: OK (no PostgreSQL credential)"
}

assert_webapp_credential_helper_runtime_acl(){
  local staff_has_execute nonstaff_has_execute synthetic_user_id
  synthetic_user_id="00000000-0000-4000-8000-000000000000"
  staff_has_execute="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && [ -n \"\${DATABASE_URL_STAFF:-}\" ] && psql \"\$DATABASE_URL_STAFF\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT has_function_privilege(current_user, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE')::text;\"")"
  nonstaff_has_execute="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && db_url=\"\${DATABASE_URL_NONSTAFF:-\${DATABASE_URL:-}}\" && [ -n \"\$db_url\" ] && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT has_function_privilege(current_user, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE')::text;\"")"
  [ "$staff_has_execute" = "true" ] || { echo "FATAL: webapp staff runtime cannot execute app.staff_user_has_password_credentials(uuid)" >&2; exit 1; }
  [ "$nonstaff_has_execute" = "false" ] || { echo "FATAL: webapp nonstaff runtime unexpectedly can execute app.staff_user_has_password_credentials(uuid)" >&2; exit 1; }

  sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && psql \"\$DATABASE_URL_STAFF\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT app.staff_user_has_password_credentials('$synthetic_user_id');\"" >/dev/null
  if sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && db_url=\"\${DATABASE_URL_NONSTAFF:-\${DATABASE_URL:-}}\" && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT app.staff_user_has_password_credentials('$synthetic_user_id');\"" >/dev/null 2>&1; then
    echo "FATAL: webapp nonstaff runtime credential-helper call was not permission-denied" >&2
    exit 1
  fi
  echo "   staff credential helper ACL: OK (staff success; nonstaff permission denied)"
}

discover_database_role_from_env(){
  local label="$1"
  local env_file="$2"
  local identity
  identity="$(sudo -u deploy bash -lc "set -a && . '$env_file' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  runtime_overlay_parse_database_identity "$label DATABASE_URL" "$DB" "$identity"
}

discover_database_role_from_env_key(){
  local label="$1"
  local env_file="$2"
  local env_key="$3"
  local identity
  identity="$(sudo -u deploy bash -lc "set -a && . '$env_file' && set +a && env_key='$env_key' && db_url=\"\${!env_key:-}\" && [ -n \"\$db_url\" ] && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  runtime_overlay_parse_database_identity "$label $env_key" "$DB" "$identity"
}

discover_webapp_migrator_role(){
  discover_database_role_from_env "webapp.test" "$WEBAPP_ENV"
}

discover_media_worker_runtime_role(){
  printf '%s\n' app_operational_media_worker
}

bootstrap_and_provision_c4_operational_runtime(){
  sudo env \
    PROJECT_ROOT="$DEPLOY_REPO" \
    API_ENV_FILE="$API_ENV" \
    WEBAPP_ENV_FILE="$WEBAPP_ENV" \
    MEDIA_WORKER_ENV_FILE="$MEDIA_WORKER_ENV" \
    bash "$DEPLOY_REPO/$C4_OPERATIONAL_PROVISIONER" --bootstrap-test-env
  echo "   C4 operational bootstrap/provision: OK (three DB contours + media HTTP control)"
}

install_port_context_login_roles(){
  local runtime_mode
  runtime_mode="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && printf '%s' \"\${DB_PRINCIPAL_CONTEXT_MODE:-legacy-guc}\"")"
  if [ "$runtime_mode" != "port-context" ]; then
    echo "   port-context login roles: dormant until DB_PRINCIPAL_CONTEXT_MODE=port-context"
    return
  fi
  node --experimental-strip-types "$DEPLOY_REPO/deploy/postgres/privileges/generate-cli.mjs" \
      --env test --db "$DB" \
    | sudo -u postgres psql -d "$DB" -X -1 -v ON_ERROR_STOP=1 \
        -v BCB_TEST_INTEGRATOR_PASSWORD=bootstrap-not-runtime-integrator \
        -v BCB_TEST_WEBAPP_PATIENT_PASSWORD=bootstrap-not-runtime-patient \
        -v BCB_TEST_WEBAPP_STAFF_PASSWORD=bootstrap-not-runtime-staff \
        -f - >/dev/null

  read_deploy_env_url_password "$API_ENV" INTEGRATOR_DB_URL bcb_test_integrator "$DB" \
    | sudo -u postgres node "$DEPLOY_REPO/$C4_OPERATIONAL_PASSWORD_SETTER" "$DB" bcb_test_integrator >/dev/null
  read_deploy_env_url_password "$WEBAPP_ENV" DATABASE_URL_STAFF bcb_test_webapp_staff "$DB" \
    | sudo -u postgres node "$DEPLOY_REPO/$C4_OPERATIONAL_PASSWORD_SETTER" "$DB" bcb_test_webapp_staff >/dev/null
  read_deploy_env_url_password "$WEBAPP_ENV" DATABASE_URL_PATIENT bcb_test_webapp_patient "$DB" \
    | sudo -u postgres node "$DEPLOY_REPO/$C4_OPERATIONAL_PASSWORD_SETTER" "$DB" bcb_test_webapp_patient >/dev/null
  echo "   port-context login roles: OK (3 declaration-owned logins; passwords from protected env URLs)"
}

install_port_context_capability_catalog(){
  local contract_present runtime_mode count
  contract_present="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc \
    "SELECT to_regclass('app_ext.port_context_capabilities') IS NOT NULL;")"
  runtime_mode="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && printf '%s' \"\${DB_PRINCIPAL_CONTEXT_MODE:-legacy-guc}\"")"
  if [ "$contract_present" != "t" ]; then
    [ "$runtime_mode" != "port-context" ] || {
      echo "FATAL: port-context mode requires app_ext.port_context_capabilities before restart" >&2
      exit 1
    }
    echo "   port-context capability catalog: dormant until contract migration"
    return
  fi
  sudo -u postgres psql -d "$DB" -X -1 -v ON_ERROR_STOP=1 \
    -f "$DEPLOY_REPO/$PORT_CONTEXT_CAPABILITY_SEED" >/dev/null
  count="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc \
    "SELECT count(*) FROM app_ext.port_context_capabilities
      WHERE active_until IS NULL
        AND session_login IN ('bcb_test_webapp_staff','bcb_test_integrator');")"
  [ "$count" = "10" ] || {
    echo "FATAL: expected 10 active declaration-owned TEST port-context capabilities, got $count" >&2
    exit 1
  }
  echo "   port-context capability catalog: OK (10 exact declaration-owned rows)"
}

reapply_c4_operational_runtime_overlays(){
  local diagnostic_role delivery_worker_role scheduler_role
  diagnostic_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_DIAGNOSTIC)"
  delivery_worker_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_DELIVERY_WORKER)"
  scheduler_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_SCHEDULER)"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v c4_diagnostic_login_role="$diagnostic_role" \
    -v c4_delivery_worker_login_role="$delivery_worker_role" \
    -v c4_scheduler_login_role="$scheduler_role" \
    -f "$DEPLOY_REPO/$C4_OPERATIONAL_RUNTIME"
  echo "   C4 operational runtime overlays: OK (three DB contours + media capability)"
}

assert_c4_operational_runtime_ready(){
  local mode="${1:-}"
  local readiness_args=()
  [ -z "$mode" ] || readiness_args+=("$mode")
  sudo -u deploy env \
    API_ENV_FILE="$API_ENV" \
    WEBAPP_ENV_FILE="$WEBAPP_ENV" \
    MEDIA_WORKER_ENV_FILE="$MEDIA_WORKER_ENV" \
    bash "$DEPLOY_REPO/$C4_OPERATIONAL_READINESS" "${readiness_args[@]}"
  if [ "$mode" = "--database-only" ]; then
    echo "   C4 operational DB readiness: OK (media HTTP control deferred until new webapp restart)"
  else
    echo "   C4 operational runtime readiness: OK (three distinct DB URLs + media HTTP control; positive + cross-contour negatives)"
  fi
}

assert_legacy_media_login_retired(){
  local absent
  absent="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -qAtc \
    "SELECT (to_regrole('bcb_test_operational_media_login') IS NULL)::text;")"
  [ "$absent" = "true" ] || {
    echo "FATAL: legacy TEST media DB login survived canonical C4 provisioning" >&2
    exit 1
  }
}

retire_legacy_media_login_after_control(){
  sudo bash "$DEPLOY_REPO/$C4_MEDIA_LOGIN_RETIREMENT" \
    --database "$DB" \
    --role bcb_test_operational_media_login
}

media_cutover_require_new_webapp_running(){
  sudo systemctl is-active --quiet bersoncarebot-webapp-test
}

media_cutover_require_authenticated_control(){
  assert_c4_operational_runtime_ready
}

media_cutover_require_legacy_login_retired(){
  retire_legacy_media_login_after_control
  assert_legacy_media_login_retired
}

media_cutover_restart_worker(){
  sudo systemctl restart bersoncarebot-media-worker-test
}

discover_webapp_staff_runtime_role(){
  local identity
  identity="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && [ -n \"\${DATABASE_URL_STAFF:-}\" ] && psql \"\$DATABASE_URL_STAFF\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  runtime_overlay_parse_database_identity "webapp.test staff DATABASE_URL_STAFF" "$DB" "$identity"
}

discover_webapp_bootstrap_base_role(){
  local identity
  identity="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && db_url=\"\${DATABASE_URL_NONSTAFF:-\${DATABASE_URL:-}}\" && [ -n \"\$db_url\" ] && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  runtime_overlay_parse_database_identity "webapp.test bootstrap DATABASE_URL_NONSTAFF/DATABASE_URL" "$DB" "$identity"
}

discover_api_runtime_role(){
  discover_database_role_from_env "api.test" "$API_ENV"
}

discover_saas_isolation_operator_role(){
  local identity
  identity="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && [ -n \"\${SAAS_ISOLATION_OPERATOR_DATABASE_URL:-}\" ] && psql \"\$SAAS_ISOLATION_OPERATOR_DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  runtime_overlay_parse_database_identity "webapp.test SaaS isolation operator URL" "$DB" "$identity"
}

provision_saas_isolation_operator_login(){
  sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && node '$DEPLOY_REPO/$SAAS_ISOLATION_OPERATOR_PROVISIONER'" \
    | sudo -u postgres psql -d "$DB" -X -q -v ON_ERROR_STOP=1
  echo "   SaaS isolation diagnostic login: provisioned/rotated from protected TEST env"
}

grant_webapp_bootstrap_base_login_d3_4(){
  local role_name media_worker_role staff_role migrator_role api_runtime_role
  local diagnostic_role delivery_worker_role scheduler_role operator_role role_safe protected_role
  role_name="$(discover_webapp_bootstrap_base_role)"
  media_worker_role="$(discover_media_worker_runtime_role)"
  staff_role="$(discover_webapp_staff_runtime_role)"
  migrator_role="$(discover_webapp_migrator_role)"
  api_runtime_role="$(discover_api_runtime_role)"
  diagnostic_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_DIAGNOSTIC)"
  delivery_worker_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_DELIVERY_WORKER)"
  scheduler_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_SCHEDULER)"
  operator_role="$(discover_saas_isolation_operator_role)"
  validate_pg_identifier "webapp.test bootstrap DATABASE_URL_NONSTAFF/DATABASE_URL role" "$role_name"
  validate_pg_identifier "webapp media control capability role" "$media_worker_role"
  validate_pg_identifier "webapp.test staff DATABASE_URL_STAFF role" "$staff_role"
  [ "$role_name" != "$staff_role" ] || {
    echo "FATAL: webapp nonstaff/bootstrap role '$role_name' aliases staff role '$staff_role'; refusing D3.4 mutation" >&2
    exit 1
  }
  [ "$role_name" != "$media_worker_role" ] || {
    echo "FATAL: webapp nonstaff/bootstrap role '$role_name' aliases media role '$media_worker_role'; refusing D3.4 mutation" >&2
    exit 1
  }
  for protected_role in \
    "$migrator_role" \
    "$api_runtime_role" \
    "$diagnostic_role" \
    "$delivery_worker_role" \
    "$scheduler_role" \
    "$operator_role" \
    "$RETIRED_LEGACY_DBROLE" \
    app_owner app_staff app_patient app_worker; do
    [ "$role_name" != "$protected_role" ] || {
      echo "FATAL: webapp nonstaff/bootstrap role '$role_name' aliases protected role '$protected_role'; refusing D3.4 mutation" >&2
      exit 1
    }
  done
  role_safe="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -qAt -c "SELECT (count(*) = 1 AND bool_and(rolcanlogin AND NOT rolsuper))::int FROM pg_roles WHERE rolname = '$role_name';")"
  [ "$role_safe" = "1" ] || {
    echo "FATAL: webapp nonstaff/bootstrap role '$role_name' is not a unique LOGIN NOSUPERUSER role; refusing D3.4 mutation" >&2
    exit 1
  }
  sudo -u deploy test -r "$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS" || {
    echo "FATAL: deploy cannot read SQL file: $DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS" >&2
    exit 1
  }
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v d3_4_bootstrap_base_role="$role_name" \
    -v d3_4_media_worker_runtime_role="$media_worker_role" \
    -f "$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS"
  echo "   D3.4 bootstrap/base-login grants: OK (webapp.test role $role_name)"
  if [ "$P2_B_CONTEXT_INSTALLED" = "1" ]; then
    assert_media_worker_runtime_can_release_principal_context
  fi
  assert_webapp_credential_helper_runtime_acl
}

install_saas_isolation_telemetry_overlay(){
  local webapp_runtime_role api_runtime_role operator_runtime_role
  webapp_runtime_role="$(discover_webapp_bootstrap_base_role)"
  api_runtime_role="$(discover_api_runtime_role)"
  operator_runtime_role="$(discover_saas_isolation_operator_role)"
  validate_pg_identifier "webapp.test telemetry runtime role" "$webapp_runtime_role"
  validate_pg_identifier "api.test telemetry runtime role" "$api_runtime_role"
  validate_pg_identifier "webapp.test telemetry operator role" "$operator_runtime_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v telemetry_webapp_runtime_role="$webapp_runtime_role" \
    -v telemetry_api_runtime_role="$api_runtime_role" \
    -v telemetry_operator_runtime_role="$operator_runtime_role" \
    -f "$DEPLOY_REPO/$SAAS_ISOLATION_TELEMETRY"
  echo "   SaaS isolation telemetry closed API: OK"
}

# TEST-only scenario fixtures, split out of the closed telemetry API above so the production
# overlay (deploy-prod.sh, zero references) can never carry these objects. Must run after
# install_saas_isolation_telemetry_overlay: it depends on the roles/tables that overlay owns.
install_saas_isolation_telemetry_test_fixtures_overlay(){
  local webapp_runtime_role api_runtime_role operator_runtime_role
  webapp_runtime_role="$(discover_webapp_bootstrap_base_role)"
  api_runtime_role="$(discover_api_runtime_role)"
  operator_runtime_role="$(discover_saas_isolation_operator_role)"
  validate_pg_identifier "webapp.test telemetry runtime role" "$webapp_runtime_role"
  validate_pg_identifier "api.test telemetry runtime role" "$api_runtime_role"
  validate_pg_identifier "webapp.test telemetry operator role" "$operator_runtime_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v telemetry_webapp_runtime_role="$webapp_runtime_role" \
    -v telemetry_api_runtime_role="$api_runtime_role" \
    -v telemetry_operator_runtime_role="$operator_runtime_role" \
    -f "$DEPLOY_REPO/$SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES"
  echo "   SaaS isolation TEST scenario fixture API: OK"
}

install_saas_system_health_diagnostics_overlay(){
  local operator_runtime_role
  operator_runtime_role="$(discover_saas_isolation_operator_role)"
  validate_pg_identifier "webapp.test System Health operator role" "$operator_runtime_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v system_health_operator_runtime_role="$operator_runtime_role" \
    -f "$DEPLOY_REPO/$SAAS_SYSTEM_HEALTH_DIAGNOSTICS"
  echo "   curated System Health diagnostic API: OK"
}

install_integrator_server_runtime_config_overlay(){
  local api_runtime_role
  api_runtime_role="$(discover_api_runtime_role)"
  validate_pg_identifier "api.test server-runtime config role" "$api_runtime_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v integrator_runtime_config_role="$api_runtime_role" \
    -f "$DEPLOY_REPO/$INTEGRATOR_SERVER_RUNTIME_CONFIG"
  echo "   integrator server-runtime config API: OK"
}

# Fixes: integrator login role (bootstrap/infra technical principals never SET ROLE, see
# apps/integrator/src/infra/db/withClient.ts) has zero public.* table grants beyond
# 20260413_0002/0003's narrow SELECT/USAGE -> 42501 on the very first pre-routing read, breaking
# inbound Telegram/Max and blocking Track D1 direct writes. See
# deploy/postgres/integrator-login-public-identity-grants.sql header for the full trace.
install_integrator_login_public_identity_grants_overlay(){
  local api_runtime_role
  api_runtime_role="$(discover_api_runtime_role)"
  validate_pg_identifier "api.test login public identity grants role" "$api_runtime_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v integrator_login_public_identity_grants_role="$api_runtime_role" \
    -f "$DEPLOY_REPO/$INTEGRATOR_LOGIN_PUBLIC_IDENTITY_GRANTS"
  echo "   integrator login public identity grants: OK"
}

assert_integrator_server_runtime_config_ready(){
  local ok
  ok="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT (NOT (SELECT rolinherit FROM pg_roles WHERE rolname = current_user) AND 3 = (SELECT count(*) FROM pg_auth_members membership JOIN pg_roles member_role ON member_role.oid = membership.member JOIN pg_roles granted_role ON granted_role.oid = membership.roleid WHERE member_role.rolname = current_user AND granted_role.rolname IN ('app_staff', 'app_patient', 'app_worker') AND NOT membership.inherit_option AND membership.set_option) AND has_function_privilege(current_user, 'app.read_global_server_runtime_setting(text)', 'EXECUTE') AND has_function_privilege(current_user, 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE') AND has_function_privilege(current_user, 'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)', 'EXECUTE') AND (SELECT count(*) FROM pg_proc procedure JOIN pg_roles owner ON owner.oid = procedure.proowner CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege WHERE procedure.oid = 'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'::regprocedure AND procedure.prosecdef AND owner.rolname LIKE 'app_seam\\_%\\_owner' ESCAPE '\\' AND privilege.grantee IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = current_user)) AND privilege.privilege_type = 'EXECUTE' AND NOT privilege.is_grantable) = 2 AND NOT EXISTS (SELECT 1 FROM pg_proc procedure CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege WHERE procedure.oid = 'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'::regprocedure AND (privilege.grantee NOT IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = current_user)) OR privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable)) AND NOT has_table_privilege(current_user, 'integrator.delivery_attempt_logs', 'INSERT') AND NOT has_sequence_privilege(current_user, 'integrator.delivery_attempt_logs_id_seq', 'USAGE') AND (SELECT count(*) FROM pg_proc procedure CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = current_user) AND privilege.privilege_type = 'EXECUTE' AND NOT privilege.is_grantable) = 1 AND NOT EXISTS (SELECT 1 FROM pg_proc procedure JOIN pg_roles owner ON owner.oid = procedure.proowner CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure AND (NOT procedure.prosecdef OR owner.rolname NOT LIKE 'app_seam\\_%\\_owner' ESCAPE '\\' OR privilege.grantee NOT IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = current_user)) OR privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable)) AND NOT EXISTS (SELECT 1 FROM pg_class relation CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) privilege WHERE relation.oid IN ('public.app_runtime_settings'::regclass, 'public.system_settings'::regclass) AND privilege.privilege_type = 'SELECT' AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = current_user))) AND NOT EXISTS (SELECT 1 FROM pg_class relation WHERE relation.oid IN ('public.app_runtime_settings'::regclass, 'public.system_settings'::regclass) AND pg_has_role(current_user, pg_get_userbyid(relation.relowner), 'MEMBER')) AND COALESCE((app.read_global_server_runtime_setting('app_base_url')->>'value') ~ '^https?://', false))::text;\"")"
  [ "$ok" = "true" ] || { echo "FATAL: integrator DB-backed runtime/SMTP/audit accessors are not ready" >&2; exit 1; }
  echo "   integrator DB-backed runtime/SMTP/audit accessors: OK (exact ACL, no direct protected-table write)"
}

run_saas_isolation_test_scenario_proof(){
  local scenario_args
  for scenario_args in \
    "--execute" \
    "--execute --prove-cleanup-on-injected-failure" \
    "--execute --assert-clean-only"; do
    sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && ALLOW_DEV_AUTH_BYPASS=false pnpm --dir apps/webapp run diagnostics:saas-isolation:test-scenarios -- $scenario_args"
  done
  echo "   SaaS isolation TEST scenarios: normal + injected cleanup + final clean OK"
}

apply_test_strict_rls_finalizer(){
  local bootstrap_role
  bootstrap_role="$(discover_webapp_bootstrap_base_role)"
  validate_pg_identifier "strict TEST bootstrap role" "$bootstrap_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v test_expected_database="$DB" \
    -v phase4_bootstrap_base_role="$bootstrap_role" \
    -v phase4_staff_role="$P2_B_STAFF_ROLE" \
    -v phase4_owner_role="$P2_B_OWNER_ROLE" \
    -f "$DEPLOY_REPO/$TEST_STRICT_RLS_FINALIZER"
  assert_cleanup_elevation
  echo "   strict helper policies + exact 163-target FORCE assertion: OK"
}

assert_test_db_restore_owner_ready(){
  local db_owner platform_users_owner
  db_owner="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB';")"
  [ "$db_owner" = postgres ] || { echo "FATAL: $DB owner is '$db_owner', expected 'postgres'"; exit 1; }
  platform_users_owner="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_users';")"
  [ "$platform_users_owner" = postgres ] || { echo "FATAL: public.platform_users owner is '$platform_users_owner', expected 'postgres' before declarative handoff"; exit 1; }
}

run_test_db_restore_owner_sql_file(){
  local sql_file="$1"
  sudo -u deploy test -r "$sql_file" || { echo "FATAL: deploy cannot read SQL file: $sql_file"; exit 1; }
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$sql_file"
}

stage_cutover_inputs_for_postgres(){
  [ -z "${POSTGRES_CUTOVER_INPUT_DIR:-}" ] || {
    echo "FATAL: PostgreSQL cutover inputs were already staged" >&2
    return 1
  }
  POSTGRES_CUTOVER_INPUT_DIR="$(sudo -u postgres mktemp -d /tmp/bcb-test-cutover-inputs.XXXXXX)"
  POSTGRES_FIO_MANIFEST="$POSTGRES_CUTOVER_INPUT_DIR/fio-owner-reviewed.manifest.json"
  sudo install -o postgres -g postgres -m 0600 -- "$FIO_MANIFEST" "$POSTGRES_FIO_MANIFEST"
  [ "$(sudo -u postgres sha256sum -- "$POSTGRES_FIO_MANIFEST" | awk '{print $1}')" = "$FIO_MANIFEST_FILE_SHA256" ] || {
    echo "FATAL: staged FIO manifest SHA-256 mismatch" >&2
    return 1
  }
  echo "   protected FIO manifest: staged for local PostgreSQL migration executor"
}

run_postgres_repo_as_test_restore_owner(){
  local deploy_command="$1"
  sudo -u postgres env \
    -u API_ENV_FILE -u WEBAPP_ENV_FILE \
    -u INTEGRATOR_DB_URL \
    -u DATABASE_URL_STAFF -u DATABASE_URL_PATIENT -u DATABASE_URL_GLOBAL_ADMIN \
    DATABASE_URL="postgresql:///$DB?host=/var/run/postgresql" \
    DB_PRINCIPAL_CONTEXT_MODE=legacy-guc \
    NODE_ENV=test USE_REAL_DATABASE=1 \
    bash -c "cd '$DEPLOY_REPO' && $deploy_command"
}

run_a2_nginx_preflight(){
  local dump_file
  dump_file="$(mktemp /tmp/bcb-nginx-dump.XXXXXX)"
  sudo nginx -T >"$dump_file" 2>/tmp/bcb-nginx-dump.err
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump="$dump_file"
  rm -f "$dump_file" /tmp/bcb-nginx-dump.err
}

apply_test_nginx_webapp_config(){
  bash deploy/host/apply-test-nginx-webapp.sh --apply
}

run_specialist_signup_provisioning_smoke(){
  # U3S specialist signup/provisioning/binding smoke (taskdb: stalled self-signup provisioning
  # fix). This never touches TEST -- it starts its own private, disposable PostgreSQL cluster under
  # /tmp, installs the exact canonical overlays this deploy also applies (including
  # specialist-owner-provisioning-rls.sql), and exercises app.provision_specialist_owner(uuid)
  # through a locked app_patient principal end to end (org+membership creation, replay/concurrent
  # idempotency, second-organization denial, C5A trial assignment, staff commercial read wall,
  # specialist binding). A non-zero exit aborts this deploy so the provisioning class this fix
  # addresses is caught at the gate, not live.
  sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs"
}

assert_specialist_owner_provisioning_seam_pinned(){
  # Pins the trusted-seam invariant the stalled-signup fix depends on, read-only and after every
  # mutating overlay/restart above has already run (so a FATAL here never leaves TEST
  # half-configured -- it can only fail a fully-closed state). app_owner is retired: it must be
  # NOLOGIN, no row-security bypass and NOINHERIT, have no members or DB-local owned objects. The P2-B tables belong
  # to app_object_owner; their SECURITY DEFINER accessors belong to dedicated app_seam_*_owner roles.
  # This assertion runs mid-closure right after the service restart + smokes. A benign closure
  # transient (a brief post-restart / elevation-window moment) can momentarily flip a condition
  # even though the SETTLED seam is correct (verified: all conditions hold in steady state). So
  # retry-with-settle a few times -- only a PERSISTENT violation FATALs; a one-off closure blip does
  # not leave TEST half-configured/down.
  local seam_ok_sql
  seam_ok_sql="$(cat <<'SEAM_OK_SQL'
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit)
  AND 0 = (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE r.rolname = 'app_owner')
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE pg_get_userbyid(c.relowner) = 'app_owner'
  )
  AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE pg_get_userbyid(p.proowner) = 'app_owner')
  AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE pg_get_userbyid(n.nspowner) = 'app_owner')
  AND NOT EXISTS (SELECT 1 FROM pg_type t WHERE pg_get_userbyid(t.typowner) = 'app_owner')
  AND NOT EXISTS (
    SELECT 1 FROM pg_shdepend d
    WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass
      AND d.refobjid = 'app_owner'::regrole
      AND d.deptype = 'o'
      AND d.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  )
  AND 3 = (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN ('context_signing_secrets', 'principal_context', 'context_nonce_ledger')
      AND c.relkind IN ('r', 'p')
      AND pg_get_userbyid(c.relowner) = 'app_object_owner'
  )
  AND (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'app.provision_specialist_owner(uuid)'::regprocedure) LIKE 'app_seam\_%\_owner' ESCAPE '\'
  AND (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'app.current_provisioned_owner_organization()'::regprocedure) LIKE 'app_seam\_%\_owner' ESCAPE '\'
  AND (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c WHERE c.oid = 'public.be_organizations'::regclass)
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    WHERE pol.polrelid = 'public.be_organizations'::regclass
      AND pol.polcmd IN ('a', '*')
      AND (
        pol.polroles = '{0}'
        OR EXISTS (
          SELECT 1 FROM unnest(pol.polroles) AS r(oid)
          JOIN pg_roles ro ON ro.oid = r.oid
          WHERE ro.rolname IN ('app_staff', 'app_patient')
        )
      )
  )
)::text;
SEAM_OK_SQL
)"
  local ok="" _seam_attempt
  for _seam_attempt in 1 2 3 4 5; do
    set +e
    ok="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "$seam_ok_sql" 2>/dev/null)"
    set -e
    # $seam_ok_sql ends in `::text`, so psql renders it as the words true/false (bare booleans
    # render t/f, but a ::text cast spells them out) -- compare to "true", matching every other
    # ::text-cast boolean check in this file (e.g. assert_c5a_clinical_test_measure_kinds_closure).
    [ "$ok" = "true" ] && break
    sleep 2
  done
  [ "$ok" = "true" ] || {
    # A retired-role or seam ownership mismatch is a real closure failure. The retry above keeps a
    # brief post-restart read from creating noise; a persistent mismatch must make TEST red.
    echo "FATAL: retired app_owner / specialist-owner seam contract diverged. Per-condition (t/true = ok):" >&2
    set +e
    sudo -u postgres psql -d "$DB" -X -x -tAc "
SELECT
 (SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_owner' AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit))::text AS c1_retired_role_contract,
 (SELECT 0=(SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname='app_owner'))::text AS c2_zero_members,
 (SELECT NOT EXISTS (SELECT 1 FROM pg_class c WHERE pg_get_userbyid(c.relowner)='app_owner') AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE pg_get_userbyid(p.proowner)='app_owner') AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE pg_get_userbyid(n.nspowner)='app_owner') AND NOT EXISTS (SELECT 1 FROM pg_type t WHERE pg_get_userbyid(t.typowner)='app_owner'))::text AS c3_zero_owned_objects,
 (SELECT 3=(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname IN ('context_signing_secrets','principal_context','context_nonce_ledger') AND c.relkind IN ('r','p') AND pg_get_userbyid(c.relowner)='app_object_owner'))::text AS c4_p2b_object_owner,
 ((SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid='app.provision_specialist_owner(uuid)'::regprocedure) LIKE 'app_seam\_%\_owner' ESCAPE '\')::text AS c5_provfn_seam_owner,
 ((SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid='app.current_provisioned_owner_organization()'::regprocedure) LIKE 'app_seam\_%\_owner' ESCAPE '\')::text AS c6_orgfn_seam_owner,
 (SELECT (c.relrowsecurity AND c.relforcerowsecurity) FROM pg_class c WHERE c.oid='public.be_organizations'::regclass)::text AS c7_be_org_force,
 (SELECT NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid='public.be_organizations'::regclass AND pol.polcmd IN ('a','*') AND (pol.polroles='{0}' OR EXISTS (SELECT 1 FROM unnest(pol.polroles) AS r(oid) JOIN pg_roles ro ON ro.oid=r.oid WHERE ro.rolname IN ('app_staff','app_patient')))))::text AS c8_no_broad_insert_policy;
" 2>&1 | sed 's/^/       /' >&2
    set -e
    return 1
  }
  echo "   specialist-owner provisioning seam: OK (retired app_owner + app_object_owner/app_seam owners pinned, be_organizations FORCE RLS intact)"
}

assert_login_fix_definer_owners_pinned(){
  # 2026-08-04 live regression: migration 0356 re-homed 15 platform_users SECURITY DEFINER
  # accessors from the migrator role to app_owner so they can see FORCE-RLS platform_users (see
  # 0356's header). Two closure overlays that run AFTER every migration --
  # organization-member-invites-rls.sql and specialist-signup-public-bootstrap-rls.sql -- DROP+CREATE
  # eight of those fifteen and, before this gate existed, re-derived their owner from "current owner
  # of a related table" (the migrator role), silently reverting 0356 on every single deploy. TEST
  # measured all eight back on bersoncarebot_test, reading zero platform_users rows, with no red gate
  # anywhere. Both overlays now pin app_owner explicitly for their migration-0356 functions; this is
  # the exact-signature check that catches a future regression of the same shape (a new DROP+CREATE
  # or a reintroduced dynamic-owner ALTER) instead of relying on the whole-class count below, which
  # only proves a total is right, not that these specific fifteen are among the ones counted.
  local violations
  violations="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
WITH pinned_functions(signature) AS (
  VALUES
    ('app.bump_platform_user_session_epoch_self()'),
    ('app.email_auth_verify_user_email(uuid,text)'),
    ('app.email_otp_public_delete_unverified_registration(uuid)'),
    ('app.email_otp_public_find_or_create_user(text)'),
    ('app.email_otp_public_find_user_by_email(text)'),
    ('app.email_otp_public_register_patient(text,text,text,text)'),
    ('app.email_password_delete_unverified_registration(uuid)'),
    ('app.email_password_find_login_candidate(text)'),
    ('app.email_password_register_pending(text,text,text,text,text,text)'),
    ('app.is_platform_registration_analytics_user_excluded(uuid)'),
    ('app.list_platform_organization_members(uuid)'),
    ('app.patient_done_reminder_occurrence(text)'),
    ('app.patient_skip_reminder_occurrence(uuid,text,text)'),
    ('app.patient_snooze_reminder_occurrence(uuid,text,integer)'),
    ('app.propagate_staff_session_version_to_session_epoch()'),
    ('app.get_preferred_auth_channel_code(uuid)'),
    -- D27-C (migrations 0369/0370, added 2026-08-04): the login-code delivery pair. Same shape of
    -- regression as the fifteen above -- organization-member-invites-rls.sql carries a resurrection
    -- ALTER for the enqueue accessor and, on its first version, re-pinned it to the migrator role right
    -- after 0370 set app_owner. Named here so a future overlay edit fails by signature instead of only
    -- shifting a whole-class count from one gate to another.
    ('app.email_auth_set_email_challenge_delivery_code(uuid,text)'),
    ('app.email_auth_enqueue_otp_delivery(uuid,uuid)')
)
SELECT string_agg(
  target.signature || ' owned by ' || COALESCE(pg_get_userbyid(procedure.proowner), '<missing>'),
  '; '
  ORDER BY target.signature
)
FROM pinned_functions AS target
LEFT JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
WHERE to_regprocedure(target.signature) IS NULL
   OR pg_get_userbyid(procedure.proowner) NOT LIKE 'app_seam\_%\_owner' ESCAPE '\';
")"
  if [ -n "$violations" ]; then
    echo "FATAL: migration 0356/0357 login-fix functions are not pinned to an app_seam_*_owner role: $violations" >&2
    echo "       A post-migration overlay reverted ownership (DROP+CREATE or ALTER ... OWNER TO a" >&2
    echo "       dynamic table-owner ident) -- see organization-member-invites-rls.sql and" >&2
    echo "       specialist-signup-public-bootstrap-rls.sql. Under FORCE RLS this silently kills" >&2
    echo "       public email/password login (bootstrap role reads zero platform_users rows)." >&2
    exit 1
  fi
  echo "   login-fix (0356/0357) definer owners: OK (all pinned to app_seam_*_owner roles)"
}

assert_security_definer_seam_owners_complete(){
  # app_owner is retired and must own no functions. Every application SECURITY DEFINER function is
  # instead owned by a dedicated app_seam_*_owner role. This whole-class gate keeps the seam closed:
  # a new definer under the migrator, app_object_owner, or the retired role is a fatal ownership leak.
  local violations
  violations="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
WITH app_secdef AS (
  SELECT procedure.oid::regprocedure::text AS signature,
         pg_get_userbyid(procedure.proowner) AS owner_name
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'app' AND procedure.prosecdef
), seam_owners AS (
  SELECT DISTINCT owner_name FROM app_secdef
)
SELECT COALESCE(string_agg(signature || ' owned by ' || owner_name, '; ' ORDER BY signature), '')
FROM app_secdef
WHERE owner_name NOT LIKE 'app_seam\_%\_owner' ESCAPE '\'
UNION ALL
SELECT 'expected 46 app_seam_*_owner roles, found ' || count(*)::text
FROM seam_owners
HAVING count(*) <> 46;
")"
  if [ -n "$violations" ]; then
    echo "FATAL: SECURITY DEFINER seam owner contract diverged: $violations" >&2
    echo "       app_owner is retired; application definers must belong to the reviewed app_seam_*_owner roles." >&2
    exit 1
  fi
  echo "   SECURITY DEFINER seam owners: OK (46 app_seam_*_owner roles; retired app_owner owns none)"
}

assert_c5a_clinical_test_measure_kinds_closure(){
  # H-7 (#1040), self-audit follow-up: deploy/postgres/c5a-platform-operations-runtime.sql:49-89
  # guards its clinical_test_measure_kinds app_staff write-lock revoke and app_platform_settings
  # grant with `IF to_regclass(...) IS NULL`, only RAISE WARNING on skip. \set ON_ERROR_STOP on
  # stops the script on ERROR, never on WARNING, and nothing downstream read the resulting grant
  # state back -- the deploy exited 0 whether the closure actually applied or silently skipped.
  #
  # The guard itself is correct and stays: some throwaway partial-migration clusters genuinely never
  # create this table (the comment in that file names the U3S specialist-signup-provisioning smoke's
  # own private cluster, built from a hand-picked migration subset that excludes 0034). What this
  # gate fixes is that THIS deploy is not one of those clusters -- run_strict_post_migration_closure
  # always runs against the main TEST DB after the full drizzle-migrations chain, which includes
  # 0034, so the table is always expected to exist here and the closure is always expected to have
  # taken effect. A skip that reaches this point is a real regression, not a benign throwaway-cluster
  # skip, so it is FATAL rather than a WARNING line nobody is required to read.
  local ok
  ok="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
SELECT (
  to_regclass('public.clinical_test_measure_kinds') IS NOT NULL
  AND NOT has_table_privilege('app_staff', 'public.clinical_test_measure_kinds', 'UPDATE')
  AND NOT has_table_privilege('app_staff', 'public.clinical_test_measure_kinds', 'DELETE')
  AND has_table_privilege('app_platform_settings', 'public.clinical_test_measure_kinds', 'SELECT')
  AND has_table_privilege('app_platform_settings', 'public.clinical_test_measure_kinds', 'UPDATE')
)::text;
")"
  [ "$ok" = "true" ] || {
    echo "FATAL: public.clinical_test_measure_kinds write-lock closure (A-6 / #1007) did not take effect on this deploy." >&2
    echo "       Either the table is missing (migration 0034 did not run -- unexpected on a full TEST deploy)," >&2
    echo "       or app_staff still holds UPDATE/DELETE, or app_platform_settings is missing SELECT/UPDATE." >&2
    echo "       See deploy/postgres/c5a-platform-operations-runtime.sql's guarded DO blocks (lines ~49-89)." >&2
    exit 1
  }
  echo "   clinical_test_measure_kinds write-lock closure: OK (app_staff locked out, app_platform_settings holds SELECT/UPDATE)"
}

assert_c5a_platform_organization_members_closure(){
  # #1068 / owner D-5: run after every mutating closure rather than trusting the one-shot migration.
  # The table grant is exactly SELECT; names cross the otherwise-closed platform_users boundary only
  # through one app_seam_*_owner SECURITY DEFINER projection with an exact EXECUTE ACL.
  local ok
  ok="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
WITH target_relation AS (
  SELECT relation.oid, relation.relowner, relation.relacl
  FROM pg_class AS relation
  WHERE relation.oid = 'public.be_organization_members'::regclass
), expected_table_acl(privilege_type, is_grantable) AS (
  VALUES ('SELECT'::text, false)
), actual_table_acl AS (
  SELECT privilege.privilege_type, privilege.is_grantable
  FROM target_relation
  CROSS JOIN LATERAL aclexplode(
    COALESCE(target_relation.relacl, acldefault('r', target_relation.relowner))
  ) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), actual_column_acl AS (
  SELECT attribute.attname, privilege.privilege_type, privilege.is_grantable
  FROM target_relation
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = target_relation.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), target_function AS (
  SELECT procedure.oid, procedure.proowner, procedure.proacl, procedure.prosecdef
  FROM pg_proc AS procedure
  WHERE procedure.oid = 'app.list_platform_organization_members(uuid)'::regprocedure
), expected_function_acl(grantee, privilege_type, is_grantable) AS (
  SELECT pg_get_userbyid(proowner), 'EXECUTE'::text, false FROM target_function
  UNION ALL
  SELECT 'app_platform_settings'::text, 'EXECUTE'::text, false
), actual_function_acl AS (
  SELECT
    COALESCE(grantee.rolname, privilege.grantee::text) AS grantee,
    privilege.privilege_type,
    privilege.is_grantable
  FROM target_function
  CROSS JOIN LATERAL aclexplode(
    COALESCE(target_function.proacl, acldefault('f', target_function.proowner))
  ) AS privilege
  LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
)
SELECT (
  (SELECT count(*) FROM target_relation) = 1
  AND NOT EXISTS (
    (SELECT * FROM actual_table_acl EXCEPT SELECT * FROM expected_table_acl)
    UNION ALL
    (SELECT * FROM expected_table_acl EXCEPT SELECT * FROM actual_table_acl)
  )
  AND NOT EXISTS (SELECT 1 FROM actual_column_acl)
  AND (SELECT count(*) FROM target_function) = 1
  AND (SELECT bool_and(prosecdef AND pg_get_userbyid(proowner) LIKE 'app_seam\_%\_owner' ESCAPE '\') FROM target_function)
  AND NOT EXISTS (
    (SELECT * FROM actual_function_acl EXCEPT SELECT * FROM expected_function_acl)
    UNION ALL
    (SELECT * FROM expected_function_acl EXCEPT SELECT * FROM actual_function_acl)
  )
  AND NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'SELECT')
)::text;
")"
  [ "$ok" = "true" ] || {
    echo "FATAL: platform organization-members directory exact ACL did not take effect." >&2
    echo "       Expected app_platform_settings to hold only SELECT on be_organization_members," >&2
    echo "       no column grants or platform_users SELECT, and plain EXECUTE on the narrow app_seam_*_owner accessor." >&2
    exit 1
  }
  echo "   platform organization-members directory exact ACL: OK (SELECT-only table + narrow name projection)"
}

assert_c5a_enforced_quota_usage_closure(){
  local ok
  ok="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
WITH expected(relation_name) AS (
  VALUES
    ('organization_member_invites'),
    ('org_enrollments'),
    ('patient_files')
), relations AS (
  SELECT
    expected.relation_name,
    relation.oid,
    relation.relowner,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  FROM expected
  JOIN pg_class AS relation
    ON relation.relname = expected.relation_name
   AND relation.relnamespace = 'public'::regnamespace
), actual_acl AS (
  SELECT relations.relation_name, privilege.privilege_type, privilege.is_grantable
  FROM relations
  CROSS JOIN LATERAL aclexplode(
    COALESCE(relations.relacl, acldefault('r', relations.relowner))
  ) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), actual_column_acl AS (
  SELECT relations.relation_name, attribute.attname, privilege.privilege_type, privilege.is_grantable
  FROM relations
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = relations.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), actual_policy AS (
  SELECT
    relations.relation_name,
    policy.polname,
    policy.polcmd,
    policy.polpermissive,
    policy.polroles,
    pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
    policy.polwithcheck
  FROM relations
  JOIN pg_policy AS policy ON policy.polrelid = relations.oid
  WHERE 'app_platform_settings'::regrole = ANY(policy.polroles)
)
SELECT (
  (SELECT count(*) FROM relations) = 3
  AND (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM relations)
  AND NOT EXISTS (SELECT 1 FROM actual_acl)
  AND NOT EXISTS (SELECT 1 FROM actual_column_acl)
  AND NOT EXISTS (SELECT 1 FROM actual_policy)
  AND has_table_privilege((SELECT proowner FROM pg_proc WHERE oid = 'app.read_org_enforced_quota_usage(uuid)'::regprocedure), 'public.be_organization_members', 'SELECT')
  AND has_table_privilege((SELECT proowner FROM pg_proc WHERE oid = 'app.read_org_enforced_quota_usage(uuid)'::regprocedure), 'public.organization_member_invites', 'SELECT')
  AND has_table_privilege((SELECT proowner FROM pg_proc WHERE oid = 'app.read_org_enforced_quota_usage(uuid)'::regprocedure), 'public.org_enrollments', 'SELECT')
  AND has_table_privilege((SELECT proowner FROM pg_proc WHERE oid = 'app.read_org_enforced_quota_usage(uuid)'::regprocedure), 'public.patient_files', 'SELECT')
  AND has_function_privilege(
    'app_platform_settings',
    'app.read_org_enforced_quota_usage(uuid)',
    'EXECUTE'
  )
)::text;
")"
  [ "$ok" = "true" ] || {
    echo "FATAL: enforced quota usage exact ACL/policy closure did not take effect." >&2
    echo "       Expected count-only EXECUTE, no platform patient/file/invite row ACL or policy," >&2
    echo "       and reviewed app_seam_*_owner base-table grants. Courses/CMS pages are toggle-only" >&2
    echo "       mechanics (#1069) -- no course-row count or cms_pages_snapshot_usage accessor exists." >&2
    exit 1
  }
  echo "   enforced quota usage exact ACL/policy closure: OK"
}

assert_c5a_saas_billing_foundation_closure(){
  local ok
  ok="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
WITH expected(relation_name) AS (
  VALUES
    ('saas_billing_accounts'),
    ('saas_billing_subscriptions'),
    ('saas_billing_invoices'),
    ('saas_billing_provider_events')
), relations AS (
  SELECT
    expected.relation_name,
    relation.oid,
    relation.relowner,
    owner.rolname AS owner_name,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  FROM expected
  JOIN pg_class AS relation
    ON relation.relname = expected.relation_name
   AND relation.relnamespace = 'public'::regnamespace
  JOIN pg_roles AS owner ON owner.oid = relation.relowner
), role_oids AS (
  SELECT
    (SELECT oid FROM pg_roles WHERE rolname = 'app_clinic_billing') AS clinic_billing_oid,
    (SELECT oid FROM pg_roles WHERE rolname = 'app_platform_settings') AS platform_oid,
    (SELECT oid FROM pg_roles WHERE rolname = 'app_staff') AS staff_oid
), seam_owners AS (
  SELECT
    pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'app.saas_billing_effective_tariff(uuid,uuid)'::regprocedure)) AS tariff_owner,
    pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'app.resolve_saas_billing_invoice_for_webhook(text,text)'::regprocedure)) AS invoice_resolver_owner,
    pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'app.choose_organization_first_tariff(uuid,uuid)'::regprocedure)) AS first_tariff_owner
), expected_table_acl(relation_name, grantee, privilege_type, is_grantable) AS (
  SELECT relation_name, owner_name, privilege_type, false
  FROM relations
  CROSS JOIN unnest(ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]::text[]) AS privilege_type
  UNION
  SELECT relation_name, 'app_clinic_billing', 'SELECT', false FROM relations
  UNION
  SELECT relation_name, 'app_clinic_billing', privilege_type, false
  FROM relations
  CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE']::text[]) AS privilege_type
  WHERE relation_name <> 'saas_billing_provider_events'
  UNION
  -- Migration 0286 grants this supporting read to its dedicated SECURITY DEFINER seam owner.
  -- Earlier bounded scratch clusters can have the billing tables without that function.
  SELECT 'saas_billing_subscriptions', tariff_owner, 'SELECT', false
  FROM seam_owners
  WHERE tariff_owner IS NOT NULL
  UNION
  -- 0343 (#1057 B0.3) grants this supporting read to its dedicated SECURITY DEFINER
  -- resolver, same idiom as the subscriptions row above. This row was missing from this gate
  -- since 0343 landed -- caught live: applying 0343 to a fully-migrated DEV left an unexpected
  -- seam-owner/SELECT/saas_billing_invoices ACL entry this assertion did not yet expect.
  SELECT 'saas_billing_invoices', invoice_resolver_owner, 'SELECT', false
  FROM seam_owners
  WHERE invoice_resolver_owner IS NOT NULL
  UNION
  -- 0375 (#1069 T5): choose_organization_first_tariff SECURITY DEFINER accessor.
  SELECT 'saas_billing_accounts', first_tariff_owner, privilege_type, false
  FROM seam_owners CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]) AS privilege_type
  WHERE first_tariff_owner IS NOT NULL
  UNION
  SELECT 'saas_billing_subscriptions', first_tariff_owner, privilege_type, false
  FROM seam_owners CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]) AS privilege_type
  WHERE first_tariff_owner IS NOT NULL
  UNION
  SELECT relation_name, 'app_platform_settings', privilege_type, false
  FROM relations
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]) AS privilege_type
  UNION
  -- 0344 (#1057 B0.3): captureSaasBillingProviderWebhookEvent runs under SET ROLE app_staff
  -- (runWithDbOrganizationPrincipal). Capture never creates an invoice/subscription row -- only reads
  -- (row-locking) and updates one the clinic-billing door already created. 0371 adds the matching
  -- org-scoped SELECT on saas_billing_accounts for getOrganizationBillingOverview; staff UPDATE on
  -- accounts remains excluded.
  SELECT relation_name, 'app_staff', 'SELECT', false FROM relations
  UNION
  SELECT relation_name, 'app_staff', 'UPDATE', false FROM relations
  WHERE relation_name <> 'saas_billing_accounts'
  UNION
  SELECT 'saas_billing_provider_events', 'app_staff', 'INSERT', false
), actual_table_acl AS (
  SELECT
    relations.relation_name,
    CASE
      WHEN acl.grantee = 0 THEN 'PUBLIC'
      ELSE COALESCE(grantee.rolname, acl.grantee::text)
    END AS grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM relations
  CROSS JOIN LATERAL aclexplode(
    COALESCE(relations.relacl, acldefault('r', relations.relowner))
  ) AS acl
  LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
), actual_column_acl AS (
  SELECT
    relations.relation_name,
    attribute.attname,
    CASE
      WHEN acl.grantee = 0 THEN 'PUBLIC'
      ELSE COALESCE(grantee.rolname, acl.grantee::text)
    END AS grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM relations
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = relations.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  CROSS JOIN LATERAL aclexplode(attribute.attacl) AS acl
  LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
), expected_policy_inventory AS (
  SELECT
    relations.relation_name,
    relations.relation_name || expected_policy.suffix AS policy_name,
    true AS permissive,
    expected_policy.command::\"char\",
    expected_policy.roles,
    expected_policy.using_expression,
    expected_policy.check_expression
  FROM relations
  CROSS JOIN role_oids
  CROSS JOIN LATERAL (
    VALUES
      (
        '_clinic_billing_select',
        'r'::\"char\",
        ARRAY[role_oids.clinic_billing_oid]::oid[],
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text,
        NULL::text
      ),
      ('_platform_select', 'r'::\"char\", ARRAY[role_oids.platform_oid]::oid[], 'true'::text, NULL::text),
      ('_platform_insert', 'a'::\"char\", ARRAY[role_oids.platform_oid]::oid[], NULL::text, 'true'::text),
      ('_platform_update', 'w'::\"char\", ARRAY[role_oids.platform_oid]::oid[], 'true'::text, 'true'::text)
  ) AS expected_policy(suffix, command, roles, using_expression, check_expression)
  UNION ALL
  SELECT
    relations.relation_name,
    relations.relation_name || expected_policy.suffix,
    true,
    expected_policy.command::\"char\",
    expected_policy.roles,
    expected_policy.using_expression,
    expected_policy.check_expression
  FROM relations
  CROSS JOIN role_oids
  CROSS JOIN LATERAL (
    VALUES
      (
        '_clinic_billing_insert',
        'a'::\"char\",
        ARRAY[role_oids.clinic_billing_oid]::oid[],
        NULL::text,
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text
      ),
      (
        '_clinic_billing_update',
        'w'::\"char\",
        ARRAY[role_oids.clinic_billing_oid]::oid[],
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text,
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text
      )
  ) AS expected_policy(suffix, command, roles, using_expression, check_expression)
  WHERE relations.relation_name <> 'saas_billing_provider_events'
  UNION ALL
  -- 0344 (#1057 B0.3): captureSaasBillingProviderWebhookEvent's org-scoped SELECT/UPDATE on the
  -- capture path's tables. 0371 adds staff_capture_select on saas_billing_accounts; staff UPDATE on
  -- accounts is still excluded below.
  SELECT
    relations.relation_name,
    relations.relation_name || expected_policy.suffix,
    true,
    expected_policy.command::\"char\",
    expected_policy.roles,
    expected_policy.using_expression,
    expected_policy.check_expression
  FROM relations
  CROSS JOIN role_oids
  CROSS JOIN LATERAL (
    VALUES
      (
        '_staff_capture_select',
        'r'::\"char\",
        ARRAY[role_oids.staff_oid]::oid[],
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text,
        NULL::text
      ),
      (
        '_staff_capture_update',
        'w'::\"char\",
        ARRAY[role_oids.staff_oid]::oid[],
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text,
        '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text
      )
  ) AS expected_policy(suffix, command, roles, using_expression, check_expression)
  WHERE relations.relation_name <> 'saas_billing_accounts'
     OR expected_policy.suffix = '_staff_capture_select'
  UNION ALL
  SELECT
    'saas_billing_provider_events',
    'saas_billing_provider_events_staff_capture_insert',
    true,
    'a'::\"char\",
    ARRAY[role_oids.staff_oid]::oid[],
    NULL::text,
    '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text
  FROM role_oids
), actual_policy_inventory AS (
  SELECT
    relations.relation_name,
    policy.polname AS policy_name,
    policy.polpermissive AS permissive,
    policy.polcmd AS command,
    policy.polroles AS roles,
    pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
    pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
  FROM relations
  JOIN pg_policy AS policy ON policy.polrelid = relations.oid
)
SELECT (
  (SELECT count(*) FROM relations) = 4
  AND (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM relations)
  AND EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'app_clinic_billing'
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreaterole
      AND NOT rolcreatedb
      AND NOT rolinherit
      AND NOT rolreplication
      AND NOT rolbypassrls
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members AS membership
    WHERE membership.roleid = 'app_clinic_billing'::regrole
      AND membership.member = 'app_staff'::regrole
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  AND has_function_privilege(
    'app_clinic_billing',
    'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
    'EXECUTE'
  )
  AND has_function_privilege('app_clinic_billing', 'app.current_org_id()', 'EXECUTE')
  AND has_function_privilege('app_clinic_billing', 'app.release_principal_context()', 'EXECUTE')
  AND NOT EXISTS (
    (SELECT * FROM actual_table_acl EXCEPT SELECT * FROM expected_table_acl)
    UNION ALL
    (SELECT * FROM expected_table_acl EXCEPT SELECT * FROM actual_table_acl)
  )
  AND NOT EXISTS (SELECT 1 FROM actual_column_acl)
  AND NOT EXISTS (
    (SELECT * FROM actual_policy_inventory EXCEPT SELECT * FROM expected_policy_inventory)
    UNION ALL
    (SELECT * FROM expected_policy_inventory EXCEPT SELECT * FROM actual_policy_inventory)
  )
)::text;
")"
  [ "$ok" = "true" ] || {
    echo "FATAL: SaaS billing foundation exact grants/RLS inventory did not take effect." >&2
    echo "       Expected organization-scoped app_clinic_billing SELECT plus account/subscription/invoice INSERT+UPDATE," >&2
    echo "       the dedicated seam-owner subscription read," >&2
    echo "       0344 organization-scoped app_staff SELECT+UPDATE on subscriptions/invoices and" >&2
    echo "       SELECT+INSERT+UPDATE on provider_events only (no app_staff ACL on accounts)," >&2
    echo "       platform SELECT/INSERT/UPDATE, exact policies," >&2
    echo "       signed-context install/current-org/release helpers, no additional policies," >&2
    echo "       and ENABLE+FORCE RLS on all four tables." >&2
    exit 1
  }
  echo "   SaaS billing foundation exact grants/RLS inventory: OK"
}

assert_db_owner_and_telemetry_owner_secdef_anon_surface_pinned(){
  # A-1 stage 1 (night plan 2026-07-26, taskdb): additive-only whole-class gate, sibling to
  # assert_app_owner_secdef_table_grants_complete right above -- same idiom, same closure position,
  # different owners. That gate pins ONLY app_owner's SECURITY DEFINER surface. But app_owner is not
  # the only role that owns a SECURITY DEFINER function the anonymous/bootstrap login role
  # (DATABASE_URL_NONSTAFF) can execute -- two more roles do, and until this gate neither was pinned
  # by anything: $DB itself (the DB-owner role, which also owns every ordinary application table) and
  # saas_telemetry_owner (one accessor). Read-only, runs after every mutating overlay/restart above
  # (identical position to the app_owner gate), so a FATAL here never leaves TEST half-configured.
  # This is stage 1 of 3 -- additive count + grant pin only. Stage 2 (owner split) and stage 3
  # (structural allowlist gate) are separate, later, not this change.
  #
  # Numbers re-measured live against bersoncarebot_test 2026-07-26, not inherited from the plan --
  # the plan's own numbers had already been corrected once. Two of the inherited figures did not
  # reproduce and are recorded here rather than silently used: 118 total SECURITY DEFINER functions
  # (not 115), 48 anon-reachable by the bootstrap role or PUBLIC (not 46) -- 19 owned by app_owner
  # (a different count from its sibling gate's 58-total pin, which counts ALL of app_owner's secdef
  # functions, not just the anon-reachable subset; that gap is the sibling gate's business, not this
  # one's), 28 owned by $DB, 1 by saas_telemetry_owner. 19+28+1 = 48. The two figures that DID
  # reproduce exactly, unprompted, are the ones this gate pins: 28 and 1.
  local nonstaff_role
  nonstaff_role="$(discover_webapp_bootstrap_base_role)"
  validate_pg_identifier "webapp.test bootstrap DATABASE_URL_NONSTAFF/DATABASE_URL role" "$nonstaff_role"

  # (a) explicit required-privilege set for the 7 tables the 28 $DB-owned functions read/write, read
  # out of each function body (not guessed), mirroring the app_owner VALUES-list shape above.
  # INSERT ... ON CONFLICT DO UPDATE counts as needing UPDATE too (email_send_cooldowns).
  # $DB owns these 7 tables outright, so has_table_privilege is true today by ownership alone -- but
  # ownership does not stop an explicit REVOKE from taking a privilege away from its own owner, and a
  # silent REVOKE-without-a-committed-file is exactly the class the sibling gate above exists to
  # catch for app_owner. This is the same class for $DB.
  # Settle-with-retry: same closure-transient class recorded against the sibling app_owner-secdef
  # gate directly above (taskdb open, cause unattributed, no code bug found -- a genuinely-granted
  # privilege read back missing once, seconds before it read back present with no GRANT applied in
  # between). This gate runs at the identical point in the sequence, so is equally exposed. The retry
  # only absorbs a one-off blip; it does not run longer than 3 attempts, and a PERSISTENT gap still
  # FATALs below -- see the throwaway-DB proof for this change, which reproduces a real, non-transient
  # violation and confirms it survives the retry.
  local missing="" _db_owner_secdef_attempt
  for _db_owner_secdef_attempt in 1 2 3; do
    missing="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
WITH required(tbl, priv) AS (
  VALUES
    ('public.platform_users', 'SELECT'),
    ('public.platform_users', 'INSERT'),
    ('public.platform_users', 'UPDATE'),
    ('public.platform_users', 'DELETE'),
    ('public.email_challenges', 'SELECT'),
    ('public.email_challenges', 'INSERT'),
    ('public.email_challenges', 'UPDATE'),
    ('public.email_challenges', 'DELETE'),
    ('public.email_send_cooldowns', 'SELECT'),
    ('public.email_send_cooldowns', 'INSERT'),
    ('public.email_send_cooldowns', 'UPDATE'),
    ('public.specialist_signup_intents', 'SELECT'),
    ('public.specialist_signup_intents', 'INSERT'),
    ('public.user_password_credentials', 'SELECT'),
    ('public.user_password_credentials', 'INSERT'),
    ('public.user_oauth_bindings', 'SELECT'),
    ('public.system_settings', 'SELECT')
)
SELECT coalesce(string_agg(tbl || ' ' || priv, ', ' ORDER BY tbl, priv), '')
FROM required
WHERE NOT has_table_privilege('$DB', tbl, priv);
")"
    [ -z "$missing" ] && break
    sleep 2
  done
  [ -z "$missing" ] || {
    echo "FATAL: $DB is missing required table privilege(s) on tables it owns: $missing" >&2
    echo "       $DB owns these 7 tables -- a missing privilege here means an explicit REVOKE" >&2
    echo "       against its own owner, not a missing GRANT. Find and remove whatever REVOKE'd it." >&2
    exit 1
  }

  # (b) pin the anon-reachable SECURITY DEFINER count owned by $DB and by saas_telemetry_owner.
  # Anti-drift, same idiom as expected_secdef_count above: a new anon-reachable SECURITY DEFINER
  # function owned by either role must be reviewed for its own table grants (added to (a) above)
  # before this constant is bumped.
  #
  # Re-measured live 2026-07-26 after fixing the D3.4-ordering bug (see grant_webapp_bootstrap_base_login_d3_4's
  # two call sites above): 28 (baseline, pinned by commit 9b40d74e9, before that day's migrations
  # 0247-0250) + 1 = 29. The +1 is app.email_auth_set_email_challenge_purpose(uuid,text), a genuinely
  # NEW $DB-owned function added by migration 0249 (email_challenge_purpose_binding) and reachable by
  # the bootstrap role via D3.4 (same WHERE-guarded grant as its email_auth_* siblings) -- it only
  # touches public.email_challenges UPDATE, already covered by the required-privilege set in (a), so
  # no new row was needed there. Migration 0247's rename (email_auth_update_email_challenge_attempts
  # -> email_auth_increment_email_challenge_attempts) is a net-zero 1-for-1 swap, both $DB-owned and
  # both D3.4-granted. Migration 0248's three new functions (email_auth_find/register/reset_email_otp_lock)
  # are owned by app_owner, not $DB, so they do not count here. Migration 0250 re-scopes an
  # app_owner-owned function (read_platform_media_row) down to app_staff -- also not $DB-owned, also
  # not counted here. Confirmed directly: querying pg_proc for $DB-owned prosecdef functions with
  # EXECUTE granted to the bootstrap role or PUBLIC returns exactly 29 rows post-closure.
  #
  # An earlier, discarded edit set this same constant to 29 with a false justification ("D3.4 heals
  # it on the next closure run" -- it does not; before the two-call fix above it ran once, early, and
  # the four email_auth_find_* functions stayed unreachable through the whole closure). That the
  # number lands on 29 here too is coincidence, not vindication: this value is arrived at by
  # measurement after the real ordering fix, with the arithmetic above, not by guessing a constant
  # that would make the gate pass.
  #
  # 29 -> 21 (2026-08-04, wt/overlay-owner, eaafe46d9 + this deploy): the login-fix overlay-ownership
  # regression fix (assert_login_fix_definer_owners_pinned above) moves exactly 8 of migration 0356's
  # fifteen functions OFF $DB ownership for good. Before the fix, organization-member-invites-rls.sql
  # and specialist-signup-public-bootstrap-rls.sql DROP+CREATE'd them back onto $DB (the migrator
  # role) on every single deploy; they are now pinned to app_owner instead:
  #   app.email_otp_public_find_user_by_email(text), app.email_otp_public_find_or_create_user(text),
  #   app.email_otp_public_register_patient(text,text,text,text),
  #   app.email_otp_public_delete_unverified_registration(uuid), app.email_auth_verify_user_email(uuid,text),
  #   app.email_password_register_pending(text,text,text,text,text,text),
  #   app.email_password_delete_unverified_registration(uuid), app.email_password_find_login_candidate(text).
  # All eight were bootstrap-role-reachable (anon-reachable) $DB-owned functions counted in the old 29
  # baseline; none of app_owner's fourteen net-new functions (see the app_owner secdef-count gate's
  # 162 -> 176 entry) are $DB-owned, so this delta is exactly -8. 29 - 8 = 21, matching measured
  # actual=21.
  #
  # 21 -> 21 (2026-08-04, #987 D27-C durable delivery): UNCHANGED, deliberately. The first attempt at
  # this bump set 22 for app.email_auth_enqueue_otp_delivery(uuid,uuid), accepting that the closure
  # overlay re-pinned it from app_owner (set by migration 0370) to the migrator role. The overlay was
  # corrected instead: the function is app_owner-owned, so it never enters this class. Growing this
  # number is not book-keeping -- the open owner-plan item A-1 stage 2/3 is "the DB-owner role must own
  # zero anon-reachable definers", and every increment here moves away from it. If a future change
  # really must add one, it needs a stated reason for why that function cannot be app_owner-owned.
  local expected_db_owner_anon_secdef=21
  local expected_telemetry_owner_anon_secdef=1
  local actual_db_owner_anon_secdef actual_telemetry_owner_anon_secdef
  for _db_owner_secdef_attempt in 1 2 3; do
    actual_db_owner_anon_secdef="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
SELECT count(*) FROM pg_proc p
WHERE p.prosecdef AND pg_get_userbyid(p.proowner) = '$DB'
  AND (has_function_privilege('$nonstaff_role', p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));
")"
    actual_telemetry_owner_anon_secdef="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
SELECT count(*) FROM pg_proc p
WHERE p.prosecdef AND pg_get_userbyid(p.proowner) = 'saas_telemetry_owner'
  AND (has_function_privilege('$nonstaff_role', p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));
")"
    [ "$actual_db_owner_anon_secdef" = "$expected_db_owner_anon_secdef" ] \
      && [ "$actual_telemetry_owner_anon_secdef" = "$expected_telemetry_owner_anon_secdef" ] \
      && break
    sleep 2
  done
  [ "$actual_db_owner_anon_secdef" = "$expected_db_owner_anon_secdef" ] || {
    echo "FATAL: $DB now owns $actual_db_owner_anon_secdef anon-reachable SECURITY DEFINER functions, expected exactly $expected_db_owner_anon_secdef." >&2
    echo "       A new anon-reachable $DB-owned SECURITY DEFINER function was added (or one was removed" >&2
    echo "       or reassigned) without review -- check its body for every table it reads/writes, extend" >&2
    echo "       the required-privilege set above, and only then bump this constant." >&2
    exit 1
  }
  [ "$actual_telemetry_owner_anon_secdef" = "$expected_telemetry_owner_anon_secdef" ] || {
    echo "FATAL: saas_telemetry_owner now owns $actual_telemetry_owner_anon_secdef anon-reachable SECURITY DEFINER functions, expected exactly $expected_telemetry_owner_anon_secdef." >&2
    exit 1
  }

  echo "   $DB + saas_telemetry_owner SECURITY DEFINER anon-reachable surface: OK (17 required table privileges present, $actual_db_owner_anon_secdef/$expected_db_owner_anon_secdef $DB + $actual_telemetry_owner_anon_secdef/$expected_telemetry_owner_anon_secdef saas_telemetry_owner, bootstrap role $nonstaff_role)"
}

mark_e1_runtime_coverage_start(){
  E1_RUNTIME_COVERAGE_STARTED_AT="$(node -e 'process.stdout.write(new Date().toISOString())')"
}

run_e1_post_runtime_coverage_gate(){
  [ -n "$E1_RUNTIME_COVERAGE_STARTED_AT" ] || {
    echo "FATAL: E1 runtime coverage start was not recorded before TEST restart" >&2
    exit 1
  }
  # Coverage represents the five active runtime-unit checks, the health probe,
  # the nginx preflight, and both locked product-smoke runs. The product smoke
  # includes Global Admin System Health, which reads the cron-family health.
  # Runtime reporters have a 250 ms bounded write; allow those smoke-triggered
  # writes to settle before the authoritative pre-coverage read.
  sleep 1
  # TEST-only softening (owner 2026-07-18, var B): this is a DIAGNOSTIC/observability gate, NOT the
  # wall enforcement — FORCE-RLS is asserted separately above and stays hard. On TEST a single benign
  # transient must NOT fail-closed and take down the demo env; warn loudly and continue. Prod deploy
  # scripts never call this closure, so prod strictness is unaffected.
  if sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \
    pnpm --dir apps/webapp run diagnostics:saas-isolation -- post-runtime-gate \
      --started-at '$E1_RUNTIME_COVERAGE_STARTED_AT' --checks 9"; then
    echo "   E1 post-runtime coverage/read gate: OK"
  else
    echo "   ⚠️  WARN [TEST]: E1 isolation post-runtime gate did NOT pass — TEST deploy CONTINUES (env stays up)." >&2
    echo "   ⚠️  FORCE-RLS wall assertion above stays hard; this gate is diagnostic-only on TEST." >&2
    echo "   ⚠️  Triage:  (as deploy, webapp.test env)  pnpm --dir apps/webapp run diagnostics:saas-isolation -- read" >&2
    echo "   ⚠️  Resolve once triaged benign:  ... diagnostics:saas-isolation -- coverage --id <uuid> --status complete --started-at <after last_seen> --finished-at <now> --services cron,integrator,media_worker,scheduler,webapp,worker --checks 9 --unexpected 0" >&2
  fi
}

run_owner_ready_locked_db_matrix(){
  # Same retired-fixture dependency as the patient capability gate — see demo_isolation_fixtures_present.
  if ! demo_isolation_fixtures_present; then
    skip_because_demo_fixtures_retired "owner-ready locked DB matrix"
    return 0
  fi
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v test_expected_database="$DB" \
    -v matrix_staff_role="$P2_B_STAFF_ROLE" \
    -v matrix_patient_role="$P2_B_PATIENT_ROLE" \
    -f "$DEPLOY_REPO/$OWNER_READY_LOCKED_MATRIX"
}

# ── Retired S3 demo-fixture dependency (single chokepoint, added 2026-07-25) ──────────────────────
# Two closure steps (the locked patient identity capability gate and the owner-ready locked DB matrix)
# assert tenant isolation against the S3 demo clinics A/B, whose UUIDs they hardcode. Owner ruling
# 2026-07-25 retired those demo fixtures ("они были нужны для проверки стен когда их ставили") and their
# seed step was removed from this closure, so on a from-zero run both steps have nothing to assert against
# and abort the closure with a fail-closed division-by-zero. Both now consult this one predicate: run
# UNCHANGED (same strictness, still fatal) whenever the fixtures are present, skip loudly when they are not.
# The tenant walls themselves remain asserted by the strict+FORCE finalizer and the reversible SaaS
# isolation scenario proof, which do not depend on these fixtures.
demo_isolation_fixtures_present(){
  local present
  present="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "
    SELECT (
      EXISTS (SELECT 1 FROM public.be_organizations WHERE id = '53000000-0000-4000-8000-0000000000a1')
      AND EXISTS (SELECT 1 FROM public.be_organizations WHERE id = '53000000-0000-4000-8000-0000000000b1')
      AND EXISTS (SELECT 1 FROM public.platform_users WHERE id = '53000000-0000-4000-8000-00000000a101')
      AND EXISTS (SELECT 1 FROM public.platform_users WHERE id = '53000000-0000-4000-8000-00000000a201')
    )::text")"
  [ "$present" = "true" ]
}

skip_because_demo_fixtures_retired(){
  echo "   SKIPPED: $1 — S3 demo clinic fixtures are retired (owner ruling 2026-07-25)."
  echo "            Tenant/patient wall enforcement is still asserted by the strict+FORCE finalizer and the"
  echo "            reversible SaaS isolation scenario proof in this same closure."
}

run_test_patient_identity_capability_gate(){
  local runtime_login_role
  runtime_login_role="$(discover_webapp_bootstrap_base_role)"
  validate_pg_identifier "patient identity runtime login role" "$runtime_login_role"

  if ! demo_isolation_fixtures_present; then
    skip_because_demo_fixtures_retired "locked patient identity capability gate"
    return 0
  fi

  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v patient_identity_runtime_login_role="$runtime_login_role" \
    -f "$DEPLOY_REPO/$TEST_PATIENT_IDENTITY_CAPABILITY_GATE"
}

run_b1_doctor_admin_identity_assertion(){
  if [ "${SAAS_B1_IDENTITY_ASSERTION_SKIP:-0}" = "1" ]; then
    echo "   B1 doctor/admin identity assertion: skipped (SAAS_B1_IDENTITY_ASSERTION_SKIP=1)"
    return 0
  fi

  sudo -u postgres env \
    DATABASE_URL="postgresql:///$DB?host=/var/run/postgresql" \
    bash -c "cd '$DEPLOY_REPO' && node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs \
      --execute \
      --allow-test-target \
      --required-current-user=postgres \
      --database-url \"\$DATABASE_URL\""
}

assert_test_units_active(){
  local u unit
  for u in "${UNITS[@]}"; do
    unit="bersoncarebot-$u-test"
    systemctl is-active --quiet "$unit" || { echo "FATAL: $unit is not active" >&2; exit 1; }
    printf "   %-28s OK (active)\n" "$unit"
  done
}

install_and_assert_media_worker_test_unit(){
  sudo install -m 0644 "$DEPLOY_REPO/$MEDIA_WORKER_TEST_UNIT" /etc/systemd/system/bersoncarebot-media-worker-test.service
  sudo systemctl daemon-reload
  local effective_fragment_path effective_environment_files effective_working_directory effective_user effective_group
  effective_fragment_path="$(systemctl show bersoncarebot-media-worker-test.service -p FragmentPath --value)"
  effective_environment_files="$(systemctl show bersoncarebot-media-worker-test.service -p EnvironmentFiles --value)"
  effective_working_directory="$(systemctl show bersoncarebot-media-worker-test.service -p WorkingDirectory --value)"
  effective_user="$(systemctl show bersoncarebot-media-worker-test.service -p User --value)"
  effective_group="$(systemctl show bersoncarebot-media-worker-test.service -p Group --value)"
  bash "$DEPLOY_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION" --validate \
    "$effective_fragment_path" "$effective_environment_files" "$effective_working_directory" \
    "$effective_user" "$effective_group"
}

assert_webapp_test_staff_security_keyring_available(){
  sudo -u deploy test -r "$WEBAPP_ENV" || {
    echo "FATAL: deploy cannot read $WEBAPP_ENV before staff-security keyring preflight" >&2
    exit 1
  }
  # TOTP start first touches this keyring only after its DB profile/accessor calls succeed. Before
  # this gate an absent or malformed TEST keyring reached createLazyStaffSecurityCryptoFromEnv() at
  # request time and produced an unhandled 500. Validate shape and active 32-byte key without ever
  # printing the env value, key id, key material, or parsed object.
  sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && node -e '
    const raw = process.env.STAFF_SECURITY_KEYRING_JSON;
    if (!raw || !raw.trim()) process.exit(2);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { process.exit(3); }
    if (!parsed || typeof parsed !== \"object\" || Array.isArray(parsed)) process.exit(4);
    if (typeof parsed.activeKeyId !== \"string\" || !/^[a-zA-Z0-9_-]{1,48}$/.test(parsed.activeKeyId)) process.exit(5);
    if (!parsed.keys || typeof parsed.keys !== \"object\" || Array.isArray(parsed.keys)) process.exit(6);
    const entries = Object.entries(parsed.keys);
    if (entries.length === 0 || entries.some(([keyId, encoded]) =>
      !/^[a-zA-Z0-9_-]{1,48}$/.test(keyId) ||
      typeof encoded !== \"string\" ||
      Buffer.from(encoded, \"base64\").length !== 32
    )) process.exit(7);
    if (!Object.prototype.hasOwnProperty.call(parsed.keys, parsed.activeKeyId)) process.exit(8);
  '" || {
    echo "FATAL: webapp TEST STAFF_SECURITY_KEYRING_JSON is missing or invalid" >&2
    echo "       Install a valid protected TEST keyring before deploying; its value must never enter the repo or logs." >&2
    exit 1
  }
  echo "   webapp TEST staff-security keyring: OK (valid shape + active 32-byte key; value not printed)"
}

assert_staff_security_self_runtime_acl_ready(){
  local ready
  # The account-security guard deliberately has no clinic membership: it stamps the exact session
  # platform_user_id as a patient/self principal. The routed pool therefore uses the nonstaff base
  # login and SET ROLE app_patient. Exercise that exact transport/role transition here, then pin
  # only the account-security functions needed before/during TOTP start and PIN self-service:
  #   - get_staff_security_session_state: reads the caller's profile during session resolution;
  #   - ensure_staff_security_profile: inserts the exact signed self row when absent;
  #   - get_staff_security_profile: reads only that self row;
  #   - save_pending_staff_totp: writes only that row's encrypted pending factor secret.
  #   - auth_user_pin_read_self/auth_user_pin_upsert_self: read/write only the signed user's PIN row
  #     and accept no target UUID. The old UUID accessors remain bootstrap-login-only.
  # All are table-owner SECURITY DEFINER functions from migrations/the canonical overlay. This gate
  # verifies their exact runtime reachability; it does not grant privileges itself.
  ready="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && db_url=\"\${DATABASE_URL_NONSTAFF:-\${DATABASE_URL:-}}\" && [ -n \"\$db_url\" ] && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"
RESET ROLE;
SET ROLE app_patient;
SELECT (
  current_user = 'app_patient'
  AND has_schema_privilege(current_user, 'app', 'USAGE')
  AND has_function_privilege(current_user, 'app.get_staff_security_session_state()', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.ensure_staff_security_profile()', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.get_staff_security_profile()', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.save_pending_staff_totp(text)', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.auth_user_pin_read_self()', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.auth_user_pin_upsert_self(text)', 'EXECUTE')
  AND NOT has_function_privilege(current_user, 'app.auth_user_pin_read(uuid)', 'EXECUTE')
  AND NOT has_function_privilege(current_user, 'app.auth_user_pin_upsert(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege(current_user, 'app.auth_user_pin_increment_failed(uuid)', 'EXECUTE')
  AND NOT has_function_privilege(current_user, 'app.auth_user_pin_reset_attempts(uuid)', 'EXECUTE')
  AND NOT has_table_privilege(
    current_user,
    'public.staff_security_profiles',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  AND NOT has_any_column_privilege(
    current_user,
    'public.staff_security_profiles',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
  AND NOT has_table_privilege(
    current_user,
    'public.user_pins',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  AND NOT has_any_column_privilege(
    current_user,
    'public.user_pins',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
)::text;
\"" | tail -n 1)"
  # `psql -tAc` with a multi-statement string also echoes the RESET/SET command tags, so the raw capture
  # is "RESET\nSET\ntrue" and the equality below never matched. This gate was written but never run live
  # (its author could not reach the DB from the sandbox); the first real deploy exposed it. Take the last
  # line — the SELECT result — and keep comparing exactly, not with a substring match.
  [ "$ready" = "true" ] || {
    echo "FATAL: webapp TEST account-security self runtime ACL is not exact" >&2
    echo "       Expected nonstaff login -> SET ROLE app_patient -> narrow TOTP/PIN self functions, no target-UUID PIN functions, and no vault/PIN table privilege." >&2
    exit 1
  }
  echo "   account-security self runtime ACL: OK (target-free PIN self access; vault/PIN tables invisible)"
}

assert_test_health_ok(){
  local health_response
  health_response="$(curl -fsk --max-time 10 https://test.bersoncare.ru/api/health)"
  [[ "$health_response" == *'"ok":true'* ]] || { echo "FATAL: health response missing ok=true: $health_response" >&2; exit 1; }
  [[ "$health_response" == *'"db":"up"'* ]] || { echo "FATAL: health response missing db=up: $health_response" >&2; exit 1; }
  echo "   health: OK ($health_response)"
}

# Run a post-health closure gate WITHOUT letting it take TEST down.
#
# Why this exists (owner outage, 2026-07-26): the owner ran an ordinary code-only deploy, one of the
# gates after the unit restart went red, and cleanup_exit's unit-stop branch killed all five TEST
# units and left them down. He found a dead environment. The same class had already been fixed once
# for the product-smoke gate alone (0d138fc94) — but SEVEN other gates after the restart still aborted
# the same way, so the fix covered one instance of the class instead of the class.
#
# Everything after assert_test_health_ok is a VERIFICATION, not a step that can leave TEST
# half-migrated: the migration window is closed, elevation is cleaned up, and the units are up and
# answering. A failure there means "this deploy is not trustworthy", which must be LOUD — it does not
# mean "the environment must be destroyed". So: record, keep serving, exit red at the end.
#
# The gate runs in a subshell so its internal `exit 1` cannot terminate the closure.
run_closure_gate(){
  local label="$1"
  shift
  if ( "$@" ); then
    return 0
  fi
  CLOSURE_GATE_FAILURES+=("$label")
  echo "WARN: closure gate RED: $label — TEST units stay running; the deploy will exit red" >&2
  return 0
}

run_strict_post_migration_closure(){
  assert_test_writers_stopped
  assert_cleanup_elevation

  # B0.2 (#1057): refuse before any restart if the artifact retains a mock-payment surface.
  # Same gate as PROD (deploy-prod.sh, deploy-webapp-prod.sh); this single call covers both TEST entry points
  # (deploy-test.sh's --post-migration-closure and the full-reset flow) since both funnel through
  # this function before the restart below.
  log "strict closure: B0.2 mock-payment deploy gate"
  bash "$DEPLOY_REPO/deploy/host/assert-no-mock-payment-deploy.sh" "$DEPLOY_REPO"

  log "strict closure: roles + grants"
  install_p0_5b_runtime_wall
  log "strict closure: protected principal helpers"
  install_p2_b_protected_principal_context
  log "strict closure: reviewed runtime overlays"
  rehydrate_post_restore_runtime_overlays
  log "strict closure: SaaS isolation telemetry privilege overlay"
  provision_saas_isolation_operator_login
  install_saas_isolation_telemetry_overlay
  install_saas_isolation_telemetry_test_fixtures_overlay
  install_saas_system_health_diagnostics_overlay
  install_integrator_server_runtime_config_overlay
  log "strict closure: integrator login public identity grants"
  install_integrator_login_public_identity_grants_overlay
  log "strict closure: reversible SaaS isolation TEST scenario proof"
  run_saas_isolation_test_scenario_proof
  if [ "$P2_B_CONTEXT_INSTALLED" = "1" ]; then
    assert_api_runtime_can_release_principal_context
  fi
  # integrator migration ledger read: declared SECURITY DEFINER seam
  # app.read_integrator_migration_ledger() (deploy/postgres/privileges/declaration.ts) installs
  # and grants this now; no raw table GRANT here.

  # D3.4 first pass: apply/re-entrant-apply idiom (see the second, late-position call below), same
  # shape as apply_test_strict_rls_finalizer being called twice in this same closure. This early call
  # exists because phase4-force-rls-cutover.sql -- \ir'd from apply_test_strict_rls_finalizer just
  # below, both times it runs -- asserts the bootstrap/nonstaff login role already holds EXECUTE on
  # app.close_active_user_phone_history(uuid) and DML on user_phone_history/platform_user_contacts
  # (deploy/postgres/phase4-force-rls-cutover.sql:64-77), all of which only D3.4 grants. Discovered
  # 2026-07-26: moving the single D3.4 call to run only after both finalizer passes fixed the late
  # wipe (see the second call's comment) but opened this early gap -- the FIRST finalizer pass ran
  # phase4-force-rls-cutover.sql before D3.4 had granted anything, and its bare `1 / <bool>::int`
  # assertion idiom FATALs as a division-by-zero. Call it here too, matching the established
  # "apply, then re-apply after later overlays" pattern instead of relocating the single call.
  grant_webapp_bootstrap_base_login_d3_4

  log "strict closure: TEST settings override"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v test_settings_overlay_mode=code-only \
    -f "$DEPLOY_REPO/$OVERRIDE"

  log "strict closure: base policies -> safe specialized overlays -> exact FORCE assertions"
  apply_test_strict_rls_finalizer
  log "strict closure: C4 three-DB + media-control TEST env preflight and root provisioning"
  bootstrap_and_provision_c4_operational_runtime
  log "strict closure: declaration-owned port-context login roles"
  install_port_context_login_roles
  log "strict closure: declaration-owned port-context capability catalog"
  install_port_context_capability_catalog

  # SaaS TEST walkthrough demo-fixture seed removed 2026-07-24 (owner: the Clinic A/B demo data was
  # only needed to validate tenant walls during their setup; the walls are in place, and the
  # verification smokes below do not depend on it). The elevation-cleanup guard stays as a standing
  # safety assertion.
  assert_cleanup_elevation

  log "strict closure: locked patient identity capability gate"
  run_test_patient_identity_capability_gate

  log "strict closure: owner-ready locked DB matrix (transactional)"
  run_owner_ready_locked_db_matrix
  log "strict closure: post-matrix exact strict + FORCE reassertion"
  apply_test_strict_rls_finalizer
  reapply_c4_operational_runtime_overlays

  # D3.4 second pass: must be the LAST writer of the bootstrap/nonstaff login's ACLs before anything
  # reads them. Added 2026-07-26, alongside the pre-existing early call above (D3.4 was NOT relocated
  # -- an earlier attempt that moved the single call here broke the early call's own reason for
  # existing, see its comment). apply_test_strict_rls_finalizer runs twice in this closure (once
  # above, once again here) and \ir's deploy/postgres/organization-member-invites-rls.sql, which
  # DROP+CREATEs four of the app.email_auth_find_* functions D3.4 grants -- a DROP+CREATE resets the
  # OID and therefore the ACL, silently wiping D3.4's grant every time the finalizer re-runs. With
  # only the early call, those four functions were unreachable by the login role after every closure;
  # the DB-owner/telemetry-owner SECURITY DEFINER anon-surface gate below caught the resulting
  # missing-grant count. D3.4 is re-entrant by design (see the file header:
  # `-v d3_4_bootstrap_grants_down=1` rollback) and the closure already uses exactly this
  # "apply, then re-apply after later overlays" idiom for apply_test_strict_rls_finalizer (called
  # twice) and reapply_c4_operational_runtime_overlays -- this follows the same established pattern.
  # Nothing between here and the read-only gates below needs these grants already in place: the
  # remaining steps up to the restart run as postgres superuser via direct psql, and every
  # HTTP-facing smoke that exercises the login role's email-auth surface runs later, after the TEST
  # units are restarted below.
  grant_webapp_bootstrap_base_login_d3_4
  assert_staff_security_self_runtime_acl_ready

  assert_c4_operational_runtime_ready --database-only
  assert_integrator_server_runtime_config_ready

  log "strict closure: restart locked TEST API/worker/scheduler/webapp before media control probe"
  install_and_assert_media_worker_test_unit
  mark_e1_runtime_coverage_start
  for unit_name in api worker scheduler webapp; do
    sudo systemctl restart "bersoncarebot-$unit_name-test"
  done
  run_media_control_cutover_sequence
  sleep 4
  assert_test_units_active
  assert_test_health_ok

  # TEST is up, healthy and answering from here on. Release it BEFORE the verification gates run, so
  # that no red gate below can reach cleanup_exit's unit-stop branch. See run_closure_gate.
  SERVICES_RELEASED=1

  log "A2 nginx forwarded-host preflight"
  run_closure_gate "A2 nginx config apply" apply_test_nginx_webapp_config
  run_closure_gate "A2 nginx forwarded-host preflight" run_a2_nginx_preflight
  log "U3S specialist signup/provisioning smoke (private cluster, mandatory)"
  run_closure_gate "U3S specialist signup/provisioning smoke" run_specialist_signup_provisioning_smoke
  log "specialist-owner provisioning seam pin (retired role + be_organizations FORCE RLS)"
  run_closure_gate "specialist-owner provisioning seam pin" assert_specialist_owner_provisioning_seam_pinned
  log "login-fix (0356/0357) definer owners pinned to app_seam_*_owner roles (2026-08-04 overlay-revert regression)"
  run_closure_gate "login-fix definer owners pinned" assert_login_fix_definer_owners_pinned
  log "SECURITY DEFINER seam-owner closure (retired app_owner excluded)"
  run_closure_gate "SECURITY DEFINER seam-owner closure" assert_security_definer_seam_owners_complete
  log "clinical_test_measure_kinds write-lock closure pin (H-7 / #1040, detects a guarded skip)"
  run_closure_gate "clinical_test_measure_kinds write-lock closure" assert_c5a_clinical_test_measure_kinds_closure
  log "platform organization-members directory exact ACL (#1068 / owner D-5)"
  run_closure_gate "platform organization-members directory exact ACL" assert_c5a_platform_organization_members_closure
  log "enforced quota usage exact ACL/policy (#1069 / §10.1-10.2)"
  run_closure_gate "enforced quota usage exact ACL/policy" assert_c5a_enforced_quota_usage_closure
  log "SaaS billing foundation exact grants/RLS inventory"
  run_closure_gate "SaaS billing foundation exact grants/RLS inventory" assert_c5a_saas_billing_foundation_closure
  log "DB-owner + telemetry-owner SECURITY DEFINER anon-reachable surface (A-1 stage 1, whole-class gate)"
  run_closure_gate "DB-owner + telemetry-owner SECURITY DEFINER anon-reachable surface" assert_db_owner_and_telemetry_owner_secdef_anon_surface_pinned
  log "E1 post-runtime coverage/read gate"
  run_closure_gate "E1 post-runtime coverage/read gate" run_e1_post_runtime_coverage_gate
  if [ "${#CLOSURE_GATE_FAILURES[@]}" -gt 0 ]; then
    echo "FATAL: ${#CLOSURE_GATE_FAILURES[@]} post-health closure gate(s) RED:" >&2
    printf '  - %s\n' "${CLOSURE_GATE_FAILURES[@]}" >&2
    echo "TEST units are left RUNNING and healthy. This is a GATE failure, not an outage — the deploy is not trustworthy, but the environment is up." >&2
    exit "$CLOSURE_GATE_RED_EXIT"
  fi
}

assert_strict_closure_deploy_checkout_ready(){
  local required_path
  for required_path in \
    "$OVERRIDE" "$P0_5B_ROLES" "$P0_5B_GRANTS" "$P2_B_CONTEXT" \
    "$ORGANIZATION_MEMBER_INVITES_RLS" "$PATIENT_INVITES_RLS" "$STORE_P0_ENTITLEMENTS_RLS" "$PATIENT_COURSE_WALL" \
    "$PUBLIC_BOOTSTRAP_RLS" "$SPECIALIST_OWNER_PROVISIONING_RLS" "$REFERENCE_CATALOG_RLS" "$PATIENT_VISIBLE_CATALOG_RLS" \
    "$PATIENT_VAPID_ACCESSOR" "$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" "$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER" \
    "$D3_4_BOOTSTRAP_GRANTS" "$TEST_STRICT_RLS_FINALIZER" \
    "$TEST_PATIENT_IDENTITY_CAPABILITY_GATE" \
    "$SAAS_ISOLATION_TELEMETRY" "$SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES" "$SAAS_SYSTEM_HEALTH_DIAGNOSTICS" "$INTEGRATOR_SERVER_RUNTIME_CONFIG" \
    "$C4_OPERATIONAL_RUNTIME" "$C4_OPERATIONAL_PROVISIONER" "$C4_OPERATIONAL_READINESS" \
    "$C4_MEDIA_CONTROL_CUTOVER" "$C4_MEDIA_LOGIN_RETIREMENT" \
    "$C4_OPERATIONAL_PASSWORD_SETTER" "$C4_OPERATIONAL_PASSWORD_SMOKE" "$PORT_CONTEXT_CAPABILITY_SEED" \
    "$SAAS_ISOLATION_OPERATOR_PROVISIONER" "$OWNER_READY_LOCKED_MATRIX" \
    deploy/postgres/phase4-app-worker-narrow-rls.sql; do
    sudo -u deploy test -r "$DEPLOY_REPO/$required_path" || {
      echo "FATAL: deploy cannot read strict closure artifact: $DEPLOY_REPO/$required_path" >&2
      exit 1
    }
  done
  bootstrap_test_env_preflight "$DEPLOY_REPO"
  for env_file in "$API_ENV" "$WEBAPP_ENV"; do
    sudo -u deploy test -r "$env_file" || { echo "FATAL: deploy cannot read required env file: $env_file" >&2; exit 1; }
  done
  if [ -e "$MEDIA_WORKER_ENV" ]; then
    sudo -u deploy test -r "$MEDIA_WORKER_ENV" || {
      echo "FATAL: existing media-worker TEST env is not readable by deploy: $MEDIA_WORKER_ENV" >&2
      exit 1
    }
  fi
  assert_webapp_test_staff_security_keyring_available
  assert_test_runtime_mode_ready
}

run_strict_closure_catalog_self_test(){
  local catalog_probe_status
  set +e
  (
    set -e
    P2_B_CONTEXT_INSTALLED=0
    for function_name in \
      assert_test_writers_stopped assert_cleanup_elevation log bash \
      install_p0_5b_runtime_wall install_p2_b_protected_principal_context \
      rehydrate_post_restore_runtime_overlays provision_saas_isolation_operator_login \
      install_saas_isolation_telemetry_overlay \
      install_saas_isolation_telemetry_test_fixtures_overlay \
      install_saas_system_health_diagnostics_overlay \
      install_integrator_server_runtime_config_overlay \
      install_integrator_login_public_identity_grants_overlay \
      run_saas_isolation_test_scenario_proof grant_webapp_bootstrap_base_login_d3_4 \
      sudo apply_test_strict_rls_finalizer bootstrap_and_provision_c4_operational_runtime \
      install_port_context_login_roles; do
      eval "$function_name(){ :; }"
    done
    install_port_context_capability_catalog(){ return 73; }
    # This is the first call after the catalog install. It makes a removed catalog call
    # fail safely and deterministically instead of reaching any live TEST operation.
    run_test_patient_identity_capability_gate(){ return 74; }
    run_strict_post_migration_closure
  )
  catalog_probe_status=$?
  set -e
  [ "$catalog_probe_status" = "73" ] || {
    echo "FATAL: shared strict closure did not invoke install_port_context_capability_catalog at the required point (status=$catalog_probe_status)" >&2
    exit 1
  }
  echo "shared strict TEST closure catalog self-test: OK (no env/DB/service/cron mutation)"
}

resolve_c4_self_test_repo_file(){
  local self_test_repo_root="$1" relative_path="$2" requested_path resolved_path
  case "$relative_path" in
    /*|..|../*|*/../*|*/..)
      echo "FATAL: unsafe C4 self-test repository path: $relative_path" >&2
      return 1
      ;;
  esac
  requested_path="$self_test_repo_root/$relative_path"
  resolved_path="$(realpath "$requested_path")"
  if [[ ! -f "$requested_path" || -L "$requested_path" || "$resolved_path" != "$self_test_repo_root/"* ]]; then
    echo "FATAL: C4 self-test artifact escaped current checkout: $relative_path" >&2
    return 1
  fi
  printf '%s\n' "$resolved_path"
}

run_c4_operational_chain_self_test(){
  local self_test_repo_root self_test_deploy_script self_test_provisioner self_test_readiness
  local self_test_media_cutover self_test_media_retirement self_test_password_smoke
  local self_test_bootstrap self_test_secret_preflight self_test_retirement_test
  self_test_repo_root="$(realpath "$DEPLOY_TEST_SAAS_SCRIPT_DIR/../..")"
  self_test_deploy_script="$(resolve_c4_self_test_repo_file "$self_test_repo_root" deploy/host/deploy-test-saas.sh)"
  [ "$self_test_deploy_script" = "$(realpath "${BASH_SOURCE[0]}")" ] || {
    echo "FATAL: C4 self-test is not bound to the executing checkout" >&2
    exit 1
  }
  self_test_provisioner="$(resolve_c4_self_test_repo_file "$self_test_repo_root" "$C4_OPERATIONAL_PROVISIONER")"
  self_test_readiness="$(resolve_c4_self_test_repo_file "$self_test_repo_root" "$C4_OPERATIONAL_READINESS")"
  self_test_media_cutover="$(resolve_c4_self_test_repo_file "$self_test_repo_root" "$C4_MEDIA_CONTROL_CUTOVER")"
  self_test_media_retirement="$(resolve_c4_self_test_repo_file "$self_test_repo_root" "$C4_MEDIA_LOGIN_RETIREMENT")"
  self_test_password_smoke="$(resolve_c4_self_test_repo_file "$self_test_repo_root" "$C4_OPERATIONAL_PASSWORD_SMOKE")"
  self_test_bootstrap="$(resolve_c4_self_test_repo_file "$self_test_repo_root" deploy/host/bootstrap-c4-test-env.mjs)"
  self_test_secret_preflight="$(resolve_c4_self_test_repo_file "$self_test_repo_root" deploy/host/saas-c2-secret-preflight.mjs)"
  self_test_retirement_test="$(resolve_c4_self_test_repo_file "$self_test_repo_root" deploy/host/retire-media-db-login.test.mjs)"
  run_strict_closure_catalog_self_test
  bash -n "$self_test_deploy_script" "$self_test_provisioner" "$self_test_readiness" \
    "$self_test_media_cutover" "$self_test_media_retirement"
  bash "$self_test_media_cutover" --self-test
  bash "$self_test_provisioner" --self-test
  bash "$self_test_password_smoke"
  node "$self_test_bootstrap" --self-test
  node "$self_test_secret_preflight" --self-test
  node "$self_test_retirement_test"
  echo "C4 canonical fresh wrapper segment + shared catalog closure self-test: OK (checkout=$self_test_repo_root; no env/DB/service/cron mutation)"
}

full_reset_usage(){
  cat <<'EOF'
Usage:
  bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
    [--fio-manifest=/absolute/path/to/manifest.json] \
    [--fio-manifest-file-sha256=<sha256>] \
    [--fio-manifest-sha256=<sha256>] [--fio-review-source-sha256=<sha256>] \
    [--prepare-cutover-source-only] \
    [--cutover-dry-run] \
    [branch]

This command destroys and recreates bersoncarebot_test from a fresh production dump. It is only for an
owner-authorized full migration rehearsal. For ordinary code deploys use:
  bash deploy/host/deploy-test.sh [branch]

Protected FIO inputs default to
  /opt/env/bersoncarebot/protected-inputs/fio-owner-reviewed-test.manifest.json
with hashes read from the adjacent fio-owner-reviewed-test.sha256 sidecar. Explicit arguments override the
corresponding defaults. Protected files must be regular, non-symlink files owned by deploy with mode 0600.
Their hashes bind this run to the exact owner-reviewed inputs. No patient data is printed by this wrapper.

--prepare-cutover-source-only runs the complete hash-bound data stage and aggregate assertions, leaves
TEST writers stopped, and exits before schema migration. It never starts the historical migration runners.
--cutover-dry-run executes the complete A -> B transaction and all reports, rolls it back, then exits
before post-migration checks. The preceding TEST reset/data-preparation stages are unchanged.
EOF
}

read_fio_hash_sidecar_value(){
  local key="$1" count value
  count="$(sudo -u deploy awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$CANONICAL_FIO_HASH_SIDECAR")"
  [ "$count" = "1" ] || {
    echo "FATAL: protected FIO hash sidecar must contain exactly one $key entry: $CANONICAL_FIO_HASH_SIDECAR" >&2
    exit 2
  }
  value="$(sudo -u deploy awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' "$CANONICAL_FIO_HASH_SIDECAR")"
  printf '%s\n' "$value"
}

resolve_fio_protected_inputs(){
  local sidecar_owner_mode
  if [ -z "$FIO_MANIFEST" ]; then
    FIO_MANIFEST="$CANONICAL_FIO_MANIFEST"
  fi
  sudo -u deploy test -e "$FIO_MANIFEST" || {
    echo "FATAL: FIO manifest is missing: $FIO_MANIFEST" >&2
    exit 2
  }

  if [ -z "$FIO_MANIFEST_FILE_SHA256" ] || [ -z "$FIO_MANIFEST_SHA256" ] || [ -z "$FIO_REVIEW_SOURCE_SHA256" ]; then
    sudo -u deploy test -e "$CANONICAL_FIO_HASH_SIDECAR" || {
      echo "FATAL: protected FIO hash sidecar is missing: $CANONICAL_FIO_HASH_SIDECAR" >&2
      exit 2
    }
    sudo -u deploy test -f "$CANONICAL_FIO_HASH_SIDECAR" && sudo -u deploy test ! -L "$CANONICAL_FIO_HASH_SIDECAR" || {
      echo "FATAL: protected FIO hash sidecar must be a regular non-symlink file: $CANONICAL_FIO_HASH_SIDECAR" >&2
      exit 2
    }
    sidecar_owner_mode="$(sudo -u deploy stat -Lc '%U:%a' -- "$CANONICAL_FIO_HASH_SIDECAR")"
    [ "$sidecar_owner_mode" = "deploy:600" ] || {
      echo "FATAL: protected FIO hash sidecar must be owned by deploy with mode 0600 (got $sidecar_owner_mode): $CANONICAL_FIO_HASH_SIDECAR" >&2
      exit 2
    }
    if [ -z "$FIO_MANIFEST_FILE_SHA256" ]; then
      FIO_MANIFEST_FILE_SHA256="$(read_fio_hash_sidecar_value FIO_MANIFEST_FILE_SHA256)"
    fi
    if [ -z "$FIO_MANIFEST_SHA256" ]; then
      FIO_MANIFEST_SHA256="$(read_fio_hash_sidecar_value FIO_MANIFEST_SHA256)"
    fi
    if [ -z "$FIO_REVIEW_SOURCE_SHA256" ]; then
      FIO_REVIEW_SOURCE_SHA256="$(read_fio_hash_sidecar_value FIO_REVIEW_SOURCE_SHA256)"
    fi
  fi
  echo "   FIO manifest path: $FIO_MANIFEST"
  echo "   FIO hash inputs: resolved; explicit options override $CANONICAL_FIO_HASH_SIDECAR"
}

parse_full_reset_args(){
  local arg positional_seen=0
  for arg in "$@"; do
    case "$arg" in
      --confirm-full-reset) CONFIRM_FULL_RESET=1 ;;
      --prepare-cutover-source-only) PREPARE_CUTOVER_SOURCE_ONLY=1 ;;
      --cutover-dry-run) CUTOVER_MODE=dryrun ;;
      --fio-manifest=*) FIO_MANIFEST="${arg#*=}" ;;
      --fio-manifest-file-sha256=*) FIO_MANIFEST_FILE_SHA256="${arg#*=}" ;;
      --fio-manifest-sha256=*) FIO_MANIFEST_SHA256="${arg#*=}" ;;
      --fio-review-source-sha256=*) FIO_REVIEW_SOURCE_SHA256="${arg#*=}" ;;
      --help|-h)
        full_reset_usage
        exit 0
        ;;
      --*)
        echo "FATAL: unknown full-reset option: $arg" >&2
        full_reset_usage >&2
        exit 2
        ;;
      *)
        [ "$positional_seen" = "0" ] || { echo "FATAL: only one branch argument is allowed" >&2; exit 2; }
        BRANCH="$arg"
        positional_seen=1
        ;;
    esac
  done

  [ "$CONFIRM_FULL_RESET" = "1" ] || {
    echo "FATAL: full TEST reset requires --confirm-full-reset; ordinary deploys use deploy/host/deploy-test.sh" >&2
    exit 2
  }
  resolve_fio_protected_inputs
  [[ "$FIO_MANIFEST_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "FATAL: --fio-manifest-sha256 must be 64 hex characters" >&2; exit 2; }
  [[ "$FIO_REVIEW_SOURCE_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "FATAL: --fio-review-source-sha256 must be 64 hex characters" >&2; exit 2; }
  FIO_MANIFEST_SHA256="${FIO_MANIFEST_SHA256,,}"
  FIO_REVIEW_SOURCE_SHA256="${FIO_REVIEW_SOURCE_SHA256,,}"
}

assert_hash_bound_protected_input(){
  local label="$1" path="$2" expected_hash="$3" owner_mode actual_hash
  [[ "$expected_hash" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "FATAL: $label SHA-256 must be 64 hex characters" >&2; exit 2; }
  [[ "$path" = /* ]] || { echo "FATAL: $label path must be absolute" >&2; exit 2; }
  sudo -u deploy test -e "$path" || {
    echo "FATAL: $label is missing: $path" >&2
    exit 2
  }
  sudo -u deploy test -f "$path" && sudo -u deploy test ! -L "$path" || {
    echo "FATAL: $label must be a regular non-symlink file: $path" >&2
    exit 2
  }
  owner_mode="$(sudo -u deploy stat -Lc '%U:%a' -- "$path")"
  [ "$owner_mode" = "deploy:600" ] || {
    echo "FATAL: $label must be owned by deploy with mode 0600 (got $owner_mode)" >&2
    exit 2
  }
  sudo -u deploy test -r "$path" || { echo "FATAL: $label is not readable by deploy" >&2; exit 2; }
  actual_hash="$(sudo -u deploy sha256sum -- "$path" | awk '{print $1}')"
  [ "${actual_hash,,}" = "${expected_hash,,}" ] || { echo "FATAL: $label SHA-256 mismatch" >&2; exit 2; }
  echo "   $label: protected input + SHA-256 OK"
}

shell_quote(){
  printf '%q' "$1"
}

run_port_context_test_release(){
  assert_test_writers_stopped
  # Prove that no retired owner-role elevation exists. Cluster zero may remove the old role; this
  # reset path never creates it, grants it membership, or toggles BYPASSRLS.
  cleanup_elevation
  LEGACY_ELEVATION_CLEANUP_REQUIRED=0
  log "install TEST-only telemetry fixture objects required by the target privilege declaration"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v telemetry_fixture_objects_only=1 \
    -f "$DEPLOY_REPO/$SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES"
  log "single-target TEST mTLS → zero/proof → minimal target roles/grants"
  local access_backup="/var/backups/bersoncarebot-test-portctx/bersoncarebot_test-pre-access-$(date -u +%Y%m%dT%H%M%SZ).dump"
  local current_connection_limit
  local -a cutover_retry_args=()
  sudo install -d -o postgres -g postgres -m 0700 "$(dirname "$access_backup")"
  current_connection_limit="$(sudo -u postgres psql -X -d postgres -Atqc \
    "SELECT datconnlimit FROM pg_catalog.pg_database WHERE datname='bersoncarebot_test';")"
  if [ "$current_connection_limit" = "0" ]; then
    # A failed cutover deliberately leaves TEST closed. The public TEST deploy wrapper owns the
    # retry and explicitly restores the normal unlimited database limit only after every cutover
    # proof succeeds; the cutover EXIT guard returns it to zero on any later failure.
    cutover_retry_args=(--operational-connection-limit -1)
  fi
  sudo bash "$DEPLOY_REPO/deploy/host/cutover-postgres-port-context.sh" \
    --execute --environment test --database bersoncarebot_test --backup-file "$access_backup" \
    "${cutover_retry_args[@]}"

  log "restart TEST on exact port-context runtime"
  install_and_assert_media_worker_test_unit
  for unit_name in api worker scheduler webapp; do
    sudo systemctl restart "bersoncarebot-$unit_name-test"
  done
  sudo systemctl restart bersoncarebot-media-worker-test
  sleep 4
  assert_test_units_active
  assert_test_health_ok
  SERVICES_RELEASED=1
  log "TEST port-context release: PASS"
}

case "${1:-}" in
  --strict-closure-catalog-self-test)
    run_strict_closure_catalog_self_test
    exit 0
    ;;
  --c4-operational-chain-self-test)
    run_c4_operational_chain_self_test
    exit 0
    ;;
  --strict-preflight)
    FIXTURE_VALIDATOR_ROOT="$DEPLOY_REPO"
    assert_strict_closure_deploy_checkout_ready
    echo "strict TEST closure preflight: OK"
    exit 0
    ;;
  --post-migration-closure)
    FIXTURE_VALIDATOR_ROOT="$DEPLOY_REPO"
    assert_strict_closure_deploy_checkout_ready
    WRITERS_STOPPED=1
    trap cleanup_exit EXIT
    run_strict_post_migration_closure
    log "DONE — shared strict TEST DB/schema/runtime ready; external delivery unverified"
    exit 0
    ;;
  --port-context-post-migration-cutover)
    WRITERS_STOPPED=1
    trap cleanup_exit EXIT
    run_port_context_test_release
    exit 0
    ;;
  --help|-h)
    full_reset_usage
    exit 0
    ;;
esac

# 0. preflight (env files are deploy-owned → check as deploy, not as dev)
[ "${BCB_TEST_FULL_RESET_ENTRYPOINT:-}" = "deploy-test-full-reset-v1" ] || {
  echo "FATAL: direct destructive invocation is disabled; use deploy/host/deploy-test-full-reset.sh" >&2
  echo "For ordinary code deploys use deploy/host/deploy-test.sh" >&2
  exit 2
}
parse_full_reset_args "$@"
log "DESTRUCTIVE full-reset confirmation + owner input preflight"
assert_hash_bound_protected_input "FIO manifest" "$FIO_MANIFEST" "$FIO_MANIFEST_FILE_SHA256"
[ -r "$SRC_REPO/$RESTORE" ] || { echo "FATAL: missing required file: $SRC_REPO/$RESTORE"; exit 1; }
[ -r "$SRC_REPO/$OVERRIDE" ] || { echo "FATAL: missing repo file: $SRC_REPO/$OVERRIDE"; exit 1; }
[ -r "$SRC_REPO/$SAAS_SMOKE_PASSWORD_CONVERGER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_SMOKE_PASSWORD_CONVERGER"; exit 1; }
sudo -u deploy test -f "$SAAS_SMOKE_LOGIN_ENV" && sudo -u deploy test ! -L "$SAAS_SMOKE_LOGIN_ENV" || {
  echo "FATAL: protected TEST owner-login packet is missing or is a symlink: $SAAS_SMOKE_LOGIN_ENV" >&2
  exit 1
}
[ "$(sudo -u deploy stat -Lc '%U:%G:%a' -- "$SAAS_SMOKE_LOGIN_ENV")" = "root:deploy:640" ] || {
  echo "FATAL: protected TEST owner-login packet must be root:deploy 0640" >&2
  exit 1
}
[ -r "$SRC_REPO/$OWNER_IDENTITY_CONSOLIDATION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$OWNER_IDENTITY_CONSOLIDATION"; exit 1; }
[ -r "$SRC_REPO/$PRE_CUTOVER_DATA_ASSERTIONS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PRE_CUTOVER_DATA_ASSERTIONS"; exit 1; }
[ -r "$SRC_REPO/$CUTOVER_MIGRATION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$CUTOVER_MIGRATION"; exit 1; }
[ -r "$SRC_REPO/$TARGET_LEDGER_ARTIFACT" ] || { echo "FATAL: missing repo file: $SRC_REPO/$TARGET_LEDGER_ARTIFACT"; exit 1; }
[ -r "$SRC_REPO/$PRIVILEGE_GENERATOR" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PRIVILEGE_GENERATOR"; exit 1; }
[ -r "$SRC_REPO/$C4D_MEDIA_OWNER_ONLINE_INDEX" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4D_MEDIA_OWNER_ONLINE_INDEX"; exit 1; }
[ -r "$SRC_REPO/$P0_5B_ROLES" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P0_5B_ROLES"; exit 1; }
[ -r "$SRC_REPO/$P0_5B_GRANTS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P0_5B_GRANTS"; exit 1; }
[ -r "$SRC_REPO/$P2_B_CONTEXT" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P2_B_CONTEXT"; exit 1; }
[ -r "$SRC_REPO/$ORGANIZATION_MEMBER_INVITES_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$ORGANIZATION_MEMBER_INVITES_RLS"; exit 1; }
[ -r "$SRC_REPO/$PATIENT_INVITES_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PATIENT_INVITES_RLS"; exit 1; }
[ -r "$SRC_REPO/$STORE_P0_ENTITLEMENTS_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$STORE_P0_ENTITLEMENTS_RLS"; exit 1; }
[ -r "$SRC_REPO/$PATIENT_COURSE_WALL" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PATIENT_COURSE_WALL"; exit 1; }
[ -r "$SRC_REPO/$PUBLIC_BOOTSTRAP_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PUBLIC_BOOTSTRAP_RLS"; exit 1; }
[ -r "$SRC_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS"; exit 1; }
[ -r "$SRC_REPO/$REFERENCE_CATALOG_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$REFERENCE_CATALOG_RLS"; exit 1; }
[ -r "$SRC_REPO/$PATIENT_VISIBLE_CATALOG_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PATIENT_VISIBLE_CATALOG_RLS"; exit 1; }
[ -r "$SRC_REPO/$PATIENT_VAPID_ACCESSOR" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PATIENT_VAPID_ACCESSOR"; exit 1; }
[ -r "$SRC_REPO/$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER"; exit 1; }
[ -r "$SRC_REPO/$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER"; exit 1; }
[ -r "$SRC_REPO/$D3_4_BOOTSTRAP_GRANTS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$D3_4_BOOTSTRAP_GRANTS"; exit 1; }
[ -r "$SRC_REPO/$TEST_STRICT_RLS_FINALIZER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$TEST_STRICT_RLS_FINALIZER"; exit 1; }
[ -r "$SRC_REPO/$TEST_PATIENT_IDENTITY_CAPABILITY_GATE" ] || { echo "FATAL: missing repo file: $SRC_REPO/$TEST_PATIENT_IDENTITY_CAPABILITY_GATE"; exit 1; }
[ -r "$SRC_REPO/$SAAS_ISOLATION_TELEMETRY" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_ISOLATION_TELEMETRY"; exit 1; }
[ -r "$SRC_REPO/$SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES"; exit 1; }
[ -r "$SRC_REPO/$SAAS_SYSTEM_HEALTH_DIAGNOSTICS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_SYSTEM_HEALTH_DIAGNOSTICS"; exit 1; }
[ -r "$SRC_REPO/$INTEGRATOR_SERVER_RUNTIME_CONFIG" ] || { echo "FATAL: missing repo file: $SRC_REPO/$INTEGRATOR_SERVER_RUNTIME_CONFIG"; exit 1; }
[ -r "$SRC_REPO/$INTEGRATOR_LOGIN_PUBLIC_IDENTITY_GRANTS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$INTEGRATOR_LOGIN_PUBLIC_IDENTITY_GRANTS"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_RUNTIME" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_RUNTIME"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_PROVISIONER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_PROVISIONER"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_READINESS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_READINESS"; exit 1; }
[ -r "$SRC_REPO/$C4_MEDIA_CONTROL_CUTOVER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_MEDIA_CONTROL_CUTOVER"; exit 1; }
[ -x "$SRC_REPO/$C4_MEDIA_LOGIN_RETIREMENT" ] || { echo "FATAL: missing executable repo file: $SRC_REPO/$C4_MEDIA_LOGIN_RETIREMENT"; exit 1; }
[ -x "$SRC_REPO/$C4_OPERATIONAL_PASSWORD_SETTER" ] || { echo "FATAL: missing executable repo file: $SRC_REPO/$C4_OPERATIONAL_PASSWORD_SETTER"; exit 1; }
[ -r "$SRC_REPO/$PORT_CONTEXT_CAPABILITY_SEED" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PORT_CONTEXT_CAPABILITY_SEED"; exit 1; }
[ -r "$SRC_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION"; exit 1; }
[ -r "$SRC_REPO/$SAAS_ISOLATION_OPERATOR_PROVISIONER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_ISOLATION_OPERATOR_PROVISIONER"; exit 1; }
bootstrap_test_env_preflight "$SRC_REPO"
for f in "$API_ENV" "$WEBAPP_ENV"; do
  sudo -u deploy test -r "$f" || { echo "FATAL: deploy cannot read required env file: $f"; exit 1; }
done
if [ -e "$MEDIA_WORKER_ENV" ]; then
  sudo -u deploy test -r "$MEDIA_WORKER_ENV" || {
    echo "FATAL: existing media-worker TEST env is not readable by deploy: $MEDIA_WORKER_ENV" >&2
    exit 1
  }
fi
log "TEST runtime mode preflight"
assert_test_runtime_mode_ready
# Deliver and build the exact branch before stopping writers or touching TEST data. This also makes the
# version-matched no-DB manifest verifier available for the final protected-input preflight.
log "bundle + checkout $BRANCH -> $DEPLOY_REPO"
git -C "$SRC_REPO" bundle create "$BUNDLE" "$BRANCH"; chmod 644 "$BUNDLE"
sudo -u deploy git -C "$DEPLOY_REPO" fetch "$BUNDLE" "$BRANCH"
sudo -u deploy git -C "$DEPLOY_REPO" checkout -f -B "$BRANCH" FETCH_HEAD
echo "   HEAD: $(sudo -u deploy git -C "$DEPLOY_REPO" rev-parse --short HEAD)"
log "build (install + build + build:webapp + media-worker + assets)"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && export CI=true && \
  pnpm install --frozen-lockfile && \
  rm -rf dist && pnpm build && \
  rm -rf apps/webapp/.next && pnpm build:webapp && \
  pnpm --dir apps/media-worker build && \
  bash deploy/host/sync-webapp-standalone-assets.sh"

log "version-matched owner-reviewed FIO manifest verification (no DB)"
fio_manifest_q="$(shell_quote "$FIO_MANIFEST")"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && \
  pnpm --dir apps/webapp run fio:owner-reviewed-test:verify -- \
    --manifest $fio_manifest_q \
    --confirm-manifest-sha256 '$FIO_MANIFEST_SHA256' \
    --confirm-review-source-sha256 '$FIO_REVIEW_SOURCE_SHA256'"

trap cleanup_exit EXIT   # NEVER leave BYPASSRLS or owner-role membership on

log "snapshot configured TEST SMTP before destructive restore"
snapshot_test_smtp_outbound

log "stop TEST writers before restore/migration"
for u in "${UNITS[@]}"; do sudo systemctl stop "bersoncarebot-$u-test"; done
WRITERS_STOPPED=1
assert_test_writers_stopped
stage_cutover_inputs_for_postgres

# 1. fresh test DB = FRESH dump streamed from LIVE prod (read-only pg_dump over ssh; no file left on prod).
#    Override with DUMP=/path env to reuse a pre-pulled dump. Do NOT fall back to /opt/backups here —
#    those are the DEAD local copy; a silent stale restore is exactly the bug that wasted hours.
if [ -z "${DUMP:-}" ]; then
  DUMP=/tmp/bcb-prod-fresh.dump
  log "pull FRESH dump from live prod ($PROD_SSH:$PROD_DB) → $DUMP"
  umask 077
  # Idempotency: the pull below chowns the dump to postgres:0600, so a leftover file from a PREVIOUS
  # run is unwritable by this (deploy-operator) user and the redirect dies with "Permission denied"
  # mid-reset — after TEST writers were already stopped. Clear the stale artifact first; it is always
  # about to be overwritten anyway, and a stale dump must never be silently reused (see the comment
  # above about the DEAD local copies).
  if [ -e "$DUMP" ]; then
    sudo rm -f -- "$DUMP"
  fi
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH" "sudo -u postgres pg_dump -Fc --no-owner --no-acl $PROD_DB" > "$DUMP"
  sudo chown postgres:postgres "$DUMP"
  sudo chmod 0600 "$DUMP"
fi
[ -f "$DUMP" ] && [ ! -L "$DUMP" ] && [ -s "$DUMP" ] || { echo "FATAL: dump must be a non-empty regular non-symlink file"; exit 1; }
dump_owner_mode="$(stat -Lc '%U:%G:%a' -- "$DUMP")"
[ "$dump_owner_mode" = "postgres:postgres:600" ] || {
  echo "FATAL: dump must be protected as postgres:postgres 0600 (got $dump_owner_mode)" >&2
  exit 1
}
log "restore $DB from $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"
sudo -u postgres bash "$DEPLOY_REPO/$RESTORE" "$DUMP"
assert_test_db_restore_owner_ready

# 2. Owner-account consolidation is the first data mutation. Every later identity/FIO migration
#    therefore sees one canonical staff row and no approved dead stubs.
log "owner identity consolidation (first data mutation)"
run_test_db_restore_owner_sql_file "$DEPLOY_REPO/$OWNER_IDENTITY_CONSOLIDATION"

# 3. Normalize the doctor/global-admin split before membership-seeding migrations.
log "data-fix (doctor/admin split)"
run_test_db_restore_owner_sql_file "$DEPLOY_REPO/$DATAFIX"

# 4. Apply owner-reviewed FIO while platform_users is still the only identity source. Migrations
#    0377/0381 create and start reading user_identity, so applying FIO after the chain loses the
#    reviewed correction from the new read model.
log "owner-reviewed FIO manifest apply (pre-migration)"
fio_manifest_q="$(shell_quote "$POSTGRES_FIO_MANIFEST")"
fio_manifest_sha_q="$(shell_quote "$FIO_MANIFEST_SHA256")"
fio_review_source_sha_q="$(shell_quote "$FIO_REVIEW_SOURCE_SHA256")"
fio_rollback_dir_q="$(shell_quote "$POSTGRES_CUTOVER_INPUT_DIR/fio-rollback")"
run_postgres_repo_as_test_restore_owner \
  "pnpm --dir apps/webapp run fio:owner-reviewed-test:apply -- --test --manifest $fio_manifest_q --confirm-manifest-sha256 $fio_manifest_sha_q --confirm-review-source-sha256 $fio_review_source_sha_q --rollback-dir $fio_rollback_dir_q"

log "carry unresolved legacy appointment history (pre-assertion cutover data stage)"
sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
  -v cutover_database="$DB" \
  -v canonical_organization_id="$ORG_ID" \
  -v canonical_specialist_id="$CANONICAL_SPECIALIST" \
  -f "$DEPLOY_REPO/$LEGACY_APPOINTMENT_CARRY"

log "pre-cutover data-stage assertions"
sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
  -v expected_database="$DB" \
  -v canonical_organization_id="$ORG_ID" \
  -v canonical_specialist_id="$CANONICAL_SPECIALIST" \
  -f "$DEPLOY_REPO/$PRE_CUTOVER_DATA_ASSERTIONS"

if [ "$PREPARE_CUTOVER_SOURCE_ONLY" = "1" ]; then
  log "DATA STAGE READY — clean PROD schema A preserved; historical migration runners were not started"
  exit 0
fi

# schema-post creates policies that name the target capability roles. A long-lived TEST cluster can
# already have them and hide a missing prerequisite; a clean cluster cannot. Install only the
# declaration-derived NOLOGIN roles here, before the atomic A→B transaction. Login roles, passwords,
# database ACL and port-context grants are still rebuilt by the final privilege closure below.
log "pre-migration NOLOGIN role prerequisites"
install_pre_migration_role_prerequisites

# 6. One transaction replaces schema A with the exact current DEV schema, copies
#    the prepared data, and records the target migration ledgers. Historical
#    webapp/integrator migration runners are intentionally not invoked here.
log "single PROD-dump -> current DEV schema migration"
sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
  -v cutover_database="$DB" \
  -v canonical_organization_id="$ORG_ID" \
  -v canonical_specialist_id="$CANONICAL_SPECIALIST" \
  -v cutover_mode="$CUTOVER_MODE" \
  -f "$DEPLOY_REPO/$CUTOVER_MIGRATION"

if [ "$CUTOVER_MODE" = "dryrun" ]; then
  log "CUTOVER DRY RUN COMPLETE — transaction rolled back; post-migration checks intentionally skipped"
  exit 0
fi

expected_ledger_rows="$(awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' "$DEPLOY_REPO/$TARGET_LEDGER_ARTIFACT")"
[ "$expected_ledger_rows" -gt 0 ] || { echo "FATAL: target ledger artifact has no drizzle migration rows: $TARGET_LEDGER_ARTIFACT" >&2; exit 1; }
CNT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;")"
[ "${CNT:-0}" -ge "$expected_ledger_rows" ] || {
  echo "FATAL: drizzle migration ledger did not arrive: got ${CNT:-0}, target artifact requires at least $expected_ledger_rows" >&2
  exit 1
}
# platform_users.session_epoch (D1, 2026-07-26): the session chokepoint compares it on every request
# and fails closed, so TEST code released onto a database without it 401s every session including
# fresh logins. Same column is asserted by deploy/host/webapp-post-migrate-schema-check.sh on prod
# and by the webapp at boot (apps/webapp/src/instrumentation.ts).
for col in "system_settings.organization_id" "user_phone_history.organization_id" "platform_users.session_epoch"; do
  t="${col%.*}"; c="${col#*.}"
  ok="$(sudo -u postgres psql -d "$DB" -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$t' AND column_name='$c');")"
  [ "$ok" = "t" ] || { echo "FATAL: missing column $col after migrate"; exit 1; }
done
echo "   drizzle migrations = $CNT (target ledger rows = $expected_ledger_rows; org columns present)"

# 7. test-only settings override (repo-tracked; post-migrate partial-index upserts, send-safety,
#    maintenance, allowlist, identity role-allowlist normalization, DB lock). Applied from the deploy
#    checkout so it is version-matched to the branch.
log "test settings override"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 \
  -v test_settings_overlay_mode=reset \
  -f "$DEPLOY_REPO/$OVERRIDE"
log "restore preserved TEST SMTP"
restore_test_smtp_outbound

# 8. end-state self-check (reproducibility gate — same asserted state every run, from zero)
log "verify end-state"
for retired_relation in \
  public.appointment_records \
  integrator.rubitime_records \
  integrator.rubitime_events \
  integrator.rubitime_booking_profiles \
  integrator.rubitime_branches \
  integrator.rubitime_services \
  integrator.rubitime_cooperators; do
  relation_state="$(sudo -u postgres psql -d "$DB" -X -tAc "SELECT to_regclass('$retired_relation') IS NULL;")"
  [ "$relation_state" = "t" ] || { echo "FATAL: retired relation still exists after migrate: $retired_relation" >&2; exit 1; }
done
OLD_SOURCE="$(sudo -u postgres psql -d "$DB" -X -tAc "SELECT count(*) FROM public.be_appointments WHERE source='rubitime_projection';")"
[ "${OLD_SOURCE:-1}" = "0" ] || { echo "FATAL: $OLD_SOURCE appointments still carry retired rubitime_projection source" >&2; exit 1; }
ACTIVE="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_specialists WHERE is_active=true;")"
[ "${ACTIVE:-0}" = "1" ] || { echo "FATAL: expected exactly 1 active specialist, got ${ACTIVE:-0}"; exit 1; }
ORPHAN="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE deleted_at IS NULL AND (specialist_id IS NULL OR specialist_id IN (SELECT id FROM be_specialists WHERE is_active=false));")"
[ "${ORPHAN:-1}" = "0" ] || { echo "FATAL: ${ORPHAN} appointments left on NULL/inactive specialist (data not fully consolidated)"; exit 1; }
DROLE="$(sudo -u postgres psql -d "$DB" -tAc "SELECT role FROM platform_users WHERE phone_normalized='+79643805480' AND merged_into_id IS NULL;")"
[ "$DROLE" = "doctor" ] || { echo "FATAL: canonical doctor role is '$DROLE', expected 'doctor'"; exit 1; }
APADMIN="$(sudo -u postgres psql -d "$DB" -tAc "SELECT value_json->>'value' FROM public.system_settings WHERE key='admin_phones' AND scope='admin' AND organization_id IS NULL;")"
[ "$APADMIN" = "[]" ] || { echo "FATAL: admin_phones is '$APADMIN', expected [] (owner phone must be doctor, not admin)"; exit 1; }
APPTS="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id='$CANONICAL_SPECIALIST';")"
FUT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id='$CANONICAL_SPECIALIST' AND start_at>=now();")"
echo "   OK: 1 active specialist · $APPTS appointments on canonical ($FUT future) · doctor role held · admin_phones=[]"
[ "${FUT:-0}" -gt 0 ] || echo "   ⚠ WARNING: 0 future appointments — dump may be stale (live prod should have upcoming bookings)"
log "B1 doctor/admin identity assertion"
run_b1_doctor_admin_identity_assertion

log "converge the three owner TEST account emails/passwords from the protected packet"
sudo env SAAS_SMOKE_PASSWORD_CONVERGENCE_TEST_ONLY=1 \
  node "$DEPLOY_REPO/$SAAS_SMOKE_PASSWORD_CONVERGER" --packet="$SAAS_SMOKE_LOGIN_ENV"

# The destructive full-reset is the one authorized one-time access cutover.  All legacy migrations
# above have completed while their migration identity still exists.  From here the old C2/C4
# closure is forbidden: it recreates diagnostic/delivery/scheduler/operator logins that the new
# cluster-wide zero deliberately removes. Install the target HBA and target-only zero +
# exact six-logins target state, then prove live authentication through the two ports.
run_port_context_test_release
log "DONE — TEST DB/schema/runtime ready (reviewed FIO + port-context runtime verified); external delivery unverified"
