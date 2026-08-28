#!/usr/bin/env bash
# Keep Next's stdout attached to a regular file. Next 16 can stay alive and spin on EPIPE when the
# reader of a terminal/pipe disappears (for example after an SSH or remote-editor disconnect).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEBAPP="$ROOT/apps/webapp"
MODE="${1:-turbo}"
PORT="${DEV_WEBAPP_PORT:-5200}"
MAX_RSS_KIB="${DEV_NEXT_MAX_RSS_KIB:-12582912}" # 12 GiB safety ceiling, not a reservation.
MAX_OLD_SPACE_MB="${DEV_NEXT_MAX_OLD_SPACE_MB:-6144}"
LOG_DIR="$WEBAPP/.next"
LOG="$LOG_DIR/dev-server-$MODE.log"

SOURCE_MAP_ARGS=(--disable-source-maps)
if [[ "${DEV_NEXT_SOURCE_MAPS:-0}" == "1" ]]; then
  SOURCE_MAP_ARGS=()
fi

case "$MODE" in
  turbo)
    NEXT_ARGS=(dev "${SOURCE_MAP_ARGS[@]}" -H 127.0.0.1 -p "$PORT")
    ;;
  webpack)
    NEXT_ARGS=(dev --webpack "${SOURCE_MAP_ARGS[@]}" -H 127.0.0.1 -p "$PORT")
    ;;
  *)
    echo "usage: $0 [turbo|webpack]" >&2
    exit 2
    ;;
esac

bash "$ROOT/scripts/kill-local-dev-ports.sh" webapp
mkdir -p "$LOG_DIR"
: >"$LOG"

# The server is detached from the terminal, but its stdout/stderr are not discarded: they always go
# to a regular project-local file. The foreground tail is only a viewer and may disappear safely.
(
  cd "$WEBAPP"
  export NODE_OPTIONS="--max-old-space-size=$MAX_OLD_SPACE_MB"
  nohup setsid pnpm exec next "${NEXT_ARGS[@]}" >>"$LOG" 2>&1 </dev/null &
  echo "$!"
) >"$LOG_DIR/dev-server-$MODE.launcher"
launcher_pid="$(tr -d '[:space:]' <"$LOG_DIR/dev-server-$MODE.launcher")"

server_pid=""
for ((attempt = 1; attempt <= 150; attempt += 1)); do
  server_pid="$(
    ss -H -ltnp "sport = :$PORT" 2>/dev/null \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
      | head -n 1
  )"
  if [[ -n "$server_pid" ]]; then
    break
  fi
  if ! kill -0 "$launcher_pid" 2>/dev/null; then
    echo "dev:$MODE failed before opening port $PORT; log: $LOG" >&2
    tail -n 40 "$LOG" >&2
    exit 1
  fi
  sleep 0.1
done

if [[ -z "$server_pid" ]]; then
  echo "dev:$MODE did not open port $PORT within 15 seconds; log: $LOG" >&2
  tail -n 40 "$LOG" >&2
  exit 1
fi

server_pgid="$(ps -o pgid= -p "$launcher_pid" | tr -d '[:space:]')"
if [[ ! "$server_pgid" =~ ^[0-9]+$ ]]; then
  echo "dev:$MODE could not determine process group for PID $launcher_pid" >&2
  kill "$server_pid" 2>/dev/null || true
  exit 1
fi

echo "$server_pid" >"$LOG_DIR/dev-server-$MODE.pid"
echo "dev:$MODE ready on 127.0.0.1:$PORT (PID $server_pid, log $LOG)"

# Independent safety net for native/Rust allocations that NODE_OPTIONS cannot bound. Three
# consecutive samples above 12 GiB stop the whole Next process group before it pushes the shared
# host to swap.
nohup setsid bash -c '
  server_pid="$1"
  server_pgid="$2"
  max_rss_kib="$3"
  log="$4"
  breaches=0
  while kill -0 "$server_pid" 2>/dev/null; do
    rss_kib="$(
      ps -eo pgid=,rss= \
        | awk -v wanted="$server_pgid" "\$1 == wanted { total += \$2 } END { print total + 0 }"
    )"
    if [[ -n "$rss_kib" && "$rss_kib" -gt "$max_rss_kib" ]]; then
      breaches=$((breaches + 1))
      if [[ "$breaches" -ge 3 ]]; then
        printf "[%s] dev memory guard: process group %s stayed above %s KiB; stopping it\n" \
          "$(date -Is)" "$server_pgid" "$max_rss_kib" >>"$log"
        kill -TERM -- "-$server_pgid" 2>/dev/null || true
        sleep 2
        kill -KILL -- "-$server_pgid" 2>/dev/null || true
        exit 0
      fi
    else
      breaches=0
    fi
    sleep 5
  done
' _ "$server_pid" "$server_pgid" "$MAX_RSS_KIB" "$LOG" >>"$LOG" 2>&1 </dev/null &

stop_server() {
  kill -TERM -- "-$server_pgid" 2>/dev/null || true
}
trap stop_server INT TERM

# `tail` is deliberately downstream of the regular file, never downstream of Next itself.
tail -n +1 --pid="$server_pid" -F "$LOG" &
tail_pid=$!
wait "$tail_pid"
