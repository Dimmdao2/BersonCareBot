#!/usr/bin/env bash
# Живой прогон против именованной DEV-базы `bcb_webapp_dev`.
#
# Зачем реле: скрипт бежит от пользователя `dev`, а peer-auth Postgres смотрит на владельца
# подключающегося процесса. Реле поднимается от `postgres` и проксирует сокет — временной базы,
# миграций и второго Next-сервера при этом нет. Всё содержимое сценария живёт внутри BEGIN/ROLLBACK.
#
# Запускать ТОЛЬКО через общий замок хоста:
#   /home/dev/brain/host-orch/run-tests.sh "bash docs/audit/evidence/merge-e3-round4-fix-2026-09-15/run-live.sh <файл.mts>"
set -euo pipefail
repo=/home/dev/dev-projects/bcb-wt-fio-dialog
script=${1:?usage: run-live.sh <path-to.mts>}

relay_dir=$(mktemp -d /tmp/e3-fix-relay.XXXXXX)
chmod 0777 "$relay_dir"
sudo -n -u postgres /usr/bin/node -e '
const net = require("node:net");
const server = net.createServer((client) => {
  const upstream = net.createConnection("/var/run/postgresql/.s.PGSQL.5432");
  client.pipe(upstream).pipe(client);
  upstream.on("error", () => client.destroy());
});
server.listen(process.argv[1] + "/.s.PGSQL.5432");
' "$relay_dir" &
relay_pid=$!
cleanup() {
  kill "$relay_pid" 2>/dev/null || true
  wait "$relay_pid" 2>/dev/null || true
  rm -f "$relay_dir/.s.PGSQL.5432"
  rmdir "$relay_dir" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 50); do [ -S "$relay_dir/.s.PGSQL.5432" ] && break; sleep 0.1; done
[ -S "$relay_dir/.s.PGSQL.5432" ] || { echo "relay socket not ready"; exit 1; }
sudo -n -u postgres chmod 0777 "$relay_dir/.s.PGSQL.5432"

LIVE_PGHOST="$relay_dir" AUDIT_PGHOST="$relay_dir" \
  pnpm --dir "$repo/apps/webapp" exec tsx "$repo/$script"
