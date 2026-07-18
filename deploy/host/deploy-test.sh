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

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
BRANCH="${1:-feat/doctor-ui-rebuild}"
API_ENV=/opt/env/bersoncarebot/api.test
WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
BUNDLE=/tmp/bcb-test-deploy.bundle
DB=bersoncarebot_test
DBROLE=bersoncarebot_test
STRICT_CLOSURE=deploy/host/deploy-test-saas.sh
UNITS=(api worker scheduler webapp media-worker)
MIGRATOR_ROLE=""
MIGRATOR_MEMBERSHIP_ADDED=0
MIGRATOR_MEMBERSHIP_GRANTED_THIS_RUN=0
WRITERS_STOPPED=0
SERVICES_RELEASED=0

cleanup_elevation(){
  local cleanup_status=0
  if [ "$MIGRATOR_MEMBERSHIP_ADDED" = "1" ] && [ -n "$MIGRATOR_ROLE" ] && [ "$MIGRATOR_ROLE" != "$DBROLE" ]; then
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "REVOKE \"$DBROLE\" FROM \"$MIGRATOR_ROLE\";" >/dev/null || cleanup_status=1
    MIGRATOR_MEMBERSHIP_ADDED=0
  fi
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" NOBYPASSRLS;" >/dev/null || cleanup_status=1
  local bypass_state
  bypass_state="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$DBROLE';")" || cleanup_status=1
  [ "$bypass_state" = "false" ] || cleanup_status=1
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

assert_locked_test_mode(){
  local env_file mode
  for env_file in "$API_ENV" "$WEBAPP_ENV"; do
    mode="$(sudo -u deploy bash -lc "set -a && . '$env_file' && set +a && printf '%s' \"\${DB_PRINCIPAL_CONTEXT_MODE:-legacy-guc}\"")"
    [ "$mode" = "locked" ] || { echo "FATAL: $env_file must use DB_PRINCIPAL_CONTEXT_MODE=locked, got $mode" >&2; exit 1; }
  done
}

echo "== deploy-test: ${BRANCH}  ->  ${DEPLOY_REPO} =="
assert_locked_test_mode
[ -r "$SRC_REPO/$STRICT_CLOSURE" ] || { echo "FATAL: missing $SRC_REPO/$STRICT_CLOSURE" >&2; exit 1; }

# 1) Бандлим ветку из dev-репо (perm-safe перенос; deploy не читает /home/dev).
git -C "$SRC_REPO" bundle create "$BUNDLE" "$BRANCH"
chmod 644 "$BUNDLE"

# 2) Force-align тест-checkout на ветку (зеркало; рабочее дерево сбрасываем).
sudo -u deploy git -C "$DEPLOY_REPO" fetch "$BUNDLE" "$BRANCH"
sudo -u deploy git -C "$DEPLOY_REPO" checkout -f -B "$BRANCH" FETCH_HEAD
echo "   HEAD: $(sudo -u deploy git -C "$DEPLOY_REPO" rev-parse --short HEAD)"

# 3) Сборка (тот же порядок, что в deploy-prod.sh) — от имени deploy.
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && export CI=true && \
  pnpm install --frozen-lockfile && \
  rm -rf dist && pnpm build && \
  rm -rf apps/webapp/.next && pnpm build:webapp && \
  pnpm --dir apps/media-worker build && \
  bash deploy/host/sync-webapp-standalone-assets.sh"

# Fail before stopping writers or changing the database when the locked mode, protected fixture
# packet, mandatory smoke fixture, or any shared closure artifact is unavailable.
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
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DBROLE\" BYPASSRLS;" >/dev/null
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && \
  export PGOPTIONS='-c role=$DBROLE' && \
  API_ENV_FILE='$API_ENV' WEBAPP_ENV_FILE='$WEBAPP_ENV' pnpm migrate"
cleanup_elevation

# 5) The same fail-closed closure as the fresh-restore wrapper: roles/helpers/grants, base+safe
#    overlays, exact FORCE assertions, separate seed cleanup, locked restart, health and product smoke.
bash "$DEPLOY_REPO/$STRICT_CLOSURE" --post-migration-closure
SERVICES_RELEASED=1
echo "== deploy-test: готово =="
