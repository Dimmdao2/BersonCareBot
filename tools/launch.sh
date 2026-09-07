#!/usr/bin/env bash
# Обёртка над портом: синхронизирует worker-клон с головой feat ПЕРЕД запуском.
#
# Auditor-live не синхронизируется: его задача — проверить exact candidate, а не втянуть в него чужие
# коммиты. Отказ при грязном дереве сохраняется для обеих ролей.
set -euo pipefail
MAIN=/home/dev/dev-projects/BersonCareBot
ROLE=${1:?"нужна роль первым аргументом"}
CLONE="/home/dev/dev-projects/bcb-wt-${2:?нужен клон вторым аргументом}"
[ -z "$(git -C "$CLONE" status --porcelain)" ] || { echo "ОТКАЗ: дерево $CLONE грязное — салважни сам" >&2; exit 1; }
if [ "$ROLE" = worker ]; then
  git -C "$CLONE" fetch -q "$MAIN" feat/doctor-ui-rebuild
  git -C "$CLONE" merge --no-edit -q FETCH_HEAD
fi
exec "$MAIN/tools/orch-launch.sh" "$@"
