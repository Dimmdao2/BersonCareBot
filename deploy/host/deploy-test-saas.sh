#!/usr/bin/env bash
# deploy-test-saas.sh — shared strict TEST closure engine plus the guarded implementation used only by
# deploy-test-full-reset.sh for one clean cycle from zero: fresh prod-copy test DB → deploy branch code →
# apply the SaaS migration chain the CORRECT way (#667/#708) → restart test units → verify healthy.
# Runtime mode is locked-only; strict helper policies + FORCE are mandatory after every migration chain. Proven sequence;
# see docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md.
#
# Why the plain deploy-test.sh is not enough:
#   - a migration asserts the doctor/admin membership seed → needs p0-data-fix-doctor-admin-split.sql FIRST;
#   - some migrations backfill under already-installed FORCE RLS → need a TEMP BYPASSRLS migrator.
#   - this wrapper owns the DDL/backfill migration window via temporary owner authority.
#     TEST services run DB_PRINCIPAL_CONTEXT_MODE=locked after migrations:
#     integrator API startup must not attempt DDL migrations in locked runtime mode.
#
# Run as user `dev` (uses sudo for postgres/deploy/systemctl). This is NOT the normal code deploy:
# it deliberately recreates TEST from a clean dump and therefore requires an explicit destructive confirmation
# plus hash-bound Rubitime/FIO inputs. Normal code deploys use deploy/host/deploy-test.sh and never restore TEST.
# Public destructive entrypoint: bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
#   --rubitime-csv=/secure/input.csv --rubitime-csv-sha256=<sha256> \
#   --fio-manifest=/secure/fio-manifest.json --fio-manifest-file-sha256=<sha256> \
#   --fio-manifest-sha256=<sha256> --fio-review-source-sha256=<sha256> [branch]
set -euo pipefail

DEPLOY_TEST_SAAS_SCRIPT_DIR="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
RUNTIME_OVERLAY_LIB="$DEPLOY_TEST_SAAS_SCRIPT_DIR/runtime-overlay-rehydrate-lib.sh"
if [[ -L "$RUNTIME_OVERLAY_LIB" || ! -f "$RUNTIME_OVERLAY_LIB" || "$(realpath "$RUNTIME_OVERLAY_LIB")" != "$RUNTIME_OVERLAY_LIB" ]]; then
  echo "FATAL: shared runtime-overlay library path guard failed" >&2
  exit 1
fi
# shellcheck source=deploy/host/runtime-overlay-rehydrate-lib.sh
source "$RUNTIME_OVERLAY_LIB"

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
BRANCH="feat/doctor-ui-rebuild"
CONFIRM_FULL_RESET=0
RUBITIME_CSV=""
RUBITIME_CSV_SHA256=""
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
BUNDLE=/tmp/bcb-test-deploy.bundle
DB=bersoncarebot_test
DBROLE=bersoncarebot_test
RESTORE=/tmp/bcb-test-setup/restore-test-db.sh
OVERRIDE=deploy/postgres/test-settings-override.sql   # repo-tracked (was /tmp); post-migrate partial-index upserts + identity normalization
DATAFIX=deploy/postgres/p0-data-fix-doctor-admin-split.sql
C4D_MEDIA_OWNER_ONLINE_INDEX=deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql
P0_5B_ROLES=deploy/postgres/p0-5b-role-split-staff-patient.sql
P0_5B_GRANTS=deploy/postgres/p0-5b-grants.sql
P2_B_CONTEXT=deploy/postgres/p2-b-protected-principal-context.sql
RUNTIME_OVERLAY_APP_OWNER_HANDOFF=deploy/postgres/runtime-overlay-app-owner-handoff.sql
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
SAAS_SYSTEM_HEALTH_DIAGNOSTICS=deploy/postgres/saas-system-health-diagnostics.sql
INTEGRATOR_SERVER_RUNTIME_CONFIG=deploy/postgres/integrator-server-runtime-config.sql
E1_WEBAPP_RUNTIME_CONFIG=deploy/postgres/e1-webapp-runtime-config.sql
C4_OPERATIONAL_RUNTIME=deploy/postgres/c4-operational-runtime.sql
C4_WEB_PUSH_REMINDER_RUNTIME=deploy/postgres/c4-web-push-reminder-runtime.sql
C4_OPERATIONAL_PROVISIONER=deploy/host/provision-c4-operational-runtime.sh
C4_OPERATIONAL_READINESS=deploy/host/assert-c4-operational-runtime-ready.sh
C4_OPERATIONAL_PASSWORD_SETTER=deploy/host/set-postgres-role-password.mjs
C4_OPERATIONAL_PASSWORD_SMOKE=deploy/host/smoke-set-postgres-role-password.sh
C4_STATIC_CHECKER=docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs
SAAS_ISOLATION_OPERATOR_PROVISIONER=deploy/host/render-saas-isolation-operator-provisioning.mjs
LOCKED_SMOKE_FIXTURE_VALIDATOR=deploy/host/validate-saas-product-smoke-fixture.sh
UNITS=(api worker scheduler webapp media-worker)
MIGRATOR_ROLE=""
MIGRATOR_OWNER_MEMBERSHIP_ADDED=0
MIGRATOR_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0
P2_B_OWNER_ROLE=app_owner
P2_B_STAFF_ROLE=app_staff
P2_B_PATIENT_ROLE=app_patient
P2_B_SIGNING_SECRET_VALUE=""
P2_B_CONTEXT_INSTALLED=0
WRITERS_STOPPED=0
SERVICES_RELEASED=0
FIXTURE_VALIDATOR_ROOT="$SRC_REPO"
LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL=""
E1_RUNTIME_COVERAGE_STARTED_AT=""
STAGED_INPUT_DIR=""

# ── KNOWN ANCHORS (owner's real, stable prod identities — the whole sequence keys off these; same on prod) ──
#   doctor phone   +79643805480   (p0-data-fix + override: role=doctor, owns yandex email, doctor allowlist)
#   client phone   +79189000782   (p0-data-fix: same-name client, must NOT hold the doctor email)
#   doctor email   dimmdao@yandex.ru   admin email  dimmdao@gmail.com
#   org id         a0000000-0000-4000-8000-000000000001
#   canonical specialist  c9515025-7224-4d9b-86b6-9cb7d26ea503  (the "Дмитрий Берсон" row holding the full
#                         appointment history; the per-branch rubitime dup is merged into it + deactivated)
ORG_ID=a0000000-0000-4000-8000-000000000001
CANONICAL_SPECIALIST=c9515025-7224-4d9b-86b6-9cb7d26ea503
# LIVE prod source (adelaide / 135.106.162.170). The local /opt/backups on THIS (test/151.x) box are of a
# DEAD June-28 prod copy — NEVER use them for a real rehearsal. Pull a fresh dump from live prod via ssh.
PROD_SSH=bcb-clone
PROD_DB=bersoncarebot

