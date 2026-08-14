#!/bin/bash
# =============================================================================
# deploy-test.sh — доставить ТЕКУЩУЮ ветку dev-репо в ТЕСТ-окружение (151.x).
#
# КОНТЕКСТ (почему так, а не `git pull` как на проде):
#   • Ветки `test` и авто-деплоя НЕТ. CI не деплоит test.
#   • Деплой-репо `/opt/projects/bersoncarebot-test` принадлежит `deploy`, а тот
#     НЕ читает `/home/dev` (0750) → remote `localrepo` под deploy не работает,
#     а push в GitHub гейтован. Поэтому ветку переносим **git-bundle через /tmp**
#     (world-readable): полная история, без push, без проблем с правами.
#   • TEST = одноразовое ЗЕРКАЛО dev-ветки → checkout **force-align (reset --hard)**,
#     НИКАКОГО merge (на тесте нечего хранить).
#   • Send-safety НЕ зависит от кода: `DEV_DELIVERY_REDIRECT=1`, `MAX_ENABLED=false`,
#     `SMSC_ENABLED=false`, `DEV_REDIRECT_PASSTHROUGH_*` зашиты в `api.test` (env).
#
# ЗАПУСК: от пользователя `dev` (использует sudo для deploy/systemctl).
#   bash deploy/host/deploy-test.sh [ветка]      # по умолчанию feat/doctor-ui-rebuild
# =============================================================================
set -euo pipefail

# Transcript. On 2026-07-26 a deploy went red, its cleanup stopped all five TEST units, and by the time
# anyone looked the only surviving evidence was systemd's "Stopping…" lines — the reason the deploy failed
# was gone. Which gate went red is still unknown. Nothing about that investigation was possible because this
# script wrote its output to a terminal nobody kept.
#
# Everything below is teed to a per-run file. This runs BEFORE the first FATAL check so an early abort is
# captured too. Kept out of the repo tree deliberately (it records env-file paths and role names) and out of
# /tmp, which is world-readable and swept.
DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-$HOME/.local/state/bersoncarebot/deploy-logs}"
if [ -z "${BCB_DEPLOY_LOG_ACTIVE:-}" ]; then
  mkdir -p "$DEPLOY_LOG_DIR"
  chmod 700 "$DEPLOY_LOG_DIR" 2>/dev/null || true
  DEPLOY_LOG_FILE="$DEPLOY_LOG_DIR/deploy-test-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
  export BCB_DEPLOY_LOG_ACTIVE=1
  echo "[deploy-test] transcript: $DEPLOY_LOG_FILE"
  # Re-exec through tee so both streams are captured while still reaching the terminal. The exit code must be
  # the SCRIPT's, not tee's — otherwise a red deploy reports success, which is the failure mode this whole
  # change exists to stop. `set -o pipefail` alone is not enough (it would return tee's status on success),
  # so take PIPESTATUS[0] explicitly, and disable errexit around the call so a non-zero run still reaches it.
  # `bash "$0"`, not `"$0"` — the documented invocation is `bash deploy/host/deploy-test.sh`, so the exec bit
  # is not guaranteed and re-execing the path directly would fail with 126 before anything ran. Caught by a
  # probe of this very wrapper.
  set +e
  bash "$0" "$@" 2>&1 | tee "$DEPLOY_LOG_FILE"
  deploy_status="${PIPESTATUS[0]}"
  set -e
  # Keep the last 40 transcripts; they are small, and a full disk is its own outage.
  ls -1t "$DEPLOY_LOG_DIR"/deploy-test-*.log 2>/dev/null | tail -n +41 | xargs -r rm -f
  echo "[deploy-test] transcript saved: $DEPLOY_LOG_FILE (exit $deploy_status)"
  exit "$deploy_status"
