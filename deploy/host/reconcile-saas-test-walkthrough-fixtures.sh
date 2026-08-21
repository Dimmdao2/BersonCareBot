#!/usr/bin/env bash
# Reconcile the deterministic A/B walkthrough fixture on the existing named TEST database only.
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# This is deliberately the same root-controlled path used by deploy-test.sh. Do not inherit an
# operator PATH into deploy/postgres/root commands: this window has a short-lived superuser role.
SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PATH="$SAFE_PATH"
export PATH

SRC_REPO=/home/dev/dev-projects/BersonCareBot
TEST_REPO=/opt/projects/bersoncarebot-test
ALLOWED_BRANCH=feat/doctor-ui-rebuild
DB=bersoncarebot_test
PACKET=/opt/env/bersoncarebot/saas-test-fixture.env
LOCK=/tmp/bcb-test-deploy.lock
SEEDER_REL=apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts
UNITS=(api worker scheduler webapp media-worker)
DB_TIMEOUT_S="${BCB_TEST_FIXTURE_DB_TIMEOUT_S:-15}"
STATE=''
PGPASS=''
SEED_ENV=''
STATE_SECURED=0
SERVICE_STATES_RECORDED=0
ROLE_STATE_WRITTEN=0

fail() { printf 'FATAL: %s\n' "$1" >&2; exit 1; }

# Every PostgreSQL call, including the emergency cleanup path, has a finite TERM→KILL budget.
pg_run() {
  local what="$1"
  shift
  local status
  set +e
  timeout --kill-after=10 "$DB_TIMEOUT_S" "$@"
  status=$?
  set -e
  if [[ "$status" -eq 124 || "$status" -eq 137 ]]; then
    fail "$what timed out after ${DB_TIMEOUT_S}s"
  fi
  [[ "$status" -eq 0 ]] || fail "$what failed (exit $status)"
}

pg_capture() {
  local what="$1"
  shift
  local out status
  set +e
  out="$(timeout --kill-after=10 "$DB_TIMEOUT_S" "$@")"
  status=$?
  set -e
  if [[ "$status" -eq 124 || "$status" -eq 137 ]]; then
    fail "$what timed out after ${DB_TIMEOUT_S}s"
  fi
  [[ "$status" -eq 0 ]] || fail "$what failed (exit $status)"
  printf '%s' "$out"
}

# Cleanup must converge or deliberately preserve recovery state; it must not call fail() and skip
# the rest of EXIT handling when PostgreSQL is unavailable.
pg_cleanup_run() {
  timeout --kill-after=10 "$DB_TIMEOUT_S" "$@"
}

pg_cleanup_capture() {
  timeout --kill-after=10 "$DB_TIMEOUT_S" "$@"
}

service_run() {
  local what="$1"
  shift
  local status
  set +e
  timeout --kill-after=10 30 "$@"
  status=$?
  set -e
  [[ "$status" -eq 0 ]] || { printf 'FATAL: %s failed (exit %s)\n' "$what" "$status" >&2; return 1; }
}

state_append() {
  printf '%s\n' "$1" | sudo -n -u postgres tee -a "$STATE" >/dev/null
}

state_has_active_unit() {
  local unit="$1"
  sudo -n -u postgres grep -qx "unit=${unit}:active" "$STATE"
}

state_has_role() {
  sudo -n -u postgres grep -q '^role=bcb_test_fixture_seed_[a-z0-9]\+$' "$STATE"
}

cleanup_role() {
  [[ "$ROLE_STATE_WRITTEN" == 1 ]] || return 0
  state_has_role || return 1
  pg_cleanup_run sudo -n -u postgres bash -c '
    role=""
    while IFS= read -r line; do
      case "$line" in role=*) role="${line#role=}" ;; esac
    done < "$1"
    [[ "$role" =~ ^bcb_test_fixture_seed_[a-z0-9]+$ ]] || exit 64
    psql -X -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
 WHERE usename = '\''$role'\'' AND pid <> pg_backend_pid();
