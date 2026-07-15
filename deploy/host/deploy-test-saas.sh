#!/usr/bin/env bash
# deploy-test-saas.sh — ONE clean cycle from zero: fresh prod-copy test DB → deploy branch code →
# apply the SaaS migration chain the CORRECT way (#667/#708) → restart test units → verify healthy.
# Runtime mode is TEST-env selected: legacy-guc, shadow, or locked after migrations. Proven sequence;
# see docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md.
#
# Why the plain deploy-test.sh is not enough:
#   - a migration asserts the doctor/admin membership seed → needs p0-data-fix-doctor-admin-split.sql FIRST;
#   - some migrations backfill under already-installed FORCE RLS → need a TEMP BYPASSRLS migrator.
#   - this wrapper owns the DDL/backfill migration window via temporary owner authority.
#     TEST services may run DB_PRINCIPAL_CONTEXT_MODE=legacy-guc|shadow|locked after migrations:
#     integrator API startup must not attempt DDL migrations in shadow/locked runtime mode.
#
# Run as user `dev` (uses sudo for postgres/deploy/systemctl). Idempotent: recreates the test DB every run.
# Usage:  bash deploy/host/deploy-test-saas.sh [branch]   (default: auto/code-pg-delta)
set -euo pipefail

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
BRANCH="${1:-auto/code-pg-delta}"
API_ENV=/opt/env/bersoncarebot/api.test
WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
SAAS_TEST_FIXTURE_ENV=/opt/env/bersoncarebot/saas-test-fixture.env
BUNDLE=/tmp/bcb-test-deploy.bundle
DB=bersoncarebot_test
DBROLE=bersoncarebot_test
RESTORE=/tmp/bcb-test-setup/restore-test-db.sh
OVERRIDE=deploy/postgres/test-settings-override.sql   # repo-tracked (was /tmp); post-migrate partial-index upserts + identity normalization
DATAFIX=deploy/postgres/p0-data-fix-doctor-admin-split.sql
P0_5B_ROLES=deploy/postgres/p0-5b-role-split-staff-patient.sql
P0_5B_GRANTS=deploy/postgres/p0-5b-grants.sql
P2_B_CONTEXT=deploy/postgres/p2-b-protected-principal-context.sql
ORGANIZATION_MEMBER_INVITES_RLS=deploy/postgres/organization-member-invites-rls.sql
STORE_P0_ENTITLEMENTS_RLS=deploy/postgres/store-p0-entitlements-rls.sql
PATIENT_COURSE_WALL=deploy/postgres/patient-course-assignment-wall.sql
PUBLIC_BOOTSTRAP_RLS=deploy/postgres/specialist-signup-public-bootstrap-rls.sql
SPECIALIST_OWNER_PROVISIONING_RLS=deploy/postgres/specialist-owner-provisioning-rls.sql
PATIENT_VAPID_ACCESSOR=deploy/postgres/patient-web-push-vapid-public-key-accessor.sql
D3_4_BOOTSTRAP_GRANTS=deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql
UNITS=(api worker scheduler webapp media-worker)
MIGRATOR_ROLE=""
MIGRATOR_OWNER_MEMBERSHIP_ADDED=0
MIGRATOR_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0
P2_B_OWNER_ROLE=app_owner
P2_B_STAFF_ROLE=app_staff
P2_B_PATIENT_ROLE=app_patient
P2_B_SIGNING_SECRET_VALUE=""
P2_B_CONTEXT_INSTALLED=0

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
  if [ "$original_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then
    exit "$cleanup_status"
  fi
  exit "$original_status"
}

validate_pg_identifier(){
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "FATAL: $label must be a simple PostgreSQL identifier, got: $value" >&2
    exit 1
  fi
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
    case "$mode" in
      legacy-guc)
        printf "   %-10s DB_PRINCIPAL_CONTEXT_MODE=legacy-guc (dormant)\n" "$label:"
        ;;
      shadow|locked)
        printf "   %-10s DB_PRINCIPAL_CONTEXT_MODE=%s (runtime locked; startup DDL disabled)\n" "$label:" "$mode"
        ;;
      *)
        echo "FATAL: $env_file has unsupported DB_PRINCIPAL_CONTEXT_MODE=$mode; expected legacy-guc, shadow, or locked" >&2
        exit 1
        ;;
    esac
  done
}