log(){ echo; echo "== [deploy-test-saas] $* =="; }
revoke_bypass(){
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" NOBYPASSRLS;"
}
revoke_migrator_membership(){
  if [ "${MIGRATOR_OWNER_MEMBERSHIP_ADDED:-0}" = "1" ] && [ -n "${MIGRATOR_ROLE:-}" ] && [ "$MIGRATOR_ROLE" != "$DBROLE" ]; then
    if sudo -u postgres psql -v ON_ERROR_STOP=1 -c "REVOKE \"$DBROLE\" FROM \"$MIGRATOR_ROLE\";"; then
      MIGRATOR_OWNER_MEMBERSHIP_ADDED=0
      return 0
    fi
    return 1
  fi
}
assert_cleanup_elevation(){
  local bypass_state membership_exists
  bypass_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$DBROLE';")"
  [ "$bypass_state" = "false" ] || { echo "FATAL: role $DBROLE still has BYPASSRLS after cleanup (rolbypassrls=$bypass_state)" >&2; return 1; }
  if [ "${MIGRATOR_OWNER_MEMBERSHIP_GRANTED_THIS_RUN:-0}" = "1" ] && [ -n "${MIGRATOR_ROLE:-}" ] && [ "$MIGRATOR_ROLE" != "$DBROLE" ]; then
    membership_exists="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$MIGRATOR_ROLE', '$DBROLE', 'member');")"
    [ "$membership_exists" = "f" ] || { echo "FATAL: role $MIGRATOR_ROLE still has membership in $DBROLE after cleanup" >&2; return 1; }
  fi
}
cleanup_elevation(){
  local cleanup_status=0
  revoke_migrator_membership || cleanup_status=1
  revoke_bypass || cleanup_status=1
  assert_cleanup_elevation || cleanup_status=1
  return "$cleanup_status"
}
cleanup_exit(){
  local original_status=$?
  local cleanup_status
  set +e
  cleanup_elevation
  cleanup_status=$?
  cleanup_staged_inputs || cleanup_status=1
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

cleanup_staged_inputs(){
  if [ -z "${STAGED_INPUT_DIR:-}" ]; then return 0; fi
  [[ "$STAGED_INPUT_DIR" = /run/bersoncarebot/full-reset-input.* ]] || {
    echo "FATAL: refusing cleanup of unexpected staged input path" >&2
    return 1
  }
  sudo rm -f -- "$STAGED_INPUT_DIR/rubitime.csv"
  sudo rmdir -- "$STAGED_INPUT_DIR"
  STAGED_INPUT_DIR=""
}

cleanup_pre_destructive_exit(){
  local original_status=$?
  set +e
  cleanup_staged_inputs
  local cleanup_status=$?
  if [ "$original_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then exit "$cleanup_status"; fi
  exit "$original_status"
}

stage_hash_bound_rubitime_csv(){
  local staged_hash staged_meta
  sudo test -d /run/bersoncarebot && sudo test ! -L /run/bersoncarebot || {
    echo "FATAL: canonical /run/bersoncarebot directory is missing or symlinked" >&2
    exit 2
  }
  STAGED_INPUT_DIR="$(sudo mktemp -d -p /run/bersoncarebot full-reset-input.XXXXXX)"
  sudo chown root:deploy "$STAGED_INPUT_DIR"
  sudo chmod 0750 "$STAGED_INPUT_DIR"
  trap cleanup_pre_destructive_exit EXIT
  sudo install -o root -g deploy -m 0440 -- "$RUBITIME_CSV" "$STAGED_INPUT_DIR/rubitime.csv"
  sudo sync -f "$STAGED_INPUT_DIR/rubitime.csv"
  staged_meta="$(sudo -u deploy stat -Lc '%U:%G:%a' -- "$STAGED_INPUT_DIR/rubitime.csv")"
  [ "$staged_meta" = "root:deploy:440" ] || {
    echo "FATAL: staged Rubitime CSV protection mismatch" >&2
    exit 2
  }
  staged_hash="$(sudo -u deploy sha256sum -- "$STAGED_INPUT_DIR/rubitime.csv" | awk '{print $1}')"
  [ "${staged_hash,,}" = "${RUBITIME_CSV_SHA256,,}" ] || {
    echo "FATAL: staged Rubitime CSV SHA-256 mismatch" >&2
    exit 2
  }
  RUBITIME_CSV="$STAGED_INPUT_DIR/rubitime.csv"
  echo "   Rubitime CSV: immutable root-owned staged snapshot OK"
}

assert_staged_rubitime_csv_ready(){
  local staged_hash staged_meta
  [[ "$RUBITIME_CSV" = /run/bersoncarebot/full-reset-input.*/rubitime.csv ]] || {
    echo "FATAL: Rubitime chain must read only the staged snapshot" >&2
    exit 2
  }
  sudo -u deploy test -f "$RUBITIME_CSV" && sudo -u deploy test ! -L "$RUBITIME_CSV" || {
    echo "FATAL: staged Rubitime CSV is not a regular non-symlink file" >&2
    exit 2
  }
  staged_meta="$(sudo -u deploy stat -Lc '%U:%G:%a' -- "$RUBITIME_CSV")"
  [ "$staged_meta" = "root:deploy:440" ] || {
    echo "FATAL: staged Rubitime CSV protection changed" >&2
    exit 2
  }
  staged_hash="$(sudo -u deploy sha256sum -- "$RUBITIME_CSV" | awk '{print $1}')"
  [ "${staged_hash,,}" = "${RUBITIME_CSV_SHA256,,}" ] || {
    echo "FATAL: staged Rubitime CSV SHA-256 changed" >&2
    exit 2
  }
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

assert_test_runtime_mode_ready(){
  local label env_file mode
  for spec in "api:$API_ENV" "webapp:$WEBAPP_ENV"; do
    label="${spec%%:*}"
    env_file="${spec#*:}"
    mode="$(read_deploy_env_value "$env_file" DB_PRINCIPAL_CONTEXT_MODE)"
    mode="${mode:-legacy-guc}"
    [ "$mode" = "locked" ] || {
      echo "FATAL: $env_file must use DB_PRINCIPAL_CONTEXT_MODE=locked for strict TEST, got $mode" >&2
      exit 1
    }
    printf "   %-10s DB_PRINCIPAL_CONTEXT_MODE=locked (strict TEST runtime)\n" "$label:"
  done
}

assert_saas_test_fixture_packet_ready(){
  local validator="$FIXTURE_VALIDATOR_ROOT/deploy/host/saas-test-fixture-packet.mjs"
  [ -r "$validator" ] || { echo "FATAL: missing TEST fixture packet validator" >&2; exit 1; }
  sudo -u deploy env SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1 \
    node --input-type=module - "$SAAS_TEST_FIXTURE_ENV" < "$validator"
}

assert_locked_product_smoke_fixture_ready(){
  local fixture_path="${SAAS_PRODUCT_SMOKE_FIXTURE:-/run/bersoncarebot/saas-smoke.fixture}"
  local validator="$FIXTURE_VALIDATOR_ROOT/$LOCKED_SMOKE_FIXTURE_VALIDATOR"
  [ -r "$validator" ] || { echo "FATAL: missing locked product-smoke fixture validator" >&2; exit 1; }
  LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL="$(
    bash "$validator" --validate "$fixture_path" "$SRC_REPO" "$DEPLOY_REPO"
  )"
  sudo -u deploy test -r "$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL" || {
    echo "FATAL: locked product-smoke fixture is not readable by deploy" >&2
    exit 1
  }
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

  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v p2_b_owner_role="$P2_B_OWNER_ROLE" <<'SQL'
SELECT format('CREATE ROLE %I NOLOGIN BYPASSRLS', :'p2_b_owner_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_b_owner_role')
\gexec

ALTER ROLE :"p2_b_owner_role" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS app_ext;

DO $pgcrypto_schema$
DECLARE
  v_pgcrypto_schema text;
  v_conflicting_functions text[];
BEGIN
  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA app_ext;
  ELSIF v_pgcrypto_schema <> 'app_ext' THEN
    SELECT array_agg(
      format('%I.%I(%s)', source_namespace.nspname, source_proc.proname, pg_get_function_identity_arguments(source_proc.oid))
      ORDER BY source_namespace.nspname, source_proc.proname, source_proc.oid
    )
    INTO v_conflicting_functions
    FROM pg_depend dependency
    JOIN pg_extension ext ON ext.oid = dependency.refobjid
    JOIN pg_proc source_proc ON source_proc.oid = dependency.objid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_proc.pronamespace
    JOIN pg_proc target_proc ON target_proc.pronamespace = 'app_ext'::regnamespace
      AND target_proc.proname = source_proc.proname
      AND target_proc.proargtypes = source_proc.proargtypes
    WHERE ext.extname = 'pgcrypto'
      AND dependency.classid = 'pg_proc'::regclass
      AND dependency.deptype = 'e';

    IF coalesce(array_length(v_conflicting_functions, 1), 0) > 0 THEN
      RAISE EXCEPTION 'pgcrypto_app_ext_conflicting_functions: %', array_to_string(v_conflicting_functions, ', ');
    END IF;

    ALTER EXTENSION pgcrypto SET SCHEMA app_ext;
  END IF;

  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema <> 'app_ext' THEN
    RAISE EXCEPTION 'pgcrypto_must_be_installed_in_app_ext';
  END IF;
END
$pgcrypto_schema$;

GRANT USAGE ON SCHEMA app_ext TO :"p2_b_owner_role";

SELECT (to_regprocedure('app.is_staff()') IS NOT NULL)::int AS p2_b_app_is_staff_exists \gset
\if :p2_b_app_is_staff_exists
\else
\echo 'FATAL: p2_b_app_is_staff_missing_before_install.'
SELECT 1 / 0 AS p2_b_app_is_staff_missing_before_install;
\endif

SELECT format('ALTER FUNCTION app.is_staff() OWNER TO %I', :'p2_b_owner_role') \gexec

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE n.nspname = 'app'
    AND p.proname = 'is_staff'
    AND p.pronargs = 0
    AND r.rolname = :'p2_b_owner_role'
)::int AS p2_b_app_is_staff_owner_normalized \gset
\if :p2_b_app_is_staff_owner_normalized
\else
\echo 'FATAL: p2_b_app_is_staff_owner_not_normalized.'
SELECT 1 / 0 AS p2_b_app_is_staff_owner_not_normalized;
\endif
SQL

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
  local ok
  ok="$(sudo -u deploy bash -lc "set -a && . '$MEDIA_WORKER_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT (to_regnamespace('app') IS NOT NULL AND to_regprocedure('app.release_principal_context()') IS NOT NULL AND has_function_privilege(current_user, 'app.release_principal_context()', 'EXECUTE'))::text;\"")"
  [ "$ok" = "true" ] || { echo "FATAL: media-worker TEST runtime cannot see/execute app.release_principal_context()" >&2; exit 1; }
  echo "   app.release_principal_context: OK (visible + executable through media-worker DATABASE_URL)"
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
  discover_database_role_from_env "media-worker.test" "$MEDIA_WORKER_ENV"
}

bootstrap_and_provision_c4_operational_runtime(){
  sudo env \
    PROJECT_ROOT="$DEPLOY_REPO" \
    API_ENV_FILE="$API_ENV" \
    WEBAPP_ENV_FILE="$WEBAPP_ENV" \
    MEDIA_WORKER_ENV_FILE="$MEDIA_WORKER_ENV" \
    bash "$DEPLOY_REPO/$C4_OPERATIONAL_PROVISIONER" --bootstrap-test-env
  echo "   C4 operational bootstrap/provision: OK (five isolated TEST contours)"
}

reapply_c4_operational_runtime_overlays(){
  local diagnostic_role delivery_worker_role scheduler_role media_worker_role web_push_reminder_role
  diagnostic_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_DIAGNOSTIC)"
  delivery_worker_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_DELIVERY_WORKER)"
  scheduler_role="$(discover_database_role_from_env_key "api.test" "$API_ENV" DATABASE_URL_SCHEDULER)"
  media_worker_role="$(discover_media_worker_runtime_role)"
  web_push_reminder_role="$(discover_database_role_from_env_key "webapp.test" "$WEBAPP_ENV" DATABASE_URL_WEB_PUSH_REMINDER)"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v c4_diagnostic_login_role="$diagnostic_role" \
    -v c4_delivery_worker_login_role="$delivery_worker_role" \
    -v c4_scheduler_login_role="$scheduler_role" \
    -v c4_media_worker_login_role="$media_worker_role" \
    -f "$DEPLOY_REPO/$C4_OPERATIONAL_RUNTIME"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v c4_web_push_reminder_login_role="$web_push_reminder_role" \
    -f "$DEPLOY_REPO/$C4_WEB_PUSH_REMINDER_RUNTIME"
  echo "   C4 operational runtime overlays: OK (five isolated contours)"
}

