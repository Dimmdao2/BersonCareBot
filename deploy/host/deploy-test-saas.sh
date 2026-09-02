#!/usr/bin/env bash
# deploy-test-saas.sh — the guarded full-reset engine used only by deploy-test-full-reset.sh for one clean
# cycle from zero: fresh prod-copy test DB → deploy branch code → apply the one PROD-dump -> current DEV
# schema (B) migration → install access from the declaration → restart test units → verify healthy.
# See docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md and DB_PRIVILEGE_LAYER_REBUILD/PLAN.md.
#
# ONE post-migration access closure (#1085, 2026-09-02). This engine used to carry a second, parallel
# closure — run_strict_post_migration_closure() plus runtime-overlay-rehydrate-lib.sh's ordered SQL list —
# that no live entrypoint called: it was reachable only through the orphaned --post-migration-closure flag
# (deploy-test.sh stopped passing it in fe7aa07d9, 12.08.2026). That layer predates the declaration and
# contradicted it: its first overlay required the retired app_owner to hold BYPASSRLS, nine of its files
# depended on app_owner directly, e1-webapp-runtime-config.sql transferred fourteen current functions back
# to it, and eight of its files re-created 44 objects (42 functions, two tables) AFTER schema B had already
# shipped their current definitions. It is removed, not rewired: the declaration
# (deploy/postgres/privileges/) is the single executable source of owners, roles, memberships, grants,
# policies, FORCE RLS and the context catalog; it already declares every one of those objects with narrow
# seam owners, and it re-applies the whole matrix (REVOKE ALL → exact GRANT, DROP POLICY → declared
# CREATE POLICY) on every reconcile — so a second writer could only drift from it or be wiped by it.
#
# The single post-migration access closure both public TEST entrypoints converge on:
#   full reset  → run_port_context_test_release → deploy/host/cutover-postgres-port-context.sh
#                 → generate-cli.mjs --shared-role-baseline + reconcile-access.mjs → HBA → live readiness
#   code-only   → deploy/host/deploy-test.sh → the same generator + reconcile-access.mjs
# Object definitions arrive only from the generated B snapshot plus active forward migrations
# (AGENTS.md §1 "Миграции schema B"); this engine never re-creates a schema object after B.
#
# Why the plain deploy-test.sh is not enough here: it never restores TEST from a prod dump and never runs
# the A→B transition. It remains the correct entrypoint for every ordinary current-schema code deploy.
#
# Run as user `dev` (uses sudo for postgres/deploy/systemctl). This is NOT the normal code deploy:
# it deliberately recreates TEST from a clean dump and therefore requires an explicit destructive confirmation
# plus hash-bound FIO inputs. Normal code deploys use deploy/host/deploy-test.sh and never restore TEST.
# Public destructive entrypoint: bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset [branch]
# Protected FIO inputs default to /opt/env/bersoncarebot/protected-inputs/fio-owner-reviewed-test.manifest.json
# and its fio-owner-reviewed-test.sha256 sidecar. Explicit --fio-manifest* arguments override those defaults.
set -euo pipefail

DEPLOY_TEST_SAAS_SCRIPT_DIR="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
# Sourced libraries: none. media-control-cutover-sequence.sh and saas-isolation-coverage-gate-lib.sh were
# consumed only by the removed second closure (#1085); deploy-test.sh still sources the coverage-gate lib
# for the ordinary current-schema deploy, and the media-control sequence is exercised as its own process by
# --c4-operational-chain-self-test below. The full reset therefore records no isolation-coverage window --
# it never did in practice, because the closure that called it was unreachable. Adding that producer to the
# reset path is a separate decision, not part of this closure correction.

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
PRIVILEGE_GENERATOR=deploy/postgres/privileges/generate-cli.mjs
C4_OPERATIONAL_PROVISIONER=deploy/host/provision-c4-operational-runtime.sh
C4_OPERATIONAL_READINESS=deploy/host/assert-c4-operational-runtime-ready.sh
C4_MEDIA_CONTROL_CUTOVER=deploy/host/media-control-cutover-sequence.sh
C4_MEDIA_LOGIN_RETIREMENT=deploy/host/retire-media-db-login.sh
UNITS=(api scheduler webapp media-worker)
LEGACY_WORKER_SERVICE=bersoncarebot-worker-test.service
LEGACY_WORKER_UNIT_INSTALLED="/etc/systemd/system/$LEGACY_WORKER_SERVICE"
WRITERS_STOPPED=0
SERVICES_RELEASED=0
LEGACY_ELEVATION_CLEANUP_REQUIRED=1
POSTGRES_CUTOVER_INPUT_DIR=""
POSTGRES_FIO_MANIFEST=""
TEST_SMTP_SNAPSHOT=""
SMTP_SNAPSHOT_VALIDATOR="$DEPLOY_TEST_SAAS_SCRIPT_DIR/validate-smtp-outbound-snapshot.mjs"

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