DROP ROLE IF EXISTS $role;
SQL
  ' bash "$STATE" >/dev/null || return 1
  [[ "$(pg_cleanup_capture sudo -n -u postgres bash -c '
    role=""
    while IFS= read -r line; do
      case "$line" in role=*) role="${line#role=}" ;; esac
    done < "$1"
    [[ "$role" =~ ^bcb_test_fixture_seed_[a-z0-9]+$ ]] || exit 64
    psql -X -d postgres -v ON_ERROR_STOP=1 -Atqc \
      "SELECT (NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '\''$role'\''))::text;"
  ' bash "$STATE")" == true ]] || return 1
}

all_units_were_active() {
  local unit
  for unit in "${UNITS[@]}"; do
    state_has_active_unit "$unit" || return 1
  done
}

wait_for_restored_health() {
  local attempt unit
  for attempt in $(seq 1 15); do
    local active=1
    for unit in "${UNITS[@]}"; do
      systemctl is-active --quiet "bersoncarebot-${unit}-test" || active=0
    done
    if [[ "$active" == 1 ]] && curl -fsk --max-time 10 https://test.bersoncare.ru/api/health >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restore_services() {
  local unit status=0 unit_state
  [[ "$STATE_SECURED" == 1 && "$SERVICE_STATES_RECORDED" == 1 ]] || return 0
  for unit in "${UNITS[@]}"; do
    set +e
    state_has_active_unit "$unit"
    unit_state=$?
    set -e
    case "$unit_state" in
      0) service_run "restore bersoncarebot-${unit}-test" sudo -n systemctl start "bersoncarebot-${unit}-test" || status=1 ;;
      1) ;;
      *) status=1 ;;
    esac
  done
  if all_units_were_active; then
    wait_for_restored_health || status=1
  fi
  return "$status"
}

remove_temporary_files() {
  [[ -z "$PGPASS" ]] || sudo -n rm -f -- "$PGPASS" || true
  [[ -z "$SEED_ENV" ]] || sudo -n rm -f -- "$SEED_ENV" || true
}

cleanup() {
  local status=$? cleanup_status=0
  trap - EXIT INT TERM HUP
  set +e
  cleanup_role || cleanup_status=1
  remove_temporary_files
  restore_services || cleanup_status=1
  if [[ "$cleanup_status" -eq 0 ]]; then
    [[ -z "$STATE" ]] || sudo -n rm -f -- "$STATE" || cleanup_status=1
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    printf 'FATAL: fixture reconciliation recovery is incomplete; TEST service/role state is preserved. recovery: sudo bash %s --recover\n' \
      "$SRC_REPO/deploy/host/reconcile-saas-test-walkthrough-fixtures.sh" >&2
    exit 70
  fi
  exit "$status"
}

require_reviewed_source() {
  local mode="$1"
  if [[ "$(id -u)" -eq 0 ]]; then
    [[ "$mode" == --recover ]] || fail 'run a normal seed as the non-root repository owner'
  fi
  [[ "$(readlink -f "$SRC_REPO")" == "$SRC_REPO" ]] || fail 'source checkout path guard failed'
  [[ "$(readlink -f "${BASH_SOURCE[0]}")" == "$SRC_REPO/deploy/host/reconcile-saas-test-walkthrough-fixtures.sh" ]] ||
    fail 'operator entrypoint must be the exact source checkout path'
  [[ -d "$SRC_REPO/.git" && ! -L "$SRC_REPO" ]] || fail 'source checkout is missing or symlinked'
  git -C "$SRC_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'source checkout is not a Git work tree'
  [[ "$(git -C "$SRC_REPO" rev-parse --show-toplevel)" == "$SRC_REPO" ]] || fail 'source checkout top-level guard failed'
  [[ "$(git -C "$SRC_REPO" symbolic-ref --quiet --short HEAD)" == "$ALLOWED_BRANCH" ]] ||
    fail "source checkout must be on $ALLOWED_BRANCH"
  git -C "$SRC_REPO" rev-parse --verify 'HEAD^{commit}' >/dev/null || fail 'source checkout HEAD is not a commit'
  git -C "$SRC_REPO" diff --quiet --ignore-submodules -- || fail 'tracked source changes must be committed'
  git -C "$SRC_REPO" diff --cached --quiet --ignore-submodules -- || fail 'staged source changes must be committed'
  local path
  for path in deploy/host/reconcile-saas-test-walkthrough-fixtures.sh; do
    [[ -f "$SRC_REPO/$path" && ! -L "$SRC_REPO/$path" ]] || fail "canonical path guard failed: $path"
    git -C "$SRC_REPO" ls-files --error-unmatch -- "$path" >/dev/null || fail "required reviewed file is not tracked: $path"
    git -C "$SRC_REPO" diff --quiet HEAD -- "$path" || fail "required reviewed file has uncommitted changes: $path"
  done
}

