#!/usr/bin/env bash
# Stop local *dev* listeners only (never production 3200 / 6200).
# Ports: docs/ARCHITECTURE/SERVER CONVENTIONS.md — webapp dev 5200, integrator dev 4200.
set -euo pipefail

readonly PROD_PORTS=(3200 6200)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

read_port_from_env_file() {
  local file="$1" key="$2" default="$3"
  if [[ -f "$file" ]]; then
    local line
    line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
    if [[ -n "$line" ]]; then
      echo "${line#*=}" | tr -d ' "'\'''
      return
    fi
  fi
  echo "$default"
}

WEBAPP_PORT="$(read_port_from_env_file "$ROOT/apps/webapp/.env.dev" PORT 5200)"
INTEGRATOR_PORT="$(read_port_from_env_file "$ROOT/.env" PORT 4200)"

assert_not_prod_port() {
  local port="$1"
  for prod in "${PROD_PORTS[@]}"; do
    if [[ "$port" == "$prod" ]]; then
      echo "kill-local-dev-ports: refuse port $port (production per SERVER CONVENTIONS)" >&2
      exit 1
    fi
  done
}

kill_listeners_on_port() {
  local port="$1"
  assert_not_prod_port "$port"

  local pids
  pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    echo "port $port: nothing listening"
    return 0
  fi

  echo "port $port: stopping PID(s): $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.4
  pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "port $port: SIGKILL PID(s): $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

echo "kill-local-dev-ports: webapp dev :$WEBAPP_PORT, integrator dev :$INTEGRATOR_PORT (prod :3200/:6200 untouched)"
kill_listeners_on_port "$WEBAPP_PORT"
kill_listeners_on_port "$INTEGRATOR_PORT"
