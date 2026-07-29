#!/usr/bin/env bash
set +x
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/opt/projects/bersoncarebot}"
API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"
MEDIA_WORKER_ENV_FILE="${MEDIA_WORKER_ENV_FILE:-/opt/env/bersoncarebot/media-worker.prod}"
OVERLAY="$PROJECT_ROOT/deploy/postgres/c4-operational-runtime.sql"
WEB_PUSH_OVERLAY="$PROJECT_ROOT/deploy/postgres/c4-web-push-reminder-runtime.sql"
PASSWORD_SETTER="$PROJECT_ROOT/deploy/host/set-postgres-role-password.mjs"
TEST_BOOTSTRAP=0

validate_test_bootstrap_paths(){
  [ "$PROJECT_ROOT" = "/opt/projects/bersoncarebot-test" ] || { echo "FATAL: TEST bootstrap requires canonical TEST project root" >&2; return 1; }
  [ "$API_ENV_FILE" = "/opt/env/bersoncarebot/api.test" ] || { echo "FATAL: TEST bootstrap requires canonical api.test path" >&2; return 1; }
  [ "$WEBAPP_ENV_FILE" = "/opt/env/bersoncarebot/webapp.test" ] || { echo "FATAL: TEST bootstrap requires canonical webapp.test path" >&2; return 1; }
  [ "$MEDIA_WORKER_ENV_FILE" = "/opt/env/bersoncarebot/media-worker.test" ] || { echo "FATAL: TEST bootstrap requires canonical media-worker.test path" >&2; return 1; }
}

validate_operational_endpoint(){
  local host="$1" port="$2"
  [ "$host" = "127.0.0.1" ] && [ "$port" = "5432" ] || {
    echo "FATAL: operational URLs must target exact local PostgreSQL endpoint 127.0.0.1:5432" >&2
    return 1
  }
}

validate_test_database(){
  [ "$1" = "bersoncarebot_test" ] || {
    echo "FATAL: TEST operational URLs must target exact database bersoncarebot_test" >&2
    return 1
  }
}

run_self_test(){
  if ! (PROJECT_ROOT=/opt/projects/bersoncarebot-test
        API_ENV_FILE=/opt/env/bersoncarebot/api.test
        WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.test
        MEDIA_WORKER_ENV_FILE=/opt/env/bersoncarebot/media-worker.test
        validate_test_bootstrap_paths); then
    echo "FATAL: self-test rejected canonical TEST paths" >&2
    return 1
  fi
  if (unset PROJECT_ROOT
      PROJECT_ROOT="${PROJECT_ROOT:-/opt/projects/bersoncarebot}"
      API_ENV_FILE=/opt/env/bersoncarebot/api.test
      WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.test
      MEDIA_WORKER_ENV_FILE=/opt/env/bersoncarebot/media-worker.test
      validate_test_bootstrap_paths) >/dev/null 2>&1; then
    echo "FATAL: self-test accepted omitted project root" >&2
    return 1
  fi
  for rejected_root in /opt/projects/bersoncarebot /opt/projects/wrong-test; do
    if (PROJECT_ROOT="$rejected_root"
        API_ENV_FILE=/opt/env/bersoncarebot/api.test
        WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.test
        MEDIA_WORKER_ENV_FILE=/opt/env/bersoncarebot/media-worker.test
        validate_test_bootstrap_paths) >/dev/null 2>&1; then
      echo "FATAL: self-test accepted non-canonical project root" >&2
      return 1
    fi
  done
  validate_operational_endpoint 127.0.0.1 5432 >/dev/null
  if validate_operational_endpoint db.example.test 5432 >/dev/null 2>&1; then
    echo "FATAL: self-test accepted remote PostgreSQL endpoint" >&2
    return 1
  fi
  if validate_operational_endpoint 127.0.0.1 6432 >/dev/null 2>&1; then
    echo "FATAL: self-test accepted non-canonical PostgreSQL port" >&2
    return 1
  fi
  validate_test_database bersoncarebot_test >/dev/null
  if validate_test_database bersoncarebot_prod >/dev/null 2>&1; then
    echo "FATAL: self-test accepted non-canonical TEST database" >&2
    return 1
  fi
  echo "provision-c4-operational-runtime self-test: OK"
}

if [ "${1:-}" = "--self-test" ]; then
  [ "$#" -eq 1 ] || { echo "FATAL: usage: $0 [--bootstrap-test-env|--self-test]" >&2; exit 2; }
  run_self_test
  exit
fi

assert_canonical_prod_host(){
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] || {
    echo "FATAL: refusing PROD C4 provisioning on host '${current_hostname:-unknown}'; expected adelaide" >&2
    return 1
  }
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] || {
    echo "FATAL: refusing PROD C4 provisioning without local IPv4 135.106.162.170" >&2
    return 1
  }
}

if [ "${1:-}" != "--bootstrap-test-env" ]; then
  assert_canonical_prod_host
fi

[ "${EUID}" -eq 0 ] || { echo "FATAL: run as root/DB administrator" >&2; exit 1; }