assert_c4_operational_runtime_ready(){
  sudo -u deploy env \
    API_ENV_FILE="$API_ENV" \
    WEBAPP_ENV_FILE="$WEBAPP_ENV" \
    MEDIA_WORKER_ENV_FILE="$MEDIA_WORKER_ENV" \
    bash "$DEPLOY_REPO/$C4_OPERATIONAL_READINESS"
  echo "   C4 operational runtime readiness: OK (five distinct URLs; positive + cross-contour negatives)"
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

grant_api_runtime_migration_ledger_read(){
  local role_name
  role_name="$(discover_api_runtime_role)"
  validate_pg_identifier "api.test DATABASE_URL role" "$role_name"
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<SQL
GRANT USAGE ON SCHEMA integrator TO "$role_name";
GRANT SELECT ON TABLE integrator.schema_migrations TO "$role_name";
SQL
}

assert_api_runtime_can_read_migration_ledger(){
  local count
  count="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT count(*) FROM integrator.schema_migrations;\"")"
  [[ "$count" =~ ^[0-9]+$ ]] || { echo "FATAL: api.test runtime ledger SELECT returned non-numeric count: $count" >&2; exit 1; }
  [ "$count" -gt 0 ] || { echo "FATAL: integrator.schema_migrations is readable by api.test runtime but empty" >&2; exit 1; }
  echo "   integrator.schema_migrations: OK ($count rows readable by api.test runtime)"
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
  validate_pg_identifier "webapp.test media-worker DATABASE_URL role" "$media_worker_role"
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
    "$DBROLE" \
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

assert_integrator_server_runtime_config_ready(){
  local ok
  ok="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT (NOT (SELECT rolinherit FROM pg_roles WHERE rolname = current_user) AND 3 = (SELECT count(*) FROM pg_auth_members membership JOIN pg_roles member_role ON member_role.oid = membership.member JOIN pg_roles granted_role ON granted_role.oid = membership.roleid WHERE member_role.rolname = current_user AND granted_role.rolname IN ('app_staff', 'app_patient', 'app_worker') AND NOT membership.inherit_option AND membership.set_option) AND has_function_privilege(current_user, 'app.read_global_server_runtime_setting(text)', 'EXECUTE') AND has_function_privilege(current_user, 'app.read_integrator_smtp_outbound_setting()', 'EXECUTE') AND (SELECT count(*) FROM pg_proc procedure CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = current_user) AND privilege.privilege_type = 'EXECUTE' AND NOT privilege.is_grantable) = 1 AND NOT EXISTS (SELECT 1 FROM pg_proc procedure JOIN pg_roles owner ON owner.oid = procedure.proowner CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure AND (NOT procedure.prosecdef OR owner.rolname <> 'app_owner' OR privilege.grantee NOT IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = current_user)) OR privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable)) AND NOT EXISTS (SELECT 1 FROM pg_class relation CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) privilege WHERE relation.oid IN ('public.app_runtime_settings'::regclass, 'public.system_settings'::regclass) AND privilege.privilege_type = 'SELECT' AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = current_user))) AND NOT EXISTS (SELECT 1 FROM pg_class relation WHERE relation.oid IN ('public.app_runtime_settings'::regclass, 'public.system_settings'::regclass) AND pg_has_role(current_user, pg_get_userbyid(relation.relowner), 'MEMBER')) AND COALESCE((app.read_global_server_runtime_setting('app_base_url')->>'value') ~ '^https?://', false))::text;\"")"
  [ "$ok" = "true" ] || { echo "FATAL: integrator DB-backed runtime/SMTP accessors are not ready" >&2; exit 1; }
  echo "   integrator DB-backed runtime/SMTP accessors: OK (exact ACL, no table SELECT)"
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

grant_migrator_owner_membership(){
  local role_name="$1"
  local membership_exists
  validate_pg_identifier "webapp.test DATABASE_URL role" "$role_name"
  [ "$role_name" = "$DBROLE" ] && return 0
  membership_exists="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$role_name', '$DBROLE', 'member');")"
  if [ "$membership_exists" = "t" ]; then
    echo "FATAL: role $role_name already has membership in $DBROLE before deploy; clean up this pre-existing residue before rerunning deploy-test-saas.sh" >&2
    exit 1
  fi
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT \"$DBROLE\" TO \"$role_name\";" >/dev/null
  MIGRATOR_OWNER_MEMBERSHIP_ADDED=1
  MIGRATOR_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=1
}