assert_saas_test_fixture_packet_ready(){
  local validator="$SRC_REPO/deploy/host/saas-test-fixture-packet.mjs"
  [ -r "$validator" ] || { echo "FATAL: missing TEST fixture packet validator" >&2; exit 1; }
  sudo -u deploy env SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1 \
    node --input-type=module - "$SAAS_TEST_FIXTURE_ENV" < "$validator"
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
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$ORGANIZATION_MEMBER_INVITES_RLS"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$STORE_P0_ENTITLEMENTS_RLS"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PATIENT_COURSE_WALL"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PUBLIC_BOOTSTRAP_RLS"
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS"
  if [ "$P2_B_CONTEXT_INSTALLED" = "1" ]; then
    sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PATIENT_VAPID_ACCESSOR"
  fi
  echo "   post-restore runtime overlays: OK"
}

assert_api_runtime_can_release_principal_context(){
  local ok
  ok="$(sudo -u deploy bash -lc "set -a && . '$API_ENV' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT (to_regnamespace('app') IS NOT NULL AND to_regprocedure('app.release_principal_context()') IS NOT NULL AND has_function_privilege(current_user, 'app.release_principal_context()', 'EXECUTE'))::text;\"")"
  [ "$ok" = "true" ] || { echo "FATAL: api.test runtime cannot see/execute app.release_principal_context()" >&2; exit 1; }
  echo "   app.release_principal_context: OK (visible + executable by api.test runtime)"
}

discover_database_role_from_env(){
  local label="$1"
  local env_file="$2"
  local identity role_name database_name
  identity="$(sudo -u deploy bash -lc "set -a && . '$env_file' && set +a && psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  role_name="${identity%%|*}"
  database_name="${identity#*|}"
  validate_pg_identifier "$label DATABASE_URL role" "$role_name"
  [ "$database_name" = "$DB" ] || { echo "FATAL: $label DATABASE_URL points to '$database_name', expected '$DB'"; exit 1; }
  printf '%s\n' "$role_name"
}

discover_webapp_migrator_role(){
  discover_database_role_from_env "webapp.test" "$WEBAPP_ENV"
}

discover_webapp_bootstrap_base_role(){
  local identity role_name database_name
  identity="$(sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && db_url=\"\${DATABASE_URL_NONSTAFF:-\${DATABASE_URL:-}}\" && [ -n \"\$db_url\" ] && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\"")"
  role_name="${identity%%|*}"
  database_name="${identity#*|}"
  validate_pg_identifier "webapp.test bootstrap DATABASE_URL_NONSTAFF/DATABASE_URL role" "$role_name"
  [ "$database_name" = "$DB" ] || { echo "FATAL: webapp.test bootstrap DB URL points to '$database_name', expected '$DB'"; exit 1; }
  printf '%s\n' "$role_name"
}