fi

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
BRANCH="${1:-feat/doctor-ui-rebuild}"
API_ENV=/opt/env/bersoncarebot/api.test
WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
MEDIA_WORKER_ENV=/opt/env/bersoncarebot/media-worker.test
BUNDLE=/tmp/bcb-test-deploy.bundle
DB=bersoncarebot_test
DBROLE=bersoncarebot_test
APP_OWNER_ROLE=app_owner
STRICT_CLOSURE=deploy/host/deploy-test-saas.sh
PORT_CONTEXT_ENV_BOOTSTRAP=deploy/host/bootstrap-c4-test-env.mjs
OWNER_MIGRATOR=deploy/postgres/privileges/migrate-local.mjs
INTEGRATOR_MIGRATOR=deploy/postgres/privileges/migrate-integrator-local.mjs
ACCESS_RECONCILER=deploy/postgres/privileges/reconcile-access.mjs
CANONICAL_SQL_READER=deploy/host/stream-canonical-sql.mjs
DRIZZLE_FOLDER=apps/webapp/db/drizzle-migrations
ZERO_STATE_CLUSTER=deploy/postgres/generated/zero-state.cluster.sql
D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX=deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql
LOCAL_MIGRATION_DATABASE_URL="postgresql://postgres@%2Fvar%2Frun%2Fpostgresql/$DB"
UNITS=(api worker scheduler webapp media-worker)
DBROLE_APP_OWNER_MEMBERSHIP_ADDED=0
DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0
APP_OWNER_BYPASS_ADDED=0
WRITERS_STOPPED=0
SERVICES_RELEASED=0
LEGACY_ELEVATION_CLEANUP_REQUIRED=1
CREDENTIAL_DIR=""

cleanup_elevation(){
  if [ "$LEGACY_ELEVATION_CLEANUP_REQUIRED" != "1" ]; then
    return 0
  fi
  local cleanup_status=0
  if [ "$DBROLE_APP_OWNER_MEMBERSHIP_ADDED" = "1" ]; then
    if sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "REVOKE \"$APP_OWNER_ROLE\" FROM \"$DBROLE\";" >/dev/null; then
      DBROLE_APP_OWNER_MEMBERSHIP_ADDED=0
    else
      cleanup_status=1
    fi
  fi
  if [ "$APP_OWNER_BYPASS_ADDED" = "1" ]; then
    if sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$APP_OWNER_ROLE\" NOBYPASSRLS;" >/dev/null; then
      APP_OWNER_BYPASS_ADDED=0
    else
      cleanup_status=1
    fi
  fi
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" NOBYPASSRLS;" >/dev/null || cleanup_status=1
  local bypass_state
  bypass_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$DBROLE';")" || cleanup_status=1
  [ "$bypass_state" = "false" ] || cleanup_status=1
  if [ "$DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN" = "1" ]; then
    local app_owner_membership_state
    app_owner_membership_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$DBROLE', '$APP_OWNER_ROLE', 'member');")" || cleanup_status=1
    [ "$app_owner_membership_state" = "f" ] || cleanup_status=1
  fi
  return "$cleanup_status"
}

cleanup_exit(){
  local original_status=$?
  set +e
  cleanup_elevation
  local cleanup_status=$?
  if [ -n "$CREDENTIAL_DIR" ]; then
    rm -rf -- "$CREDENTIAL_DIR" || cleanup_status=1
  fi
  if [ "$original_status" -ne 0 ] && [ "$WRITERS_STOPPED" = "1" ] && [ "$SERVICES_RELEASED" != "1" ]; then
    for unit_name in "${UNITS[@]}"; do
      sudo systemctl stop "bersoncarebot-$unit_name-test" >/dev/null 2>&1 || cleanup_status=1
    done
  fi
  if [ "$original_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then exit "$cleanup_status"; fi
  exit "$original_status"
}

resolve_test_runtime_mode(){
  local env_file mode resolved_mode=""
  for env_file in "$API_ENV" "$WEBAPP_ENV"; do
    mode="$(sudo -u deploy bash -lc "set -a && . '$env_file' && set +a && printf '%s' \"\${DB_PRINCIPAL_CONTEXT_MODE:-legacy-guc}\"")"
    case "$mode" in
      locked|port-context) ;;
      *)
        echo "FATAL: $env_file must use DB_PRINCIPAL_CONTEXT_MODE=locked or port-context, got $mode" >&2
        exit 1
        ;;
    esac
    if [ -z "$resolved_mode" ]; then
      resolved_mode="$mode"
    elif [ "$resolved_mode" != "$mode" ]; then
      echo "FATAL: TEST DB_PRINCIPAL_CONTEXT_MODE mismatch: $resolved_mode vs $mode in $env_file" >&2
      exit 1
    fi
  done
  printf '%s\n' "$resolved_mode"
}

echo "== deploy-test: ${BRANCH}  ->  ${DEPLOY_REPO} =="
TEST_DB_PRINCIPAL_CONTEXT_MODE="$(resolve_test_runtime_mode)"
[ -r "$SRC_REPO/$STRICT_CLOSURE" ] || { echo "FATAL: missing $SRC_REPO/$STRICT_CLOSURE" >&2; exit 1; }

