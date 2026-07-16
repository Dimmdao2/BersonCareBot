#!/usr/bin/env bash
set -euo pipefail

[ "${EUID}" -eq 0 ] || { echo "FATAL: run as root/DB administrator" >&2; exit 1; }

PROJECT_ROOT="${PROJECT_ROOT:-/opt/projects/bersoncarebot}"
API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"
MEDIA_WORKER_ENV_FILE="${MEDIA_WORKER_ENV_FILE:-/opt/env/bersoncarebot/media-worker.prod}"
OVERLAY="$PROJECT_ROOT/deploy/postgres/c4-operational-runtime.sql"

if [ "${1:-}" = "--bootstrap-test-env" ]; then
  [ "$#" -eq 1 ] || { echo "FATAL: usage: $0 [--bootstrap-test-env]" >&2; exit 2; }
  [ "$API_ENV_FILE" = "/opt/env/bersoncarebot/api.test" ] || { echo "FATAL: TEST bootstrap requires canonical api.test path" >&2; exit 1; }
  [ "$WEBAPP_ENV_FILE" = "/opt/env/bersoncarebot/webapp.test" ] || { echo "FATAL: TEST bootstrap requires canonical webapp.test path" >&2; exit 1; }
  [ "$MEDIA_WORKER_ENV_FILE" = "/opt/env/bersoncarebot/media-worker.test" ] || { echo "FATAL: TEST bootstrap requires canonical media-worker.test path" >&2; exit 1; }
  node "$PROJECT_ROOT/deploy/host/bootstrap-c4-test-env.mjs" --execute
elif [ "$#" -ne 0 ]; then
  echo "FATAL: usage: $0 [--bootstrap-test-env]" >&2
  exit 2
fi

[ -r "$API_ENV_FILE" ] || { echo "FATAL: cannot read $API_ENV_FILE" >&2; exit 1; }
[ -r "$WEBAPP_ENV_FILE" ] || { echo "FATAL: cannot read $WEBAPP_ENV_FILE" >&2; exit 1; }
[ -r "$MEDIA_WORKER_ENV_FILE" ] || { echo "FATAL: cannot read $MEDIA_WORKER_ENV_FILE" >&2; exit 1; }
[ -r "$OVERLAY" ] || { echo "FATAL: cannot read $OVERLAY" >&2; exit 1; }

# Reject any webapp/API/operator role reuse before CREATE/ALTER/password mutation.
node "$PROJECT_ROOT/deploy/host/saas-c2-secret-preflight.mjs" \
  --process-env-file="webapp:$WEBAPP_ENV_FILE" \
  --process-env-file="integrator:$API_ENV_FILE" \
  --process-env-file="media-worker:$MEDIA_WORKER_ENV_FILE"

url_field(){
  local field="$1"
  node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const u=new URL(s);process.stdout.write(decodeURIComponent(u['$field']));});"
}

set -a
# shellcheck disable=SC1090
. "$API_ENV_FILE"
set +a
: "${DATABASE_URL_DIAGNOSTIC:?missing DATABASE_URL_DIAGNOSTIC}"
: "${DATABASE_URL_DELIVERY_WORKER:?missing DATABASE_URL_DELIVERY_WORKER}"
: "${DATABASE_URL_SCHEDULER:?missing DATABASE_URL_SCHEDULER}"
diagnostic_url="$DATABASE_URL_DIAGNOSTIC"
delivery_url="$DATABASE_URL_DELIVERY_WORKER"
scheduler_url="$DATABASE_URL_SCHEDULER"
unset DATABASE_URL
set -a
# shellcheck disable=SC1090
. "$MEDIA_WORKER_ENV_FILE"
set +a
: "${DATABASE_URL:?missing media-worker DATABASE_URL}"
media_url="$DATABASE_URL"

urls=("$diagnostic_url" "$delivery_url" "$scheduler_url" "$media_url")
roles=()
passwords=()
database=""
for url in "${urls[@]}"; do
  role="$(printf '%s' "$url" | url_field username)"
  password="$(printf '%s' "$url" | url_field password)"
  current_database="$(printf '%s' "$url" | url_field pathname)"
  current_database="${current_database#/}"
  [[ "$role" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "FATAL: unsafe PostgreSQL role identifier" >&2; exit 1; }
  [ -n "$password" ] || { echo "FATAL: operational URL has no password" >&2; exit 1; }
  [[ "$password" != *$'\n'* && "$password" != *$'\r'* ]] || {
    echo "FATAL: operational URL password contains a line break" >&2
    exit 1
  }
  [ -n "$current_database" ] || { echo "FATAL: operational URL has no database name" >&2; exit 1; }
  if [ -z "$database" ]; then database="$current_database"; fi
  [ "$database" = "$current_database" ] || { echo "FATAL: operational URLs target different databases" >&2; exit 1; }
  roles+=("$role")
  passwords+=("$password")
done
[ "$(printf '%s\n' "${roles[@]}" | sort -u | wc -l)" -eq 4 ] || {
  echo "FATAL: four operational URLs must use four distinct roles" >&2
  exit 1
}

for index in "${!roles[@]}"; do
  role="${roles[$index]}"
  password="${passwords[$index]}"
  sudo -u postgres psql -d "$database" -X -v ON_ERROR_STOP=1 -q -v role="$role" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOINHERIT NOBYPASSRLS', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', :'role')
\gexec
SQL
  printf '%s\n%s\n' "$password" "$password" |
    sudo -u postgres psql -d "$database" -X -q -c "\\password $role" >/dev/null
done
unset password passwords urls diagnostic_url delivery_url scheduler_url media_url DATABASE_URL

sudo -u postgres psql -d "$database" -X -v ON_ERROR_STOP=1 \
  -v c4_diagnostic_login_role="${roles[0]}" \
  -v c4_delivery_worker_login_role="${roles[1]}" \
  -v c4_scheduler_login_role="${roles[2]}" \
  -v c4_media_worker_login_role="${roles[3]}" \
  -f "$OVERLAY"

API_ENV_FILE="$API_ENV_FILE" MEDIA_WORKER_ENV_FILE="$MEDIA_WORKER_ENV_FILE" \
  bash "$PROJECT_ROOT/deploy/host/assert-c4-operational-runtime-ready.sh"
echo "C4 root/DB-admin provisioning: OK"
