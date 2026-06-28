#!/bin/bash
# =============================================================================
# deploy-test.sh — доставить ТЕКУЩУЮ ветку dev-репо в ТЕСТ-окружение (151.x).
#
# КОНТЕКСТ (почему так, а не `git pull` как на проде):
#   • Ветки `test` и авто-деплоя НЕТ. CI (`ci.yml`) деплоит только `main`→прод.
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
UNITS=(api worker scheduler webapp media-worker)

echo "== deploy-test: ${BRANCH}  ->  ${DEPLOY_REPO} =="

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

# 4) Миграции против ТЕСТ-БД (env-файлы выбирают bersoncarebot_test).
#    Корневой `pnpm migrate` гоняет integrator + webapp-drizzle (проверено).
#    Бэкап не делаем: тест-БД всегда восстанавливается restore-test-db.sh из прод-дампа.
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && \
  API_ENV_FILE='$API_ENV' WEBAPP_ENV_FILE='$WEBAPP_ENV' pnpm migrate"

# 5) Рестарт тест-юнитов + проверка (и что awg-релей не задет).
for u in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$u-test"; done
sleep 2
for u in "${UNITS[@]}"; do printf "   %-13s %s\n" "$u:" "$(systemctl is-active "bersoncarebot-$u-test")"; done
echo -n "   health: "; curl -sk --max-time 10 https://test.bersoncare.ru/api/health || true; echo
echo "   awg-quick@awg0 (НЕ должен быть тронут): $(systemctl is-active awg-quick@awg0)"
echo "== deploy-test: готово =="