# 1) Бандлим ветку из dev-репо (perm-safe перенос; deploy не читает /home/dev).
git -C "$SRC_REPO" bundle create "$BUNDLE" "$BRANCH"
chmod 644 "$BUNDLE"

# 2) Force-align тест-checkout на ветку (зеркало; рабочее дерево сбрасываем).
sudo -u deploy git -C "$DEPLOY_REPO" fetch "$BUNDLE" "$BRANCH"
sudo -u deploy git -C "$DEPLOY_REPO" checkout -f -B "$BRANCH" FETCH_HEAD
echo "   HEAD: $(sudo -u deploy git -C "$DEPLOY_REPO" rev-parse --short HEAD)"

[ -r "$DEPLOY_REPO/$PORT_CONTEXT_ENV_BOOTSTRAP" ] || {
  echo "FATAL: missing $PORT_CONTEXT_ENV_BOOTSTRAP" >&2
  exit 1
}
# A locked source does not have all four target mTLS client certificates yet; the single-target
# cutover provisions and verifies them before rendering the port-context env.  Requiring those
# future files here creates a circular preflight and blocks before build.  An already converted
# target must, conversely, prove its complete stationary projection before build.
if [ "$TEST_DB_PRINCIPAL_CONTEXT_MODE" = "locked" ]; then
  sudo node --experimental-strip-types "$DEPLOY_REPO/$PORT_CONTEXT_ENV_BOOTSTRAP" --check
else
  sudo node --experimental-strip-types "$DEPLOY_REPO/$PORT_CONTEXT_ENV_BOOTSTRAP" --port-context-check
fi

# 3) Сборка (тот же порядок, что в deploy-prod.sh) — от имени deploy.
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && export CI=true && \
  pnpm install --frozen-lockfile && \
  rm -rf dist && pnpm build && \
  rm -rf apps/webapp/.next && pnpm build:webapp && \
  pnpm --dir apps/media-worker build && \
  bash deploy/host/sync-webapp-standalone-assets.sh"

# Fail before stopping writers or changing the database when the locked mode, protected fixture
# packet or any shared closure artifact is unavailable. Legacy product-smoke fixtures are not deploy inputs.
if [ "$TEST_DB_PRINCIPAL_CONTEXT_MODE" = "locked" ]; then
  bash "$DEPLOY_REPO/$STRICT_CLOSURE" --strict-preflight
else
  for required_path in \
    "$OWNER_MIGRATOR" "$INTEGRATOR_MIGRATOR" "$ACCESS_RECONCILER" \
    "$CANONICAL_SQL_READER" "$DRIZZLE_FOLDER" "$ZERO_STATE_CLUSTER"; do
    sudo -u deploy test -r "$DEPLOY_REPO/$required_path" || {
      echo "FATAL: deploy cannot read port-context migration artifact: $DEPLOY_REPO/$required_path" >&2
      exit 1
    }
  done
fi

# 4) Stop all TEST writers. A legacy locked target uses the one-time audited elevation below and then
#    the single-target access cutover. An already port-context target uses only the stationary NOLOGIN
#    migrator and exact declared owners. Any failure leaves all TEST writers stopped.
#    This code-only path never restores or recreates TEST; it applies migrations to the named database.
for u in "${UNITS[@]}"; do sudo systemctl stop "bersoncarebot-$u-test"; done
WRITERS_STOPPED=1
trap cleanup_exit EXIT

