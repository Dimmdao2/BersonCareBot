#!/usr/bin/env bash
# Деплой на новый прод прямо с dev-бокса, без GitHub.
#
# Почему так: прод забирает код из СВОЕГО bare-репозитория (/opt/bersoncarebot/git/bcb.git), а не из
# GitHub. Этот скрипт делает ровно два шага — доставляет коммит в тот репозиторий и запускает штатный
# blue/green-деплой на хосте. Никакой своей логики выкладки здесь нет и быть не должно: собирает,
# проверяет здоровьем и переключает nginx сам конвейер на проде.
#
#   bash tools/deploy-prod-from-dev.sh            # выложить текущую ветку
#   bash tools/deploy-prod-from-dev.sh <ref>      # выложить конкретную ветку/коммит/тег
set -euo pipefail

PROD_HOST=135.106.187.95
PROD_KEY="${BCB_PROD_KEY:-$HOME/.ssh/bcb_prod_build_20260817}"
PROD_BRANCH=prod-probe
REF="${1:-HEAD}"

[ -f "$PROD_KEY" ] || { echo "FATAL: нет ключа $PROD_KEY" >&2; exit 1; }
COMMIT=$(git rev-parse --verify "$REF") || { echo "FATAL: не разрешается ref '$REF'" >&2; exit 1; }

echo "==> доставляю $(git log --oneline -1 "$COMMIT") на прод"
GIT_SSH_COMMAND="ssh -i $PROD_KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  git push --force "ssh://root@$PROD_HOST/opt/bersoncarebot/git/bcb.git" "$COMMIT:refs/heads/$PROD_BRANCH"

# Сам конвейер (compose, Dockerfile, blue/green-скрипты) живёт на хосте отдельной копией в
# /opt/bersoncarebot/pipeline и читается оттуда, а не из выложенного дерева. Копию надо обновлять
# из того же коммита, иначе прод собирает новый код старой машинерией: правка compose уезжает в git,
# на хосте её нет, и деплой падает по причине, которую в репозитории уже починили. Раскладка та же,
# что делает deploy/host/prod/setup-docker-bluegreen.sh — здесь повторяется только она.
echo "==> обновляю конвейер на проде из этого же коммита"
ssh -i "$PROD_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$PROD_HOST" "
  set -e
  git -C /opt/bersoncarebot/src fetch --prune origin
  git -C /opt/bersoncarebot/src reset --hard $COMMIT
  S=/opt/bersoncarebot/src/deploy/host/prod
  D=/opt/bersoncarebot/src/deploy/docker
  P=/opt/bersoncarebot/pipeline
  for f in bcb-bluegreen-lib.sh bcb-deploy bcb-rollback bcb-status; do
    install -m 0755 -o root -g root \"\$S/\$f\" \"\$P/\$f\"
  done
  install -m 0644 -o root -g root \"\$D/Dockerfile\" \"\$P/Dockerfile\"
  install -m 0644 -o root -g root \"\$D/docker-compose.yml\" \"\$P/docker-compose.yml\"
"

echo "==> запускаю blue/green-деплой на проде"
exec ssh -i "$PROD_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$PROD_HOST" \
  "/opt/bersoncarebot/pipeline/bcb-deploy $PROD_BRANCH"
