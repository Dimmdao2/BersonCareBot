#!/usr/bin/env bash
# Деплой на новый прод прямо с dev-бокса, без GitHub.
#
# Почему так: прод забирает код из СВОЕГО bare-репозитория (/opt/therapysto/git/therapysto.git), а не из
# GitHub. Этот скрипт делает ровно два шага — доставляет коммит в тот репозиторий и запускает штатный
# blue/green-деплой на хосте. Никакой своей логики выкладки здесь нет и быть не должно: собирает,
# проверяет здоровьем и переключает nginx сам конвейер на проде.
#
#   bash tools/deploy-prod-from-dev.sh            # выложить текущую ветку
#   bash tools/deploy-prod-from-dev.sh <ref>      # выложить конкретную ветку/коммит/тег
#
# ДВА ПУТИ ДОСТУПА, и скрипт выбирает сам. Целевой — учётка `deploy` с правом sudo ровно на четыре
# команды конвейера; вход root по SSH при этом закрыт (deploy/host/prod/harden-ssh-close-root.sh).
# Переходный — прежний вход root, пока эта учётка не заведена. Автовыбор существует, чтобы переход не
# требовал согласованного «дня X»: сначала работает деплой, потом закрывается root, и ни один шаг не
# ломает другой. Когда root закроют насовсем, ветка с root просто перестанет срабатывать.
set -euo pipefail

PROD_HOST=135.106.187.95
PROD_KEY="${THERAPYSTO_PROD_KEY:-$HOME/.ssh/therapysto_prod_build_20260817}"
PROD_BRANCH=prod-probe
PIPELINE=/opt/therapysto/pipeline
SRC=/opt/therapysto/src
REF="${1:-HEAD}"

[ -f "$PROD_KEY" ] || { echo "FATAL: нет ключа $PROD_KEY" >&2; exit 1; }
COMMIT=$(git rev-parse --verify "$REF") || { echo "FATAL: не разрешается ref '$REF'" >&2; exit 1; }

SSH_OPTS=(-i "$PROD_KEY" -o IdentitiesOnly=yes -o BatchMode=yes)

# Учётка выбирается проверкой, а не догадкой: пробуем непривилегированный путь и берём его, если он жив.
if ssh "${SSH_OPTS[@]}" -o ConnectTimeout=10 "deploy@$PROD_HOST" true 2>/dev/null; then
  ACCOUNT=deploy
  echo "==> доступ: учётка deploy, привилегии через sudo на команды конвейера"
elif ssh "${SSH_OPTS[@]}" -o ConnectTimeout=10 "root@$PROD_HOST" true 2>/dev/null; then
  ACCOUNT=root
  echo "==> доступ: root (переходный режим — выполните deploy/host/prod/harden-ssh-close-root.sh --setup)"
else
  echo "FATAL: ни deploy@, ни root@ не пускают по ключу $PROD_KEY" >&2
  exit 1
fi

echo "==> доставляю $(git log --oneline -1 "$COMMIT") на прод"
GIT_SSH_COMMAND="ssh ${SSH_OPTS[*]}" \
  git push --force "ssh://$ACCOUNT@$PROD_HOST/opt/therapysto/git/therapysto.git" "$COMMIT:refs/heads/$PROD_BRANCH"

# Раскладка конвейера живёт на хосте отдельным root-owned скриптом, а не строкой команд здесь: строку
# нельзя разрешить в sudoers, а файл — можно. Это и есть то, что позволило убрать вход root.
echo "==> обновляю конвейер на проде из этого же коммита"
if [ "$ACCOUNT" = deploy ]; then
  ssh "${SSH_OPTS[@]}" "deploy@$PROD_HOST" "sudo -n $PIPELINE/install-pipeline.sh $COMMIT"
else
  # Переходный путь: установленной копии скрипта может ещё не быть, поэтому дерево подтягивается здесь,
  # а раскладку выполняет тот же скрипт прямо из дерева — включая установку самого себя в конвейер.
  ssh "${SSH_OPTS[@]}" "root@$PROD_HOST" \
    "set -e; git -C $SRC fetch --prune origin; git -C $SRC reset --hard $COMMIT; bash $SRC/deploy/host/prod/install-pipeline.sh $COMMIT"
fi

echo "==> запускаю blue/green-деплой на проде"
if [ "$ACCOUNT" = deploy ]; then
  exec ssh "${SSH_OPTS[@]}" "deploy@$PROD_HOST" "sudo -n $PIPELINE/therapysto-deploy $PROD_BRANCH"
else
  exec ssh "${SSH_OPTS[@]}" "root@$PROD_HOST" "$PIPELINE/therapysto-deploy $PROD_BRANCH"
fi