if [ "$TEST_DB_PRINCIPAL_CONTEXT_MODE" = "port-context" ]; then
  LEGACY_ELEVATION_CLEANUP_REQUIRED=0
  MIGRATOR_ROLE=bcb_test_migrator
  OBJECT_OWNER_ROLE=app_object_owner
  migrator_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' || (rolpassword IS NULL)::text || '|' || (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=role.oid)::text FROM pg_catalog.pg_authid AS role WHERE rolname='$MIGRATOR_ROLE';")"
  [ "$migrator_state" = "false|false|false|false|false|false|true|0" ] || {
    echo "FATAL: $MIGRATOR_ROLE is not the stationary declaration migrator" >&2
    exit 1
  }
  target_sessions="$(sudo -u postgres psql -X -d postgres -tAc "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname='$DB' AND pid<>pg_backend_pid();")"
  [ "$target_sessions" = "0" ] || { echo "FATAL: TEST database is not quiescent: $target_sessions session(s)" >&2; exit 1; }

  node "$DEPLOY_REPO/$INTEGRATOR_MIGRATOR" \
    --db "$DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
    --root "$DEPLOY_REPO/apps/integrator" --before-date 20260708 --sudo-postgres
  node "$DEPLOY_REPO/$OWNER_MIGRATOR" \
    --db "$DB" --migrator "$MIGRATOR_ROLE" \
    --drizzle-folder "$DEPLOY_REPO/$DRIZZLE_FOLDER" --sudo-postgres
  node "$DEPLOY_REPO/$INTEGRATOR_MIGRATOR" \
    --db "$DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
    --root "$DEPLOY_REPO/apps/integrator" --sudo-postgres
  node "$DEPLOY_REPO/$CANONICAL_SQL_READER" \
    "$DEPLOY_REPO/$D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX" \
    "$DEPLOY_REPO/deploy/postgres" | \
    sudo -u postgres env PGOPTIONS="-c role=$OBJECT_OWNER_ROLE" \
      psql -X -d "$DB" -v ON_ERROR_STOP=1

  CREDENTIAL_DIR="$(mktemp -d /tmp/bcb-test-reconcile-credentials.XXXXXX)"
  chmod 700 "$CREDENTIAL_DIR"
  RECONCILE_ENV="$CREDENTIAL_DIR/reconcile.env"
  sudo node - "$API_ENV" "$WEBAPP_ENV" >"$RECONCILE_ENV" <<'NODE'
