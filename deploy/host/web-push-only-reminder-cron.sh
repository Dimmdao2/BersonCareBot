#!/usr/bin/env bash
set -euo pipefail

CRONPORT="/home/dev/brain/tools/cronport.mjs"
JOB_NAME="bersoncarebot-test-web-push-only-reminders"
PROD_JOB_NAME="bersoncarebot-prod-web-push-only-reminders"
TEST_PROJECT_ROOT="/opt/projects/bersoncarebot-test"
TEST_ENV_FILE="/opt/env/bersoncarebot/webapp.test"
TEST_ENDPOINT="http://127.0.0.1:6300/api/internal/reminders/web-push-only/tick?limit=50"
LOCK_FILE="/run/lock/bersoncarebot-test-web-push-only-reminders.lock"
PROD_PROJECT_ROOT="/opt/projects/bersoncarebot"
PROD_ENV_FILE="/opt/env/bersoncarebot/webapp.prod"
PROD_ENDPOINT="http://127.0.0.1:6200/api/internal/reminders/web-push-only/tick?limit=50"
PROD_LOCK_FILE="/run/lock/bersoncarebot-prod-web-push-only-reminders.lock"

fail(){ echo "web-push-only reminder cron: $*" >&2; exit 1; }
require_root(){ [ "${EUID}" -eq 0 ] || fail "run as root"; }

assert_canonical_prod_host(){
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD reminder cron action on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    fail "refusing PROD reminder cron action without local IPv4 135.106.162.170"
}

run_job(){
  local env_file="$1" endpoint="$2" lock_file="$3"
  require_root
  [ -r "$env_file" ] || fail "cannot read canonical environment file"
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  : "${INTERNAL_JOB_SECRET:?missing INTERNAL_JOB_SECRET}"
  exec 9>"$lock_file"
  flock -n 9 || exit 0
  curl --fail-with-body --silent --show-error --max-time 50 \
    -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" "$endpoint" >/dev/null
}

run_test(){ run_job "$TEST_ENV_FILE" "$TEST_ENDPOINT" "$LOCK_FILE"; }
run_prod(){ assert_canonical_prod_host; run_job "$PROD_ENV_FILE" "$PROD_ENDPOINT" "$PROD_LOCK_FILE"; }

install_test(){
  require_root
  [ -x "$TEST_PROJECT_ROOT/deploy/host/web-push-only-reminder-cron.sh" ] || fail "canonical TEST checkout/script is unavailable"
  node "$CRONPORT" set "$JOB_NAME" '* * * * *' "$TEST_PROJECT_ROOT/deploy/host/web-push-only-reminder-cron.sh run-test"
}

install_prod(){
  assert_canonical_prod_host
  require_root
  [ -x "$PROD_PROJECT_ROOT/deploy/host/web-push-only-reminder-cron.sh" ] || fail "canonical PROD checkout/script is unavailable"
  node "$CRONPORT" set "$PROD_JOB_NAME" '* * * * *' "$PROD_PROJECT_ROOT/deploy/host/web-push-only-reminder-cron.sh run-prod"
}

self_test(){
  [ "$TEST_PROJECT_ROOT" = "/opt/projects/bersoncarebot-test" ] || fail "wrong TEST project root"
  [ "$TEST_ENV_FILE" = "/opt/env/bersoncarebot/webapp.test" ] || fail "wrong TEST env path"
  [ "$TEST_ENDPOINT" = "http://127.0.0.1:6300/api/internal/reminders/web-push-only/tick?limit=50" ] || fail "wrong TEST endpoint"
  case "$(declare -f install_test)" in
    *'node "$CRONPORT" set'*) ;;
    *) fail "install must use cronport" ;;
  esac
  echo "web-push-only reminder cron self-test: OK"
}

case "${1:-}" in
  run-test) [ "$#" -eq 1 ] || fail "unexpected arguments"; run_test ;;
  run-prod) [ "$#" -eq 1 ] || fail "unexpected arguments"; run_prod ;;
  install-test) [ "$#" -eq 1 ] || fail "unexpected arguments"; install_test ;;
  install-prod) [ "$#" -eq 1 ] || fail "unexpected arguments"; install_prod ;;
  disable-test) require_root; node "$CRONPORT" disable "$JOB_NAME" ;;
  enable-test) require_root; node "$CRONPORT" enable "$JOB_NAME" ;;
  remove-test) require_root; node "$CRONPORT" remove "$JOB_NAME" ;;
  disable-prod) assert_canonical_prod_host; require_root; node "$CRONPORT" disable "$PROD_JOB_NAME" ;;
  enable-prod) assert_canonical_prod_host; require_root; node "$CRONPORT" enable "$PROD_JOB_NAME" ;;
  remove-prod) assert_canonical_prod_host; require_root; node "$CRONPORT" remove "$PROD_JOB_NAME" ;;
  status) node "$CRONPORT" list | grep -E "${JOB_NAME}|${PROD_JOB_NAME}" || true ;;
  --self-test) self_test ;;
  *) fail "usage: $0 {run-test|run-prod|install-test|install-prod|disable-test|disable-prod|enable-test|enable-prod|remove-test|remove-prod|status|--self-test}" ;;
esac
