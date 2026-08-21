#!/usr/bin/env bash
# Reconcile the deterministic A/B walkthrough fixture on the existing named TEST database only.
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

SRC_REPO=/home/dev/dev-projects/BersonCareBot
TEST_REPO=/opt/projects/bersoncarebot-test
DB=bersoncarebot_test
PACKET=/opt/env/bersoncarebot/saas-test-fixture.env
STATE=/run/bersoncarebot/saas-test-fixture-seed.state
LOCK=/tmp/bcb-test-deploy.lock
ROLE=''
PGPASS=''

fail() { printf 'FATAL: %s\n' "$1" >&2; exit 1; }

cleanup() {
  local status=$? cleanup_status=0
  trap - EXIT
  set +e
  if [[ -n "$ROLE" ]]; then
    sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 -v role="$ROLE" <<'SQL' >/dev/null
SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
 WHERE usename = :'role' AND pid <> pg_backend_pid();
DROP ROLE :"role";
SQL
    [[ $? -eq 0 ]] || cleanup_status=1
    if [[ $cleanup_status -eq 0 ]]; then
      [[ "$(sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 -v role="$ROLE" -Atqc \
        "SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'role');")" == true ]] || cleanup_status=1
    fi
  fi
  [[ -z "$PGPASS" ]] || rm -f -- "$PGPASS"
  [[ $cleanup_status -eq 0 ]] && sudo rm -f -- "$STATE" || true
  if [[ $cleanup_status -ne 0 ]]; then
    printf 'FATAL: temporary fixture authority cleanup failed; recovery: sudo bash %s --recover\n' "$SRC_REPO/deploy/host/reconcile-saas-test-walkthrough-fixtures.sh" >&2
    exit 70
  fi
  exit "$status"
}

recover() {
  [[ -r "$STATE" && ! -L "$STATE" ]] || fail 'no protected fixture recovery state exists'
  ROLE="$(sudo cat "$STATE")"
  [[ "$ROLE" =~ ^bcb_test_fixture_seed_[a-z0-9]+$ ]] || fail 'invalid protected recovery state'
  cleanup
}

[[ "${1:-}" != --recover ]] || recover
[[ $# -eq 0 ]] || fail 'usage: bash deploy/host/reconcile-saas-test-walkthrough-fixtures.sh [--recover]'
[[ "$(id -u)" -ne 0 ]] || fail 'run as the non-root repository owner'
[[ "$(realpath "$SRC_REPO")" == "$SRC_REPO" ]] || fail 'source checkout path guard failed'
[[ -d "$TEST_REPO/.git" && ! -L "$TEST_REPO" ]] || fail 'exact TEST checkout is missing or symlinked'
[[ "$(realpath "$0")" == "$SRC_REPO/deploy/host/reconcile-saas-test-walkthrough-fixtures.sh" ]] || fail 'operator entrypoint must be the exact source checkout path'
for address in $(hostname -I 2>/dev/null || true); do [[ "$address" == 151.241.228.122 ]] && ON_TEST_HOST=1; done
[[ "${ON_TEST_HOST:-0}" == 1 ]] || fail 'fixture reconciliation is allowed only on DEV/TEST host 151.241.228.122'
for path in apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts deploy/host/saas-test-fixture-packet.mjs; do
  [[ -f "$SRC_REPO/$path" && ! -L "$SRC_REPO/$path" ]] || fail "canonical path guard failed: $path"
done

exec 9>"$LOCK"
flock -n 9 || fail 'another TEST deploy or fixture reconciliation is already running'
sudo -n -u deploy env SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1 node --input-type=module - "$PACKET" \
  < "$SRC_REPO/deploy/host/saas-test-fixture-packet.mjs" >/dev/null || fail 'protected TEST fixture packet is invalid'
[[ "$(sudo -n -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database();')" == "$DB" ]] || fail 'database identity guard failed'

ROLE="bcb_test_fixture_seed_$(od -An -N8 -tx8 /dev/urandom | tr -d '[:space:]')"
PGPASS="$(mktemp /tmp/bcb-test-fixture-seed.XXXXXX)"
PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d '[:space:]')"
printf '127.0.0.1:5432:%s:%s:%s\n' "$DB" "$ROLE" "$PASSWORD" >"$PGPASS"
sudo chown deploy:deploy "$PGPASS"; chmod 0600 "$PGPASS"
sudo install -d -o root -g root -m 0700 /run/bersoncarebot
printf '%s\n' "$ROLE" | sudo tee "$STATE" >/dev/null
sudo chown root:root "$STATE"; sudo chmod 0600 "$STATE"
trap cleanup EXIT

# This authority exists only while the transactional existing seeder runs; no stationary role changes.
sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 <<SQL >/dev/null
\set role '$ROLE'
\set password '$PASSWORD'
CREATE ROLE :"role" LOGIN SUPERUSER PASSWORD :'password';
SQL
PASSWORD=''
sudo -n -u deploy env -i PATH="$PATH" HOME=/nonexistent PGPASSFILE="$PGPASS" \
  DATABASE_URL="postgresql://${ROLE}@127.0.0.1:5432/${DB}" SAAS_TEST_FIXTURE_ENV_FILE="$PACKET" \
  SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1 timeout --kill-after=10 300 node --import tsx \
  "$SRC_REPO/apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts"
printf 'SaaS TEST walkthrough fixture: PASS (two clinics reconciled; temporary authority removed)\n'