assert_test_db_owner_ready(){
  validate_pg_identifier "DB role" "$DBROLE"
  local db_owner platform_users_owner
  db_owner="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB';")"
  [ "$db_owner" = "$DBROLE" ] || { echo "FATAL: $DB owner is '$db_owner', expected '$DBROLE'"; exit 1; }
  platform_users_owner="$(sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -tAc "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_users';")"
  [ "$platform_users_owner" = "$DBROLE" ] || { echo "FATAL: public.platform_users owner is '$platform_users_owner', expected '$DBROLE'"; exit 1; }
}

run_test_db_owner_sql_file(){
  local sql_file="$1"
  sudo -u deploy test -r "$sql_file" || { echo "FATAL: deploy cannot read SQL file: $sql_file"; exit 1; }
  validate_pg_identifier "DB role" "$DBROLE"
  {
    printf 'SET ROLE "%s";\n' "$DBROLE"
    sudo -u deploy cat "$sql_file"
    printf '\nRESET ROLE;\n'
  } | sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1
}

run_deploy_repo_with_test_db_owner_role(){
  local deploy_command="$1"
  local command_status cleanup_status
  if [ -z "${MIGRATOR_ROLE:-}" ]; then
    MIGRATOR_ROLE="$(discover_webapp_migrator_role)"
  fi
  grant_migrator_owner_membership "$MIGRATOR_ROLE"
  set +e
  sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \
    unset DATABASE_URL_STAFF DATABASE_URL_NONSTAFF DATABASE_URL_WEB_PUSH_REMINDER && \
    export DB_PRINCIPAL_CONTEXT_MODE=legacy-guc PGOPTIONS='-c role=$DBROLE' && \
    $deploy_command"
  command_status=$?
  cleanup_elevation
  cleanup_status=$?
  set -e
  [ "$cleanup_status" -eq 0 ] || return "$cleanup_status"
  return "$command_status"
}