discover_api_runtime_role(){
  discover_database_role_from_env "api.test" "$API_ENV"
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
  local role_name
  role_name="$(discover_webapp_bootstrap_base_role)"
  validate_pg_identifier "webapp.test bootstrap DATABASE_URL_NONSTAFF/DATABASE_URL role" "$role_name"
  sudo -u deploy test -r "$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS" || {
    echo "FATAL: deploy cannot read SQL file: $DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS" >&2
    exit 1
  }
  sudo -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 \
    -v d3_4_bootstrap_base_role="$role_name" \
    -f "$DEPLOY_REPO/$D3_4_BOOTSTRAP_GRANTS"
  echo "   D3.4 bootstrap/base-login grants: OK (webapp.test role $role_name)"
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
    export PGOPTIONS='-c role=$DBROLE' && \
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
    export PGOPTIONS='-c role=$DBROLE' && \
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

run_a2_product_smoke_if_configured(){
  if [ -z "${SAAS_PRODUCT_SMOKE_FIXTURE:-}" ]; then
    echo "   saas product smoke: skipped (SAAS_PRODUCT_SMOKE_FIXTURE not set)"
    return 0
  fi

  [ -r "$SAAS_PRODUCT_SMOKE_FIXTURE" ] || { echo "FATAL: SAAS_PRODUCT_SMOKE_FIXTURE is not readable: $SAAS_PRODUCT_SMOKE_FIXTURE"; exit 1; }
  local smoke_dir
  smoke_dir="${SAAS_PRODUCT_SMOKE_OUTPUT_DIR:-/tmp/bcb-saas-product-smoke}"
  mkdir -p "$smoke_dir"
  local smoke_args=()
  if [ -n "${SAAS_PRODUCT_SMOKE_CATEGORIES:-}" ]; then
    smoke_args+=("--categories=$SAAS_PRODUCT_SMOKE_CATEGORIES")
  fi
  if [ -n "${SAAS_PRODUCT_SMOKE_SCENARIO_IDS:-}" ]; then
    smoke_args+=("--scenario-ids=$SAAS_PRODUCT_SMOKE_SCENARIO_IDS")
  fi
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs \
    --mode="${SAAS_PRODUCT_SMOKE_MODE:-dormant}" \
    --base-url="${SAAS_PRODUCT_SMOKE_BASE_URL:-https://test.bersoncare.ru}" \
    --fixture-file="$SAAS_PRODUCT_SMOKE_FIXTURE" \
    --json-output="$smoke_dir/saas-product-smoke.json" \
    --junit-output="$smoke_dir/saas-product-smoke.junit.xml" \
    "${smoke_args[@]}"
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

# 0. preflight (env files are deploy-owned → check as deploy, not as dev)
[ -r "$RESTORE" ] || { echo "FATAL: missing required file: $RESTORE"; exit 1; }
[ -r "$SRC_REPO/$OVERRIDE" ] || { echo "FATAL: missing repo file: $SRC_REPO/$OVERRIDE"; exit 1; }
[ -r "$SRC_REPO/$P0_5B_ROLES" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P0_5B_ROLES"; exit 1; }
[ -r "$SRC_REPO/$P0_5B_GRANTS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P0_5B_GRANTS"; exit 1; }
[ -r "$SRC_REPO/$P2_B_CONTEXT" ] || { echo "FATAL: missing repo file: $SRC_REPO/$P2_B_CONTEXT"; exit 1; }
[ -r "$SRC_REPO/$ORGANIZATION_MEMBER_INVITES_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$ORGANIZATION_MEMBER_INVITES_RLS"; exit 1; }
[ -r "$SRC_REPO/$STORE_P0_ENTITLEMENTS_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$STORE_P0_ENTITLEMENTS_RLS"; exit 1; }
[ -r "$SRC_REPO/$PATIENT_COURSE_WALL" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PATIENT_COURSE_WALL"; exit 1; }
[ -r "$SRC_REPO/$PUBLIC_BOOTSTRAP_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PUBLIC_BOOTSTRAP_RLS"; exit 1; }
[ -r "$SRC_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$SPECIALIST_OWNER_PROVISIONING_RLS"; exit 1; }
[ -r "$SRC_REPO/$PATIENT_VAPID_ACCESSOR" ] || { echo "FATAL: missing repo file: $SRC_REPO/$PATIENT_VAPID_ACCESSOR"; exit 1; }
[ -r "$SRC_REPO/$D3_4_BOOTSTRAP_GRANTS" ] || { echo "FATAL: missing repo file: $SRC_REPO/$D3_4_BOOTSTRAP_GRANTS"; exit 1; }
for f in "$API_ENV" "$WEBAPP_ENV"; do
  sudo -u deploy test -r "$f" || { echo "FATAL: deploy cannot read required env file: $f"; exit 1; }
done
log "TEST runtime mode preflight"
assert_test_runtime_mode_ready
log "SaaS TEST fixture operator packet preflight"
assert_saas_test_fixture_packet_ready
trap cleanup_exit EXIT   # NEVER leave BYPASSRLS or owner-role membership on

# 1. fresh test DB = FRESH dump streamed from LIVE prod (read-only pg_dump over ssh; no file left on prod).
#    Override with DUMP=/path env to reuse a pre-pulled dump. Do NOT fall back to /opt/backups here —
#    those are the DEAD local copy; a silent stale restore is exactly the bug that wasted hours.
if [ -z "${DUMP:-}" ]; then
  DUMP=/tmp/bcb-prod-fresh.dump
  log "pull FRESH dump from live prod ($PROD_SSH:$PROD_DB) → $DUMP"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH" "sudo -u postgres pg_dump -Fc --no-owner --no-acl $PROD_DB" > "$DUMP"
  chmod 644 "$DUMP"
fi
[ -s "$DUMP" ] || { echo "FATAL: dump missing/empty: $DUMP"; exit 1; }
log "restore $DB from $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"
sudo -u postgres bash "$RESTORE" "$DUMP"
assert_test_db_owner_ready

# 2. deliver branch code (bundle → checkout → build); deploy user cannot read /home/dev, so bundle via /tmp
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

# 3. DATA-FIX first (the missing step — deploy-saas-667.sh Step 2)
log "data-fix (doctor/admin split)"
run_test_db_owner_sql_file "$DEPLOY_REPO/$DATAFIX"

# 4. migrate integrator + webapp Drizzle with TEMP BYPASSRLS (backfills under FORCE RLS), then revoke
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
log "install P0.5b runtime wall"
install_p0_5b_runtime_wall
log "install + verify protected DB principal context"
install_p2_b_protected_principal_context
log "rehydrate post-restore runtime overlays"
rehydrate_post_restore_runtime_overlays
if [ "$P2_B_CONTEXT_INSTALLED" = "1" ]; then
  assert_api_runtime_can_release_principal_context
fi
log "grant + verify integrator migration ledger runtime read"
grant_api_runtime_migration_ledger_read
assert_api_runtime_can_read_migration_ledger
log "grant D3.4 webapp bootstrap/base-login direct surface"
grant_webapp_bootstrap_base_login_d3_4

# 5. test-only settings override (repo-tracked; post-migrate partial-index upserts, send-safety,
#    maintenance, allowlist, identity role-allowlist normalization, DB lock). Applied from the deploy
#    checkout so it is version-matched to the branch.
log "test settings override"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$OVERRIDE"

# 6. consolidate duplicate specialists → one canonical (idempotent; deterministic pinned --canonical).
#    Historical rubitime-per-branch dups split the owner's appointments/working-hours across TWO
#    "Дмитрий Берсон" be_specialists rows, so the solo-model resolver (resolveDoctorOwnSpecialistId)
#    picks arbitrarily and the doctor sees a partial/empty schedule. The consolidation REPOINTS every FK
#    ref of the dup → canonical and SOFT-deactivates the dup (never deletes appointment data). Idempotent:
#    a 2nd run finds 0 dups and changes 0 rows.
log "consolidate duplicate specialists → $CANONICAL_SPECIALIST"
run_deploy_repo_with_test_db_owner_role \
  "pnpm --dir apps/webapp run consolidate-specialist-identity -- --commit --canonical='$CANONICAL_SPECIALIST' --org='$ORG_ID'"

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

# 8. Reconcile the repo-managed A/B walkthrough fixture after every fresh restore. Credentials live only
#    in the protected external TEST packet. The seeder re-asserts current_database()=bersoncarebot_test,
#    performs no external calls, and logs only aggregate fixture shape.
log "reconcile SaaS S3 TEST walkthrough fixture"
run_deploy_repo_with_test_db_owner_bypass \
  "export SAAS_TEST_FIXTURE_ENV_FILE='$SAAS_TEST_FIXTURE_ENV' && pnpm --dir apps/webapp run seed:saas-test-walkthrough"

# 9. restart test units + verify (and that the prod WireGuard relay is untouched)
log "restart test units"
for u in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$u-test"; done
sleep 4
assert_test_units_active
assert_test_health_ok
log "A2 nginx forwarded-host preflight"
apply_test_nginx_webapp_config
run_a2_nginx_preflight
log "A2 product smoke gate"
run_a2_product_smoke_if_configured
assert_awg_relay_active
log "DONE — fresh-dump hard rehearsal from zero (runtime mode legacy-guc|shadow|locked verified after migrations)"
