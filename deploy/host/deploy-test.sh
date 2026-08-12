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
SAAS_C2_SECRET_PREFLIGHT=deploy/host/saas-c2-secret-preflight.mjs
D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX=deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql
UNITS=(api worker scheduler webapp media-worker)
MIGRATOR_ROLE=""
MIGRATOR_MEMBERSHIP_ADDED=0
MIGRATOR_MEMBERSHIP_GRANTED_THIS_RUN=0
DBROLE_APP_OWNER_MEMBERSHIP_ADDED=0
DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0
WRITERS_STOPPED=0
SERVICES_RELEASED=0
LEGACY_ELEVATION_CLEANUP_REQUIRED=1

cleanup_elevation(){
  if [ "$LEGACY_ELEVATION_CLEANUP_REQUIRED" != "1" ]; then
    return 0
  fi
  local cleanup_status=0
  if [ "$DBROLE_APP_OWNER_MEMBERSHIP_ADDED" = "1" ]; then
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "REVOKE \"$APP_OWNER_ROLE\" FROM \"$DBROLE\";" >/dev/null || cleanup_status=1
    DBROLE_APP_OWNER_MEMBERSHIP_ADDED=0
  fi
  if [ "$MIGRATOR_MEMBERSHIP_ADDED" = "1" ] && [ -n "$MIGRATOR_ROLE" ] && [ "$MIGRATOR_ROLE" != "$DBROLE" ]; then
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "REVOKE \"$DBROLE\" FROM \"$MIGRATOR_ROLE\";" >/dev/null || cleanup_status=1
    MIGRATOR_MEMBERSHIP_ADDED=0
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
  if [ "$MIGRATOR_MEMBERSHIP_GRANTED_THIS_RUN" = "1" ] && [ -n "$MIGRATOR_ROLE" ] && [ "$MIGRATOR_ROLE" != "$DBROLE" ]; then
    local membership_state
    membership_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$MIGRATOR_ROLE', '$DBROLE', 'member');")" || cleanup_status=1
    [ "$membership_state" = "f" ] || cleanup_status=1
  fi
  return "$cleanup_status"
}