run_deploy_repo_with_test_db_owner_bypass(){
  local deploy_command="$1"
  local command_status cleanup_status
  if [ -z "${MIGRATOR_ROLE:-}" ]; then
    MIGRATOR_ROLE="$(discover_webapp_migrator_role)"
  fi
  grant_migrator_owner_membership "$MIGRATOR_ROLE"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" BYPASSRLS;" >/dev/null
  set +e
  sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \
    unset DATABASE_URL_STAFF DATABASE_URL_NONSTAFF DATABASE_URL_WEB_PUSH_REMINDER && \
    export DB_PRINCIPAL_CONTEXT_MODE=legacy-guc PGOPTIONS='-c role=$DBROLE' && \
    $deploy_command"
  command_status=$?
  cleanup_elevation
  cleanup_status=$?
  set -e
  [ "$cleanup_status" -eq 0 ] || return "$cleanup_status"
  return "$command_status"
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

run_locked_product_smoke(){
  local fixture_path
  assert_locked_product_smoke_fixture_ready
  fixture_path="$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL"
  local smoke_dir
  smoke_dir="${SAAS_PRODUCT_SMOKE_OUTPUT_DIR:-/tmp/bcb-saas-product-smoke}"
  sudo install -d -o deploy -g deploy -m 0700 "$smoke_dir"
  local smoke_args=()
  if [ -n "${SAAS_PRODUCT_SMOKE_CATEGORIES:-}" ]; then
    smoke_args+=("--categories=$SAAS_PRODUCT_SMOKE_CATEGORIES")
  fi
  if [ -n "${SAAS_PRODUCT_SMOKE_SCENARIO_IDS:-}" ]; then
    smoke_args+=("--scenario-ids=$SAAS_PRODUCT_SMOKE_SCENARIO_IDS")
  fi
  sudo -u deploy node "$DEPLOY_REPO/docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs" \
    --mode=locked \
    --base-url="${SAAS_PRODUCT_SMOKE_BASE_URL:-https://test.bersoncare.ru}" \
    --fixture-file="$fixture_path" \
    --json-output="$smoke_dir/saas-product-smoke.json" \
    --junit-output="$smoke_dir/saas-product-smoke.junit.xml" \
    "${smoke_args[@]}"

  sudo -u deploy node "$DEPLOY_REPO/docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs" \
    --mode=locked \
    --base-url="${SAAS_PRODUCT_SMOKE_BASE_URL:-https://test.bersoncare.ru}" \
    --fixture-file="$fixture_path" \
    --include-mutations \
    --scenario-ids=global-admin.clinical-write.denied \
    --json-output="$smoke_dir/saas-product-smoke-global-admin-denial.json" \
    --junit-output="$smoke_dir/saas-product-smoke-global-admin-denial.junit.xml"
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
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v test_expected_database="$DB" \
    -v matrix_staff_role="$P2_B_STAFF_ROLE" \
    -v matrix_patient_role="$P2_B_PATIENT_ROLE" \
    -f "$DEPLOY_REPO/$OWNER_READY_LOCKED_MATRIX"
}

run_test_patient_identity_capability_gate(){
  local runtime_login_role
  runtime_login_role="$(discover_webapp_bootstrap_base_role)"
  validate_pg_identifier "patient identity runtime login role" "$runtime_login_role"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v patient_identity_runtime_login_role="$runtime_login_role" \
    -f "$DEPLOY_REPO/$TEST_PATIENT_IDENTITY_CAPABILITY_GATE"
}

run_b1_doctor_admin_identity_assertion(){
  if [ "${SAAS_B1_IDENTITY_ASSERTION_SKIP:-0}" = "1" ]; then
    echo "   B1 doctor/admin identity assertion: skipped (SAAS_B1_IDENTITY_ASSERTION_SKIP=1)"
    return 0
  fi

  run_deploy_repo_with_test_db_owner_role \
    "node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs \
      --execute \
      --allow-test-target \
      --required-current-user='$DBROLE' \
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

assert_webapp_test_operational_env_available(){
  local effective_environment_files
  sudo -u deploy test -r "$WEBAPP_ENV" || {
    echo "FATAL: deploy cannot read $WEBAPP_ENV before webapp TEST restart" >&2
    exit 1
  }
  sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && : \"\${DATABASE_URL_WEB_PUSH_REMINDER:?missing DATABASE_URL_WEB_PUSH_REMINDER}\""
  effective_environment_files="$(systemctl show bersoncarebot-webapp-test.service -p EnvironmentFiles --value)"
  printf '%s\n' "$effective_environment_files" | grep -Fxq "$WEBAPP_ENV (ignore_errors=no)" || {
    echo "FATAL: webapp TEST unit does not load exact required env $WEBAPP_ENV" >&2
    exit 1
  }
  echo "   webapp TEST unit operational env: OK (DATABASE_URL_WEB_PUSH_REMINDER available)"
}

assert_test_health_ok(){
  local health_response
  health_response="$(curl -fsk --max-time 10 https://test.bersoncare.ru/api/health)"
  [[ "$health_response" == *'"ok":true'* ]] || { echo "FATAL: health response missing ok=true: $health_response" >&2; exit 1; }
  [[ "$health_response" == *'"db":"up"'* ]] || { echo "FATAL: health response missing db=up: $health_response" >&2; exit 1; }
  echo "   health: OK ($health_response)"
}

assert_awg_relay_active(){
  systemctl is-active --quiet awg-quick@awg0 || { echo "FATAL: awg-quick@awg0 is not active" >&2; exit 1; }
  echo "   awg-quick@awg0: OK (active)"
}

run_strict_post_migration_closure(){
  assert_test_writers_stopped
  assert_cleanup_elevation

  log "strict closure: roles + grants"
  install_p0_5b_runtime_wall
  log "strict closure: protected principal helpers"
  install_p2_b_protected_principal_context
  log "strict closure: reviewed runtime overlays"
  rehydrate_post_restore_runtime_overlays
  log "strict closure: SaaS isolation telemetry privilege overlay"
  provision_saas_isolation_operator_login
  install_saas_isolation_telemetry_overlay
  install_saas_system_health_diagnostics_overlay
  install_integrator_server_runtime_config_overlay
  log "strict closure: reversible SaaS isolation TEST scenario proof"
  run_saas_isolation_test_scenario_proof
  if [ "$P2_B_CONTEXT_INSTALLED" = "1" ]; then
    assert_api_runtime_can_release_principal_context
  fi
  log "grant + verify integrator migration ledger runtime read"
  grant_api_runtime_migration_ledger_read
  assert_api_runtime_can_read_migration_ledger
  grant_webapp_bootstrap_base_login_d3_4

  log "strict closure: TEST settings override"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v test_settings_overlay_mode=code-only \
    -f "$DEPLOY_REPO/$OVERRIDE"

  log "strict closure: base policies -> safe specialized overlays -> exact FORCE assertions"
  apply_test_strict_rls_finalizer
  log "strict closure: C4 five-contour TEST env preflight + root provisioning"
  bootstrap_and_provision_c4_operational_runtime

  log "strict closure: separate privileged fixture seed + cleanup"
  run_deploy_repo_with_test_db_owner_bypass \
    "export SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1 && export SAAS_TEST_FIXTURE_ENV_FILE='$SAAS_TEST_FIXTURE_ENV' && pnpm --dir apps/webapp run seed:saas-test-walkthrough"
  assert_cleanup_elevation

  log "strict closure: locked patient identity capability gate"
  run_test_patient_identity_capability_gate

  log "strict closure: owner-ready locked DB matrix (transactional)"
  run_owner_ready_locked_db_matrix
  log "strict closure: post-matrix exact strict + FORCE reassertion"
  apply_test_strict_rls_finalizer
  reapply_c4_operational_runtime_overlays
  assert_c4_operational_runtime_ready
  assert_integrator_server_runtime_config_ready

  log "strict closure: restart locked TEST units"
  install_and_assert_media_worker_test_unit
  assert_webapp_test_operational_env_available
  mark_e1_runtime_coverage_start
  for unit_name in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$unit_name-test"; done
  sleep 4
  assert_test_units_active
  assert_test_health_ok
  log "A2 nginx forwarded-host preflight"
  apply_test_nginx_webapp_config
  run_a2_nginx_preflight
  log "A2 product smoke gate (mandatory locked)"
  run_locked_product_smoke
  log "E1 post-runtime coverage/read gate"
  run_e1_post_runtime_coverage_gate
  assert_awg_relay_active
  SERVICES_RELEASED=1
}

assert_strict_closure_deploy_checkout_ready(){
  local required_path
  for required_path in \
    "$OVERRIDE" "$P0_5B_ROLES" "$P0_5B_GRANTS" "$P2_B_CONTEXT" \
    "$ORGANIZATION_MEMBER_INVITES_RLS" "$PATIENT_INVITES_RLS" "$STORE_P0_ENTITLEMENTS_RLS" "$PATIENT_COURSE_WALL" \
    "$PUBLIC_BOOTSTRAP_RLS" "$SPECIALIST_OWNER_PROVISIONING_RLS" "$REFERENCE_CATALOG_RLS" "$PATIENT_VISIBLE_CATALOG_RLS" \
    "$RUNTIME_OVERLAY_APP_OWNER_HANDOFF" "$PATIENT_VAPID_ACCESSOR" "$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" "$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER" \
    "$D3_4_BOOTSTRAP_GRANTS" "$TEST_STRICT_RLS_FINALIZER" \
    "$TEST_PATIENT_IDENTITY_CAPABILITY_GATE" \
    "$SAAS_ISOLATION_TELEMETRY" "$SAAS_SYSTEM_HEALTH_DIAGNOSTICS" "$INTEGRATOR_SERVER_RUNTIME_CONFIG" \
    "$C4_OPERATIONAL_RUNTIME" "$C4_WEB_PUSH_REMINDER_RUNTIME" "$C4_OPERATIONAL_PROVISIONER" "$C4_OPERATIONAL_READINESS" \
    "$C4_OPERATIONAL_PASSWORD_SETTER" "$C4_OPERATIONAL_PASSWORD_SMOKE" \
    "$SAAS_ISOLATION_OPERATOR_PROVISIONER" "$OWNER_READY_LOCKED_MATRIX" \
    deploy/postgres/phase4-app-worker-narrow-rls.sql; do
    sudo -u deploy test -r "$DEPLOY_REPO/$required_path" || {
      echo "FATAL: deploy cannot read strict closure artifact: $DEPLOY_REPO/$required_path" >&2
      exit 1
    }
  done
  sudo node "$DEPLOY_REPO/deploy/host/bootstrap-c4-test-env.mjs" --check
  for env_file in "$API_ENV" "$WEBAPP_ENV"; do
    sudo -u deploy test -r "$env_file" || { echo "FATAL: deploy cannot read required env file: $env_file" >&2; exit 1; }
  done
  if [ -e "$MEDIA_WORKER_ENV" ]; then
    sudo -u deploy test -r "$MEDIA_WORKER_ENV" || {
      echo "FATAL: existing media-worker TEST env is not readable by deploy: $MEDIA_WORKER_ENV" >&2
      exit 1
    }
  fi
  assert_test_runtime_mode_ready
  assert_saas_test_fixture_packet_ready
  assert_locked_product_smoke_fixture_ready
}

run_c4_operational_chain_self_test(){
  bash -n "$SRC_REPO/deploy/host/deploy-test-saas.sh" \
    "$SRC_REPO/$C4_OPERATIONAL_PROVISIONER" \
    "$SRC_REPO/$C4_OPERATIONAL_READINESS"
  bash "$SRC_REPO/$C4_OPERATIONAL_PROVISIONER" --self-test
  bash "$SRC_REPO/$C4_OPERATIONAL_PASSWORD_SMOKE"
  node "$SRC_REPO/deploy/host/bootstrap-c4-test-env.mjs" --self-test
  node "$SRC_REPO/deploy/host/saas-c2-secret-preflight.mjs" --self-test
  (
    cd "$SRC_REPO"
    node "$C4_STATIC_CHECKER"
    node "$C4_STATIC_CHECKER" --self-test
  )
  echo "C4 canonical fresh wrapper segment self-test: OK (no env/DB/service/cron mutation)"
}

full_reset_usage(){
  cat <<'EOF'
Usage:
  bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
    --rubitime-csv=/secure/input.csv --rubitime-csv-sha256=<sha256> \
    --fio-manifest=/secure/fio-manifest.json --fio-manifest-file-sha256=<sha256> \
    --fio-manifest-sha256=<sha256> --fio-review-source-sha256=<sha256> \
    [branch]

This command destroys and recreates bersoncarebot_test from a fresh production dump. It is only for an
owner-authorized full migration rehearsal. For ordinary code deploys use:
  bash deploy/host/deploy-test.sh [branch]

Protected Rubitime/FIO inputs must be regular, non-symlink files owned by deploy with mode 0600. Their hashes
bind this run to the exact owner-reviewed inputs. No patient data is printed by this wrapper.
EOF
}

parse_full_reset_args(){
  local arg positional_seen=0
  for arg in "$@"; do
    case "$arg" in
      --confirm-full-reset) CONFIRM_FULL_RESET=1 ;;
      --rubitime-csv=*) RUBITIME_CSV="${arg#*=}" ;;
      --rubitime-csv-sha256=*) RUBITIME_CSV_SHA256="${arg#*=}" ;;
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
  [ -n "$RUBITIME_CSV" ] || { echo "FATAL: --rubitime-csv is required for a data-complete reset" >&2; exit 2; }
  [ -n "$RUBITIME_CSV_SHA256" ] || { echo "FATAL: --rubitime-csv-sha256 is required" >&2; exit 2; }
  [ -n "$FIO_MANIFEST" ] || { echo "FATAL: --fio-manifest is required for a data-complete reset" >&2; exit 2; }
  [ -n "$FIO_MANIFEST_FILE_SHA256" ] || { echo "FATAL: --fio-manifest-file-sha256 is required" >&2; exit 2; }
  [ -n "$FIO_MANIFEST_SHA256" ] || { echo "FATAL: --fio-manifest-sha256 is required" >&2; exit 2; }
  [ -n "$FIO_REVIEW_SOURCE_SHA256" ] || { echo "FATAL: --fio-review-source-sha256 is required" >&2; exit 2; }
  [[ "$FIO_MANIFEST_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "FATAL: --fio-manifest-sha256 must be 64 hex characters" >&2; exit 2; }
  [[ "$FIO_REVIEW_SOURCE_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "FATAL: --fio-review-source-sha256 must be 64 hex characters" >&2; exit 2; }
  FIO_MANIFEST_SHA256="${FIO_MANIFEST_SHA256,,}"
  FIO_REVIEW_SOURCE_SHA256="${FIO_REVIEW_SOURCE_SHA256,,}"
}

assert_hash_bound_protected_input(){
  local label="$1" path="$2" expected_hash="$3" owner_mode actual_hash
  [[ "$expected_hash" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "FATAL: $label SHA-256 must be 64 hex characters" >&2; exit 2; }
  [[ "$path" = /* ]] || { echo "FATAL: $label path must be absolute" >&2; exit 2; }
  sudo -u deploy test -f "$path" && sudo -u deploy test ! -L "$path" || {
    echo "FATAL: $label must be a regular non-symlink file" >&2
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

case "${1:-}" in
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
    log "DONE — shared strict TEST post-migration closure"
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
assert_hash_bound_protected_input "Rubitime CSV" "$RUBITIME_CSV" "$RUBITIME_CSV_SHA256"
assert_hash_bound_protected_input "FIO manifest" "$FIO_MANIFEST" "$FIO_MANIFEST_FILE_SHA256"
stage_hash_bound_rubitime_csv
[ -r "$RESTORE" ] || { echo "FATAL: missing required file: $RESTORE"; exit 1; }
[ -r "$SRC_REPO/$OVERRIDE" ] || { echo "FATAL: missing repo file: $SRC_REPO/$OVERRIDE"; exit 1; }
[ -r "$SRC_REPO/$C4D_MEDIA_OWNER_ONLINE_INDEX" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4D_MEDIA_OWNER_ONLINE_INDEX"; exit 1; }
[ -r "$SRC_REPO/$P0_5B_ROLES" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P0_5B_ROLES"; exit 1; }
[ -r "$SRC_REPO/$P0_5B_GRANTS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P0_5B_GRANTS"; exit 1; }
[ -r "$SRC_REPO/$P2_B_CONTEXT" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P2_B_CONTEXT"; exit 1; }
[ -r "$SRC_REPO/$RUNTIME_OVERLAY_APP_OWNER_HANDOFF" ] || { echo "FATAL: missing repo file: $SRC_REPO/$RUNTIME_OVERLAY_APP_OWNER_HANDOFF"; exit 1; }
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
[ -r "$SRC_REPO/$SAAS_SYSTEM_HEALTH_DIAGNOSTICS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_SYSTEM_HEALTH_DIAGNOSTICS"; exit 1; }
[ -r "$SRC_REPO/$INTEGRATOR_SERVER_RUNTIME_CONFIG" ] || { echo "FATAL: missing repo file: $SRC_REPO/$INTEGRATOR_SERVER_RUNTIME_CONFIG"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_RUNTIME" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_RUNTIME"; exit 1; }
[ -r "$SRC_REPO/$C4_WEB_PUSH_REMINDER_RUNTIME" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_WEB_PUSH_REMINDER_RUNTIME"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_PROVISIONER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_PROVISIONER"; exit 1; }
[ -r "$SRC_REPO/$C4_OPERATIONAL_READINESS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$C4_OPERATIONAL_READINESS"; exit 1; }
[ -x "$SRC_REPO/$C4_OPERATIONAL_PASSWORD_SETTER" ] || { echo "FATAL: missing executable repo file: $SRC_REPO/$C4_OPERATIONAL_PASSWORD_SETTER"; exit 1; }
[ -x "$SRC_REPO/$C4_OPERATIONAL_PASSWORD_SMOKE" ] || { echo "FATAL: missing executable repo file: $SRC_REPO/$C4_OPERATIONAL_PASSWORD_SMOKE"; exit 1; }
[ -r "$SRC_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION" ] || { echo "FATAL: missing repo file: $SRC_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION"; exit 1; }
[ -r "$SRC_REPO/$SAAS_ISOLATION_OPERATOR_PROVISIONER" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SAAS_ISOLATION_OPERATOR_PROVISIONER"; exit 1; }
sudo node "$SRC_REPO/deploy/host/bootstrap-c4-test-env.mjs" --check
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
log "SaaS TEST fixture operator packet preflight"
assert_saas_test_fixture_packet_ready
log "locked product-smoke fixture preflight"
assert_locked_product_smoke_fixture_ready

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

log "stop TEST writers before restore/migration"
for u in "${UNITS[@]}"; do sudo systemctl stop "bersoncarebot-$u-test"; done
WRITERS_STOPPED=1
assert_test_writers_stopped

# 1. fresh test DB = FRESH dump streamed from LIVE prod (read-only pg_dump over ssh; no file left on prod).
#    Override with DUMP=/path env to reuse a pre-pulled dump. Do NOT fall back to /opt/backups here —
#    those are the DEAD local copy; a silent stale restore is exactly the bug that wasted hours.
if [ -z "${DUMP:-}" ]; then
  DUMP=/tmp/bcb-prod-fresh.dump
  log "pull FRESH dump from live prod ($PROD_SSH:$PROD_DB) → $DUMP"
  umask 077
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
sudo -u postgres bash "$RESTORE" "$DUMP"
assert_test_db_owner_ready

# 2. DATA-FIX first (the missing step — deploy-saas-667.sh Step 2)
log "data-fix (doctor/admin split)"
run_test_db_owner_sql_file "$DEPLOY_REPO/$DATAFIX"

# 3. migrate integrator + webapp Drizzle with TEMP BYPASSRLS (backfills under FORCE RLS), then revoke
log "migrate (temp BYPASSRLS)"
MIGRATOR_ROLE="$(discover_webapp_migrator_role)"
grant_migrator_owner_membership "$MIGRATOR_ROLE"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $DBROLE BYPASSRLS;"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && \
  export PGOPTIONS='-c role=$DBROLE' && \
  API_ENV_FILE='$API_ENV' WEBAPP_ENV_FILE='$WEBAPP_ENV' pnpm migrate"
cleanup_elevation
CNT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;")"
[ "${CNT:-0}" -ge 178 ] || { echo "FATAL: drizzle migration count ${CNT:-0} < 178"; exit 1; }
for col in "system_settings.organization_id" "user_phone_history.organization_id"; do
  t="${col%.*}"; c="${col#*.}"
  ok="$(sudo -u postgres psql -d "$DB" -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$t' AND column_name='$c');")"
  [ "$ok" = "t" ] || { echo "FATAL: missing column $col after migrate"; exit 1; }
done
echo "   drizzle migrations = $CNT (org columns present)"

# media_files is already large. Build the C4D owner index as a separate autocommit psql
# operation after Drizzle has committed, never inside its migration transaction.
log "C4D media owner index (online, transaction-free)"
sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
  -f "$DEPLOY_REPO/$C4D_MEDIA_OWNER_ONLINE_INDEX"

# 4. test-only settings override (repo-tracked; post-migrate partial-index upserts, send-safety,
#    maintenance, allowlist, identity role-allowlist normalization, DB lock). Applied from the deploy
#    checkout so it is version-matched to the branch.
log "test settings override"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 \
  -v test_settings_overlay_mode=reset \
  -f "$DEPLOY_REPO/$OVERRIDE"

# 5. Full canonical Rubitime/history normalization while all writers are still stopped. The one-pass wrapper owns
#    placeholder cleanup, specialist consolidation, all cleanup/import passes (including the mandatory second
#    non-confirmed pass after import), aggregate audits, and retirement gates. No service is started between restore
#    and this data normalization.
log "canonical Rubitime/history cleanup-import chain"
assert_staged_rubitime_csv_ready
rubitime_csv_q="$(shell_quote "$RUBITIME_CSV")"
run_deploy_repo_with_test_db_owner_role \
  "pnpm run rubitime:db-cleanup:one-pass -- --csv=$rubitime_csv_q --execute --commit-cleanup --allow-test-target --canonical-specialist='$CANONICAL_SPECIALIST' --org-id='$ORG_ID'"

# 6. Apply the exact owner-reviewed FIO decisions. The manifest and original review are separately hash-bound;
#    the script re-attests the exact loopback TEST DB, locks rows, fails on unlisted drift, persists a private
#    rollback artifact before mutation, and performs one conditional transaction. Temporary BYPASS is limited to
#    this stopped-writers data-migration window and is revoked/asserted by the shared helper.
log "owner-reviewed FIO manifest apply"
fio_manifest_q="$(shell_quote "$FIO_MANIFEST")"
fio_manifest_sha_q="$(shell_quote "$FIO_MANIFEST_SHA256")"
fio_review_source_sha_q="$(shell_quote "$FIO_REVIEW_SOURCE_SHA256")"
fio_rollback_dir_q="$(shell_quote "$DEPLOY_REPO/.tmp/fio-owner-review-rollback")"
run_deploy_repo_with_test_db_owner_bypass \
  "pnpm --dir apps/webapp run fio:owner-reviewed-test:apply -- --test --manifest $fio_manifest_q --confirm-manifest-sha256 $fio_manifest_sha_q --confirm-review-source-sha256 $fio_review_source_sha_q --rollback-dir $fio_rollback_dir_q"

# 7. end-state self-check (reproducibility gate — same asserted state every run, from zero)
log "verify end-state"
ACTIVE="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_specialists WHERE is_active=true;")"
[ "${ACTIVE:-0}" = "1" ] || { echo "FATAL: expected exactly 1 active specialist, got ${ACTIVE:-0}"; exit 1; }
ORPHAN="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id IS NULL OR specialist_id IN (SELECT id FROM be_specialists WHERE is_active=false);")"
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

# Both supported TEST deploy paths converge here.  This shared closure owns roles/helpers/grants,
# strict base + safe specialized overlays, exact FORCE assertions, the separate fixture privilege
# window, restart, fail-closed health checks, and the mandatory locked product smoke.
FIXTURE_VALIDATOR_ROOT="$DEPLOY_REPO"
assert_strict_closure_deploy_checkout_ready
run_strict_post_migration_closure
log "DONE — full data-ready TEST migration (Rubitime history + reviewed FIO + locked runtime verified)"