const { readFileSync } = require('node:fs');
function parse(path) {
  const values = new Map();
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match || values.has(match[1])) throw new Error(`invalid or duplicate env entry in ${path}`);
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
    values.set(match[1], value);
  }
  return values;
}
function password(values, key, expectedLogin) {
  const url = new URL(values.get(key));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      (url.port && url.port !== '5432') || url.pathname !== '/bersoncarebot_test' ||
      decodeURIComponent(url.username) !== expectedLogin || !url.password) throw new Error(`${key} identity mismatch`);
  const value = decodeURIComponent(url.password);
  if ([...value].some((character) => { const point = character.codePointAt(0); return point === undefined || point <= 0x1f || point === 0x7f; })) throw new Error(`${key} unsafe password`);
  return value;
}
const api = parse(process.argv[2]);
const webapp = parse(process.argv[3]);
const entries = [
  ['BCB_TEST_INTEGRATOR_PASSWORD', password(api, 'INTEGRATOR_DB_URL', 'bcb_test_integrator')],
  ['BCB_TEST_WEBAPP_STAFF_PASSWORD', password(webapp, 'DATABASE_URL_STAFF', 'bcb_test_webapp_staff')],
  ['BCB_TEST_WEBAPP_PATIENT_PASSWORD', password(webapp, 'DATABASE_URL_PATIENT', 'bcb_test_webapp_patient')],
  ['BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD', password(webapp, 'DATABASE_URL_GLOBAL_ADMIN', 'bcb_test_webapp_global_admin')],
];
process.stdout.write(`${entries.map(([key, value]) => `${key}='${value.replaceAll("'", `'"'"'`)}'`).join('\n')}\n`);
NODE
  chmod 600 "$RECONCILE_ENV"
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
  sudo env -i PATH="$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" HOME=/root \
    RECONCILE_ENV="$RECONCILE_ENV" DEPLOY_REPO="$DEPLOY_REPO" DB="$DB" bash -c '
      set -Eeuo pipefail
      set -a; . "$RECONCILE_ENV"; set +a
      exec node "$DEPLOY_REPO/deploy/postgres/privileges/reconcile-access.mjs" \
        --env test --db "$DB" --admin-socket /var/run/postgresql --admin-port 5432
    '
  sudo node --experimental-strip-types "$DEPLOY_REPO/$PORT_CONTEXT_ENV_BOOTSTRAP" --port-context-execute

  for unit_name in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$unit_name-test"; done
  sleep 4
  for unit_name in "${UNITS[@]}"; do sudo systemctl is-active --quiet "bersoncarebot-$unit_name-test"; done
  curl -fsS http://127.0.0.1:3300/health >/dev/null
  curl -fsS http://127.0.0.1:6300/api/health >/dev/null
  SERVICES_RELEASED=1
  echo "== deploy-test: port-context migration/reconcile готово =="
  exit 0
fi

database_name="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -tAc 'SELECT current_database();')"
[ "$database_name" = "$DB" ] || { echo "FATAL: local TEST migration channel reached $database_name, expected $DB" >&2; exit 1; }
app_owner_attributes="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text FROM pg_roles WHERE rolname = '$APP_OWNER_ROLE';")"
case "$app_owner_attributes" in
  false\|false\|false\|false\|true) ;;
  false\|false\|false\|false\|false)
    # A prior fail-closed/zero attempt may already have removed the legacy owner's stationary
    # BYPASSRLS.  Re-enable it only inside this tracked migration window; cleanup_elevation restores
    # NOBYPASSRLS before initial cutover and on every failing exit.
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$APP_OWNER_ROLE\" BYPASSRLS;" >/dev/null
    APP_OWNER_BYPASS_ADDED=1
    ;;
  *)
    echo "FATAL: $APP_OWNER_ROLE must be a privilege-free NOLOGIN role with only optional legacy BYPASSRLS" >&2
    exit 1
    ;;
esac
app_owner_membership="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$DBROLE', '$APP_OWNER_ROLE', 'member');")"
[ "$app_owner_membership" = "f" ] || { echo "FATAL: pre-existing $DBROLE membership in $APP_OWNER_ROLE" >&2; exit 1; }
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "GRANT \"$APP_OWNER_ROLE\" TO \"$DBROLE\";" >/dev/null
DBROLE_APP_OWNER_MEMBERSHIP_ADDED=1
DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=1
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" BYPASSRLS;" >/dev/null
# Legacy application logins already have no CONNECT at this point and must not regain it merely
# to run DDL. Authenticate locally as the PostgreSQL OS administrator, then SET ROLE through
# PGOPTIONS so every migration executes with the exact historical database-owner privileges.
(
  cd "$DEPLOY_REPO"
  sudo -u postgres env \
    NODE_ENV=production \
    DATABASE_URL="$LOCAL_MIGRATION_DATABASE_URL" \
    DB_PRINCIPAL_CONTEXT_MODE=legacy-guc \
    APP_BASE_URL=http://127.0.0.1 \
    BOOKING_URL=http://127.0.0.1 \
    PGOPTIONS="-c role=$DBROLE -c search_path=integrator,public" \
    INTEGRATOR_MIGRATIONS_BEFORE_DATE=20260708 \
    pnpm --dir apps/integrator run migrate
  sudo -u postgres env \
    DATABASE_URL="$LOCAL_MIGRATION_DATABASE_URL" \
    PGOPTIONS="-c role=$DBROLE" \
    pnpm --dir apps/webapp run migrate
  sudo -u postgres env \
    NODE_ENV=production \
    DATABASE_URL="$LOCAL_MIGRATION_DATABASE_URL" \
    DB_PRINCIPAL_CONTEXT_MODE=legacy-guc \
    APP_BASE_URL=http://127.0.0.1 \
    BOOKING_URL=http://127.0.0.1 \
    PGOPTIONS="-c role=$DBROLE -c search_path=integrator,public" \
    pnpm --dir apps/integrator run migrate
  sudo -u postgres env PGOPTIONS="-c role=$DBROLE" \
    psql -X -v ON_ERROR_STOP=1 -d "$DB" \
      -f "$DEPLOY_REPO/$D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX"
)
cleanup_elevation
# The legacy role still exists here and its temporary powers were just verified absent. The shared
# cluster cutover deliberately drops it, so the EXIT trap must keep only its writer-stop duty from
# this point onward and must not try to ALTER the intentionally removed role after a successful zero.
LEGACY_ELEVATION_CLEANUP_REQUIRED=0

# 5) One-time locked→port-context transition on the current TEST data. The retired strict closure
#    is forbidden here: it recreates diagnostic/delivery/scheduler/operator logins immediately before
#    the owner-ordered zero. The shared cutover first installs the exact HBA, then performs bilateral
#    DEV+TEST zero, installs only the six declared logins and minimal roles/grants, proves live auth,
#    restarts TEST and checks its health. Any failure leaves every TEST writer stopped.
bash "$DEPLOY_REPO/$STRICT_CLOSURE" --port-context-post-migration-cutover
sudo -u postgres psql -X -d postgres -1 -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$ZERO_STATE_CLUSTER"
SERVICES_RELEASED=1
echo "== deploy-test: готово =="