require_seed_checkout() {
  local source_head test_head
  [[ "$(id -u)" -ne 0 ]] || fail 'run a normal seed as the non-root repository owner'
  require_reviewed_source ''
  [[ -d "$TEST_REPO/.git" && ! -L "$TEST_REPO" ]] || fail 'TEST checkout is missing or symlinked'
  git -C "$TEST_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'TEST checkout is not a Git work tree'
  [[ "$(git -C "$TEST_REPO" rev-parse --show-toplevel)" == "$TEST_REPO" ]] || fail 'TEST checkout top-level guard failed'
  git -C "$TEST_REPO" rev-parse --verify 'HEAD^{commit}' >/dev/null || fail 'TEST checkout HEAD is not a commit'
  git -C "$TEST_REPO" diff --quiet --ignore-submodules -- || fail 'tracked TEST checkout changes must be committed'
  git -C "$TEST_REPO" diff --cached --quiet --ignore-submodules -- || fail 'staged TEST checkout changes must be committed'
  source_head="$(git -C "$SRC_REPO" rev-parse HEAD)"
  test_head="$(git -C "$TEST_REPO" rev-parse HEAD)"
  git -C "$SRC_REPO" merge-base --is-ancestor "$test_head" "$source_head" ||
    fail 'TEST checkout commit must be an ancestor of reviewed source HEAD'
  [[ -f "$TEST_REPO/$SEEDER_REL" && ! -L "$TEST_REPO/$SEEDER_REL" ]] ||
    fail 'TEST fixture seeder path guard failed'
  git -C "$TEST_REPO" ls-files --error-unmatch -- "$SEEDER_REL" >/dev/null ||
    fail 'TEST fixture seeder is not tracked'
  cmp -s "$SRC_REPO/$SEEDER_REL" "$TEST_REPO/$SEEDER_REL" ||
    fail 'TEST fixture seeder differs from the reviewed source checkout'
  [[ -x "$TEST_REPO/apps/webapp/node_modules/.bin/tsx" ]] ||
    fail 'TEST checkout webapp tsx is not executable'
}

recover() {
  [[ -n "$STATE" ]] || fail 'no protected fixture recovery state exists'
  sudo -n -u postgres test -f "$STATE" && ! sudo -n -u postgres test -L "$STATE" || fail 'protected fixture recovery state is invalid'
  STATE_SECURED=1
  SERVICE_STATES_RECORDED=1
  if state_has_role; then
    ROLE_STATE_WRITTEN=1
  elif [[ $? -ne 1 ]]; then
    fail 'protected fixture recovery state cannot be inspected'
  fi
  trap cleanup EXIT INT TERM HUP
  cleanup
}