assert_test_writers_stopped(){
  local unit_name
  for unit_name in "${UNITS[@]}"; do
    if systemctl is-active --quiet "bersoncarebot-$unit_name-test"; then
      echo "FATAL: bersoncarebot-$unit_name-test is still active before the post-migration access closure" >&2
      exit 1
    fi
  done
}

# D30 merged the outgoing-delivery worker into the resident scheduler. A full reset must accept a host
# where the old unit is already absent, but it must also retire an installed legacy unit before the
# scheduler can be started, otherwise two delivery loops can run at once.
retire_legacy_test_worker_unit(){
  local fragment_path drop_in_paths
  if sudo systemctl is-active --quiet "$LEGACY_WORKER_SERVICE"; then
    sudo systemctl stop "$LEGACY_WORKER_SERVICE" || {
      echo "FATAL: cannot stop legacy $LEGACY_WORKER_SERVICE before starting the merged scheduler" >&2
      exit 1
    }
  fi
  if sudo systemctl is-enabled --quiet "$LEGACY_WORKER_SERVICE" 2>/dev/null; then
    sudo systemctl disable "$LEGACY_WORKER_SERVICE" || {
      echo "FATAL: cannot disable legacy $LEGACY_WORKER_SERVICE before starting the merged scheduler" >&2
      exit 1
    }
  fi
  if sudo test -e "$LEGACY_WORKER_UNIT_INSTALLED"; then
    { sudo test -f "$LEGACY_WORKER_UNIT_INSTALLED" && ! sudo test -L "$LEGACY_WORKER_UNIT_INSTALLED"; } || {
      echo "FATAL: refusing to remove non-regular legacy unit target: $LEGACY_WORKER_UNIT_INSTALLED" >&2
      exit 1
    }
    fragment_path="$(sudo systemctl show --property=FragmentPath --value "$LEGACY_WORKER_SERVICE")"
    drop_in_paths="$(sudo systemctl show --property=DropInPaths --value "$LEGACY_WORKER_SERVICE")"
    [ "$fragment_path" = "$LEGACY_WORKER_UNIT_INSTALLED" ] || {
      echo "FATAL: legacy worker FragmentPath mismatch: ${fragment_path:-missing}" >&2
      exit 1
    }
    [ -z "$drop_in_paths" ] || {
      echo "FATAL: refusing to retire legacy worker with drop-ins: $drop_in_paths" >&2
      exit 1
    }
    sudo rm -- "$LEGACY_WORKER_UNIT_INSTALLED"
    sudo systemctl daemon-reload
  fi
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

assert_test_health_ok(){
  local health_response
  health_response="$(curl -fsk --max-time 10 https://test.bersoncare.ru/api/health)"
  [[ "$health_response" == *'"ok":true'* ]] || { echo "FATAL: health response missing ok=true: $health_response" >&2; exit 1; }
  [[ "$health_response" == *'"db":"up"'* ]] || { echo "FATAL: health response missing db=up: $health_response" >&2; exit 1; }
  echo "   health: OK ($health_response)"
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
  local self_test_media_cutover self_test_media_retirement
  local self_test_bootstrap self_test_secret_preflight
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
  self_test_bootstrap="$(resolve_c4_self_test_repo_file "$self_test_repo_root" deploy/host/bootstrap-c4-test-env.mjs)"
  self_test_secret_preflight="$(resolve_c4_self_test_repo_file "$self_test_repo_root" deploy/host/saas-c2-secret-preflight.mjs)"
  bash -n "$self_test_deploy_script" "$self_test_provisioner" "$self_test_readiness" \
    "$self_test_media_cutover" "$self_test_media_retirement"
  bash "$self_test_media_cutover" --self-test
  bash "$self_test_provisioner" --self-test
  node "$self_test_bootstrap" --self-test
  node "$self_test_secret_preflight" --self-test
  echo "C4 canonical fresh wrapper segment self-test: OK (checkout=$self_test_repo_root; no env/DB/service/cron mutation)"
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
  for unit_name in api scheduler webapp; do
    sudo systemctl restart "bersoncarebot-$unit_name-test"
  done
  sudo systemctl restart bersoncarebot-media-worker-test
  sleep 4
  assert_test_units_active
  assert_test_health_ok
  SERVICES_RELEASED=1
  log "TEST port-context release: PASS"
}

# --strict-closure-catalog-self-test, --strict-preflight and --post-migration-closure are gone with the
# second closure they drove (#1085). Nothing passed them: deploy-test.sh dropped --post-migration-closure
# in fe7aa07d9 (12.08.2026) and never regained it. The supported post-migration access closure is
# --port-context-post-migration-cutover below (and, for ordinary current-schema deploys, deploy-test.sh's
# own generate-cli + reconcile-access sequence) — both install access from the one declaration.
case "${1:-}" in
  --c4-operational-chain-self-test)
    run_c4_operational_chain_self_test
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
[ -r "$SRC_REPO/$OWNER_IDENTITY_CONSOLIDATION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$OWNER_IDENTITY_CONSOLIDATION"; exit 1; }
[ -r "$SRC_REPO/$PRE_CUTOVER_DATA_ASSERTIONS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PRE_CUTOVER_DATA_ASSERTIONS"; exit 1; }
[ -r "$SRC_REPO/$CUTOVER_MIGRATION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$CUTOVER_MIGRATION"; exit 1; }
[ -r "$SRC_REPO/$TARGET_LEDGER_ARTIFACT" ] || { echo "FATAL: missing repo file: $SRC_REPO/$TARGET_LEDGER_ARTIFACT"; exit 1; }
[ -r "$SRC_REPO/$PRIVILEGE_GENERATOR" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PRIVILEGE_GENERATOR"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_PROVISIONER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_PROVISIONER"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_READINESS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_READINESS"; exit 1; }
[ -r "$SRC_REPO/$C4_MEDIA_CONTROL_CUTOVER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_MEDIA_CONTROL_CUTOVER"; exit 1; }
[ -x "$SRC_REPO/$C4_MEDIA_LOGIN_RETIREMENT" ] || { echo "FATAL: missing executable repo file: $SRC_REPO/$C4_MEDIA_LOGIN_RETIREMENT"; exit 1; }
[ -r "$SRC_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION"; exit 1; }
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
retire_legacy_test_worker_unit
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

# A fresh PROD dump correctly carries PROD credential hashes, but the three published owner accounts have one
# stable password on named DEV/TEST (AGENTS.md §1a). Restore that TEST-only contract while writers remain stopped;
# the helper refuses every database except exact bersoncarebot_test and never prints the password or hashes.
log "restore canonical TEST owner account passwords"
sudo -u postgres env \
  DATABASE_URL="postgresql:///$DB?host=/var/run/postgresql" \
  node "$DEPLOY_REPO/apps/webapp/scripts/ensure-test-owner-account-passwords.mjs" \
    --execute --confirm-test-owner-password-reset

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
DROLE="$(sudo -u postgres psql -d "$DB" -tAc "SELECT person.role FROM platform_users person JOIN user_contacts contact ON contact.platform_user_id = person.id WHERE contact.contact_kind='phone' AND contact.value_normalized='+79643805480' AND person.merged_into_id IS NULL;")"
[ "$DROLE" = "doctor" ] || { echo "FATAL: canonical doctor role is '$DROLE', expected 'doctor'"; exit 1; }
APADMIN="$(sudo -u postgres psql -d "$DB" -tAc "SELECT value_json->>'value' FROM public.system_settings WHERE key='admin_phones' AND scope='admin' AND organization_id IS NULL;")"
[ "$APADMIN" = "[]" ] || { echo "FATAL: admin_phones is '$APADMIN', expected [] (owner phone must be doctor, not admin)"; exit 1; }
APPTS="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id='$CANONICAL_SPECIALIST';")"
FUT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id='$CANONICAL_SPECIALIST' AND start_at>=now();")"
echo "   OK: 1 active specialist · $APPTS appointments on canonical ($FUT future) · doctor role held · admin_phones=[]"
[ "${FUT:-0}" -gt 0 ] || echo "   ⚠ WARNING: 0 future appointments — dump may be stale (live prod should have upcoming bookings)"
log "B1 doctor/admin identity assertion"
run_b1_doctor_admin_identity_assertion

# The destructive full-reset is the one authorized one-time access cutover.  All legacy migrations
# above have completed while their migration identity still exists.  From here the old C2/C4
# closure is forbidden: it recreates diagnostic/delivery/scheduler/operator logins that the new
# cluster-wide zero deliberately removes. Install the target HBA and target-only zero +
# exact six-logins target state, then prove live authentication through the two ports.
run_port_context_test_release
log "DONE — TEST DB/schema/runtime ready (reviewed FIO + port-context runtime verified); external delivery unverified"