if [ "${1:-}" = "--bootstrap-test-env" ]; then
  [ "$#" -eq 1 ] || { echo "FATAL: usage: $0 [--bootstrap-test-env|--self-test]" >&2; exit 2; }
  validate_test_bootstrap_paths
  TEST_BOOTSTRAP=1
  node "$PROJECT_ROOT/deploy/host/bootstrap-c4-test-env.mjs" --execute
elif [ "$#" -ne 0 ]; then
  echo "FATAL: usage: $0 [--bootstrap-test-env|--self-test]" >&2
  exit 2
fi

[ -r "$API_ENV_FILE" ] || { echo "FATAL: cannot read $API_ENV_FILE" >&2; exit 1; }
[ -r "$WEBAPP_ENV_FILE" ] || { echo "FATAL: cannot read $WEBAPP_ENV_FILE" >&2; exit 1; }
[ -r "$MEDIA_WORKER_ENV_FILE" ] || { echo "FATAL: cannot read $MEDIA_WORKER_ENV_FILE" >&2; exit 1; }
[ -r "$OVERLAY" ] || { echo "FATAL: cannot read $OVERLAY" >&2; exit 1; }
[ -r "$WEB_PUSH_OVERLAY" ] || { echo "FATAL: cannot read $WEB_PUSH_OVERLAY" >&2; exit 1; }
[ -x "$PASSWORD_SETTER" ] || { echo "FATAL: cannot execute $PASSWORD_SETTER" >&2; exit 1; }

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
. "$WEBAPP_ENV_FILE"
set +a
: "${DATABASE_URL_WEB_PUSH_REMINDER:?missing DATABASE_URL_WEB_PUSH_REMINDER}"
web_push_reminder_url="$DATABASE_URL_WEB_PUSH_REMINDER"
unset DATABASE_URL
set -a
# shellcheck disable=SC1090
. "$MEDIA_WORKER_ENV_FILE"
set +a
: "${DATABASE_URL:?missing media-worker DATABASE_URL}"
media_url="$DATABASE_URL"

urls=("$diagnostic_url" "$delivery_url" "$scheduler_url" "$media_url" "$web_push_reminder_url")
roles=()
passwords=()
database=""
endpoint=""
for url in "${urls[@]}"; do
  role="$(printf '%s' "$url" | url_field username)"
  password="$(printf '%s' "$url" | url_field password)"
  current_database="$(printf '%s' "$url" | url_field pathname)"
  current_database="${current_database#/}"
  current_host="$(printf '%s' "$url" | url_field hostname)"
  current_port="$(printf '%s' "$url" | url_field port)"
  [[ "$role" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "FATAL: unsafe PostgreSQL role identifier" >&2; exit 1; }
  [ -n "$password" ] || { echo "FATAL: operational URL has no password" >&2; exit 1; }
  [[ "$password" != *$'\n'* && "$password" != *$'\r'* ]] || {
    echo "FATAL: operational URL password contains a line break" >&2
    exit 1
  }
  [ -n "$current_database" ] || { echo "FATAL: operational URL has no database name" >&2; exit 1; }
  validate_operational_endpoint "$current_host" "$current_port" || exit 1
  if [ -z "$database" ]; then database="$current_database"; fi
  [ "$database" = "$current_database" ] || { echo "FATAL: operational URLs target different databases" >&2; exit 1; }
  current_endpoint="$current_host:$current_port"
  if [ -z "$endpoint" ]; then endpoint="$current_endpoint"; fi
  [ "$endpoint" = "$current_endpoint" ] || { echo "FATAL: operational URLs target different endpoints" >&2; exit 1; }
  roles+=("$role")
  passwords+=("$password")
done
[ "$TEST_BOOTSTRAP" != "1" ] || validate_test_database "$database"
[ "$(printf '%s\n' "${roles[@]}" | sort -u | wc -l)" -eq 5 ] || {
  echo "FATAL: five operational URLs must use five distinct roles" >&2
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
  printf '%s' "$password" |
    sudo -u postgres node "$PASSWORD_SETTER" "$database" "$role"
done
unset password passwords urls diagnostic_url delivery_url scheduler_url media_url web_push_reminder_url endpoint DATABASE_URL

sudo -u postgres psql -d "$database" -X -v ON_ERROR_STOP=1 \
  -v c4_diagnostic_login_role="${roles[0]}" \
  -v c4_delivery_worker_login_role="${roles[1]}" \
  -v c4_scheduler_login_role="${roles[2]}" \
  -v c4_media_worker_login_role="${roles[3]}" \
  -f - < "$OVERLAY"

sudo -u postgres psql -d "$database" -X -v ON_ERROR_STOP=1 \
  -v c4_web_push_reminder_login_role="${roles[4]}" \
  -f - < "$WEB_PUSH_OVERLAY"

API_ENV_FILE="$API_ENV_FILE" WEBAPP_ENV_FILE="$WEBAPP_ENV_FILE" MEDIA_WORKER_ENV_FILE="$MEDIA_WORKER_ENV_FILE" \
  bash "$PROJECT_ROOT/deploy/host/assert-c4-operational-runtime-ready.sh"
echo "C4 root/DB-admin provisioning: OK"