MODE="${1:-}"
[[ "$MODE" == --recover || $# -eq 0 ]] || fail 'usage: bash deploy/host/reconcile-saas-test-walkthrough-fixtures.sh [--recover]'
require_reviewed_source "$MODE"
for address in $(hostname -I 2>/dev/null || true); do [[ "$address" == 151.241.228.122 ]] && ON_TEST_HOST=1; done
[[ "${ON_TEST_HOST:-0}" == 1 ]] || fail 'fixture reconciliation is allowed only on DEV/TEST host 151.241.228.122'

exec 9>"$LOCK"
flock -n 9 || fail 'another TEST deploy or fixture reconciliation is already running'

if [[ "$MODE" == --recover ]]; then
  STATE="$(sudo -n find /tmp -maxdepth 1 -type f -name 'bcb-test-fixture-seed.state.*' -user postgres -perm 0600 -print -quit)"
  recover
fi

require_seed_checkout

sudo -n -u deploy env -i PATH="$SAFE_PATH" SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1 \
  node --input-type=module - "$PACKET" < "$SRC_REPO/deploy/host/saas-test-fixture-packet.mjs" >/dev/null ||
  fail 'protected TEST fixture packet is invalid'
[[ "$(pg_capture 'database identity guard' sudo -n -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database();')" == "$DB" ]] ||
  fail 'database identity guard failed'

# Allocate the protected recovery record first and arm cleanup before any other temporary state.
STATE="$(sudo -n mktemp /tmp/bcb-test-fixture-seed.state.XXXXXX)" || fail 'cannot allocate protected fixture recovery state'
trap cleanup EXIT INT TERM HUP
sudo -n chown postgres:postgres "$STATE" && sudo -n chmod 0600 "$STATE" || fail 'cannot secure protected fixture recovery state'
STATE_SECURED=1

for unit in "${UNITS[@]}"; do
  if systemctl is-active --quiet "bersoncarebot-${unit}-test"; then
    state_append "unit=${unit}:active"
  else
    state_append "unit=${unit}:inactive"
  fi
done
SERVICE_STATES_RECORDED=1
for unit in "${UNITS[@]}"; do
  if state_has_active_unit "$unit"; then
    service_run "stop bersoncarebot-${unit}-test" sudo -n systemctl stop "bersoncarebot-${unit}-test" || fail "cannot stop bersoncarebot-${unit}-test"
  fi
done

for attempt in $(seq 1 15); do
  sessions="$(pg_capture 'TEST database quiescence check' sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 -Atqc \
    "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();")"
  [[ "$sessions" == 0 ]] && break
  [[ "$attempt" == 15 ]] && fail "TEST database did not quiesce within 15s ($sessions sessions remain)"
  sleep 1
done

ROLE="bcb_test_fixture_seed_$(od -An -N8 -tx8 /dev/urandom | tr -d '[:space:]')"
PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d '[:space:]')"
state_append "role=$ROLE"
ROLE_STATE_WRITTEN=1
state_append "secret=$PASSWORD"
PGPASS="$(mktemp /tmp/bcb-test-fixture-seed.pgpass.XXXXXX)" || fail 'cannot allocate temporary PostgreSQL credential file'
SEED_ENV="$(mktemp /tmp/bcb-test-fixture-seed.env.XXXXXX)" || fail 'cannot allocate protected seeder environment file'
printf '127.0.0.1:5432:%s:%s:%s\n' "$DB" "$ROLE" "$PASSWORD" >"$PGPASS"
printf 'PGPASSFILE=%q\nDATABASE_URL=%q\nSAAS_TEST_FIXTURE_ENV_FILE=%q\nSAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1\n' \
  "$PGPASS" "postgresql://${ROLE}@127.0.0.1:5432/${DB}" "$PACKET" >"$SEED_ENV"
sudo -n chown deploy:deploy "$PGPASS" "$SEED_ENV" && sudo -n chmod 0600 "$PGPASS" "$SEED_ENV" ||
  fail 'cannot secure temporary fixture credentials'
PASSWORD=''

# Role/password travel only in the protected postgres-owned state file and SQL stdin, never argv.
pg_run 'temporary fixture role creation' sudo -n -u postgres bash -c '
  role="" secret=""
  while IFS= read -r line; do
    case "$line" in
      role=*) role="${line#role=}" ;;
      secret=*) secret="${line#secret=}" ;;
    esac
  done < "$1"
  [[ "$role" =~ ^bcb_test_fixture_seed_[a-z0-9]+$ && "$secret" =~ ^[a-f0-9]{48}$ ]] || exit 64
  psql -X -d postgres -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE $role LOGIN SUPERUSER PASSWORD '\''$secret'\'';
SQL
' bash "$STATE" >/dev/null

# The only child that receives DATABASE_URL sources a 0600 deploy-owned file; its argv contains paths only.
# /home/dev is not traversable by deploy, so execute the reviewed-byte-identical seeder from TEST.
sudo -n -u deploy env -i PATH="$SAFE_PATH" HOME=/nonexistent TEST_REPO="$TEST_REPO" SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1 bash -c '
  set -Eeuo pipefail
  set -a
  . "$1"
  set +a
  exec timeout --kill-after=10 300 pnpm --dir "$TEST_REPO/apps/webapp" exec tsx "$2"
' bash "$SEED_ENV" "$TEST_REPO/$SEEDER_REL"
printf 'SaaS TEST walkthrough fixture: PASS (two clinics reconciled; temporary authority removed)\n'