cleanup_exit(){
  local original_status=$?
  set +e
  cleanup_elevation
  local cleanup_status=$?
  if [ "$original_status" -ne 0 ] && [ "$WRITERS_STOPPED" = "1" ] && [ "$SERVICES_RELEASED" != "1" ]; then
    for unit_name in "${UNITS[@]}"; do
      sudo systemctl stop "bersoncarebot-$unit_name-test" >/dev/null 2>&1 || cleanup_status=1
    done
  fi
  if [ "$original_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then exit "$cleanup_status"; fi
  exit "$original_status"
}

read_test_identity(){
  local url_expression="$1"
  sudo -u deploy bash -lc "set -a && . '$WEBAPP_ENV' && set +a && db_url=$url_expression && psql \"\$db_url\" -X -v ON_ERROR_STOP=1 -tAc \"SELECT current_user || '|' || current_database();\""
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
if [ "$TEST_DB_PRINCIPAL_CONTEXT_MODE" = "port-context" ]; then
  echo "FATAL: ordinary deploy-test.sh cannot migrate port-context TEST yet: refusing the legacy application DATABASE_URL/app_owner/BYPASSRLS migration path. Wire deploy-test.sh to deploy/postgres/privileges/migrate-local.mjs with exact declared owners before rerunning." >&2
  exit 1
fi
[ -r "$SRC_REPO/$STRICT_CLOSURE" ] || { echo "FATAL: missing $SRC_REPO/$STRICT_CLOSURE" >&2; exit 1; }

# 1) Бандлим ветку из dev-репо (perm-safe перенос; deploy не читает /home/dev).
git -C "$SRC_REPO" bundle create "$BUNDLE" "$BRANCH"
chmod 644 "$BUNDLE"

# 2) Force-align тест-checkout на ветку (зеркало; рабочее дерево сбрасываем).
sudo -u deploy git -C "$DEPLOY_REPO" fetch "$BUNDLE" "$BRANCH"
sudo -u deploy git -C "$DEPLOY_REPO" checkout -f -B "$BRANCH" FETCH_HEAD
echo "   HEAD: $(sudo -u deploy git -C "$DEPLOY_REPO" rev-parse --short HEAD)"

[ -r "$DEPLOY_REPO/$SAAS_C2_SECRET_PREFLIGHT" ] || {
  echo "FATAL: missing $SAAS_C2_SECRET_PREFLIGHT" >&2
  exit 1
}
node "$DEPLOY_REPO/$SAAS_C2_SECRET_PREFLIGHT" \
  --process-env-file="webapp:$WEBAPP_ENV" \
  --process-env-file="integrator:$API_ENV" \
  --process-env-file="media-worker:$MEDIA_WORKER_ENV"

# 3) Сборка (тот же порядок, что в deploy-prod.sh) — от имени deploy.
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && export CI=true && \
  pnpm install --frozen-lockfile && \
  rm -rf dist && pnpm build && \
  rm -rf apps/webapp/.next && pnpm build:webapp && \
  pnpm --dir apps/media-worker build && \
  bash deploy/host/sync-webapp-standalone-assets.sh"

# Fail before stopping writers or changing the database when the locked mode, protected fixture
# packet or any shared closure artifact is unavailable. Legacy product-smoke fixtures are not deploy inputs.
bash "$DEPLOY_REPO/$STRICT_CLOSURE" --strict-preflight

# 4) Stop all TEST writers, migrate in a short audited owner+BYPASS window, clean it up, then
#    unconditionally restore strict helper policies + FORCE. Migration failure leaves units stopped.
#    Корневой `pnpm migrate` гоняет integrator + webapp-drizzle (проверено).
#    Этот code-only путь НИКОГДА не восстанавливает и не пересоздаёт TEST-БД. Отдельный fresh-reset wrapper
#    используется только по явной команде владельца; здесь применяются лишь новые миграции к текущей TEST-БД.
for u in "${UNITS[@]}"; do sudo systemctl stop "bersoncarebot-$u-test"; done
WRITERS_STOPPED=1
trap cleanup_exit EXIT

identity="$(read_test_identity '"$DATABASE_URL"')"
MIGRATOR_ROLE="${identity%%|*}"
database_name="${identity#*|}"
[[ "$MIGRATOR_ROLE" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "FATAL: invalid webapp TEST role" >&2; exit 1; }
[ "$database_name" = "$DB" ] || { echo "FATAL: webapp.test points to $database_name, expected $DB" >&2; exit 1; }
if [ "$MIGRATOR_ROLE" != "$DBROLE" ]; then
  membership="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$MIGRATOR_ROLE', '$DBROLE', 'member');")"
  [ "$membership" = "f" ] || { echo "FATAL: pre-existing $MIGRATOR_ROLE membership in $DBROLE" >&2; exit 1; }
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "GRANT \"$DBROLE\" TO \"$MIGRATOR_ROLE\";" >/dev/null
  MIGRATOR_MEMBERSHIP_ADDED=1
  MIGRATOR_MEMBERSHIP_GRANTED_THIS_RUN=1
fi
app_owner_attributes="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text FROM pg_roles WHERE rolname = '$APP_OWNER_ROLE';")"
[ "$app_owner_attributes" = "false|false|false|false|true" ] || { echo "FATAL: $APP_OWNER_ROLE must be NOSUPERUSER NOCREATEROLE NOCREATEDB NOLOGIN BYPASSRLS" >&2; exit 1; }
app_owner_membership="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_has_role('$DBROLE', '$APP_OWNER_ROLE', 'member');")"
[ "$app_owner_membership" = "f" ] || { echo "FATAL: pre-existing $DBROLE membership in $APP_OWNER_ROLE" >&2; exit 1; }
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "GRANT \"$APP_OWNER_ROLE\" TO \"$DBROLE\";" >/dev/null
DBROLE_APP_OWNER_MEMBERSHIP_ADDED=1
DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=1
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" BYPASSRLS;" >/dev/null
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && \
  export PGOPTIONS='-c role=$DBROLE' && \
  API_ENV_FILE='$API_ENV' WEBAPP_ENV_FILE='$WEBAPP_ENV' pnpm migrate && \
  set -a && source '$WEBAPP_ENV' && set +a && \
  psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 \
    -f \"$DEPLOY_REPO/$D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX\""
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
SERVICES_RELEASED=1
echo "== deploy-test: готово =="
