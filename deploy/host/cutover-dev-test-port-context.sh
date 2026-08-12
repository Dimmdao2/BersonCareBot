#!/usr/bin/env bash
# Internal full-reset step: exact shared HBA first, then bilateral zero/target
# installer, then live mTLS/SCRAM readiness. Services must already be stopped.
set -euo pipefail
set +x

[[ "${1:-}" == --execute && $# -eq 1 ]] || {
  echo 'usage: cutover-dev-test-port-context.sh --execute' >&2
  exit 2
}
[[ $EUID -eq 0 ]] || { echo 'cutover-dev-test-port-context: run as root' >&2; exit 1; }
hostname -I | tr ' ' '\n' | grep -Fxq '151.241.228.122' || {
  echo 'cutover-dev-test-port-context: refusing outside documented DEV/TEST host' >&2
  exit 1
}

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ "$repo_root" == /opt/projects/bersoncarebot-test ]] || {
  echo "cutover-dev-test-port-context: execute requires exact deployed TEST checkout, got $repo_root" >&2
  exit 1
}

material="$repo_root/deploy/host/provision-dev-test-postgres-mtls-material.sh"
bootstrap="$repo_root/deploy/host/bootstrap-c4-test-env.mjs"
apply_hba="$repo_root/deploy/host/apply-postgres-mtls.sh"
probe_source="$repo_root/deploy/host/probe-dev-test-postgres-mtls.mjs"
probe=/run/bersoncarebot-port-context-probe.mjs
journal=/var/log/postgresql/postgresql-16-main.log
for path in "$material" "$bootstrap" "$apply_hba" "$probe_source"; do
  [[ -f "$path" && ! -L "$path" ]] || { echo "cutover-dev-test-port-context: missing artifact $path" >&2; exit 1; }
done
[[ -f "$journal" && -r "$journal" ]] || { echo "cutover-dev-test-port-context: unreadable PostgreSQL journal $journal" >&2; exit 1; }

# Refreshing the signed revocation list is safe and does not rotate the CA or
# any leaf key. The subsequent check requires at least seven days of validity.
bash "$material" --refresh-crl
bash "$material" --check
install -o root -g root -m 0700 "$probe_source" "$probe"
node --experimental-strip-types "$bootstrap" --port-context-check
node --experimental-strip-types "$bootstrap" --dev-port-context-check

# Block every non-superuser reconnect before taking the quiescence snapshot. This
# closes the DEV hot-reload/worker TOCTOU: even an unmanaged process cannot reopen
# a legacy session between pg_stat_activity inspection and cluster zero.
read -r dev_connection_limit test_connection_limit < <(
  runuser -u postgres -- psql -X -d postgres -AtF' ' -c \
    "SELECT max(datconnlimit) FILTER (WHERE datname='bcb_webapp_dev'), max(datconnlimit) FILTER (WHERE datname='bersoncarebot_test') FROM pg_catalog.pg_database;"
)
[[ "$dev_connection_limit" =~ ^-?[0-9]+$ && "$test_connection_limit" =~ ^-?[0-9]+$ ]] || {
  echo 'cutover-dev-test-port-context: could not capture database connection limits' >&2
  exit 1
}
limits_locked=1
restore_connection_limits() {
  local status=$?
  if [[ ${limits_locked:-0} -eq 1 ]]; then
    runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER DATABASE bcb_webapp_dev CONNECTION LIMIT $dev_connection_limit; ALTER DATABASE bersoncarebot_test CONNECTION LIMIT $test_connection_limit;" \
      >/dev/null || true
  fi
  exit "$status"
}
trap restore_connection_limits EXIT
runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE bcb_webapp_dev CONNECTION LIMIT 0; ALTER DATABASE bersoncarebot_test CONNECTION LIMIT 0;
   SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
   WHERE datname IN ('bcb_webapp_dev','bersoncarebot_test') AND pid <> pg_backend_pid();" >/dev/null
non_admin_sessions=$(runuser -u postgres -- psql -X -d postgres -Atqc \
  "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname IN ('bcb_webapp_dev','bersoncarebot_test') AND pid <> pg_backend_pid();")
[[ "$non_admin_sessions" == 0 ]] || {
  echo "cutover-dev-test-port-context: target databases are not quiescent ($non_admin_sessions session(s))" >&2
  exit 1
}

node --experimental-strip-types "$bootstrap" --port-context-execute
node --experimental-strip-types "$bootstrap" --dev-port-context-execute
node "$probe" --validate

hba_args=(
  --environment dev-test
  --database bcb_webapp_dev
  --staff-login bcb_dev_webapp_staff
  --patient-login bcb_dev_webapp_patient
  --integrator-login bcb_dev_integrator
  --secondary-database bersoncarebot_test
  --secondary-staff-login bcb_test_webapp_staff
  --secondary-patient-login bcb_test_webapp_patient
  --secondary-integrator-login bcb_test_integrator
  --ca-file /etc/bersoncarebot/postgres-mtls/test/ca.crt
  --crl-file /etc/bersoncarebot/postgres-mtls/test/ca.crl
  --server-cert-file /etc/bersoncarebot/postgres-mtls/server/server.crt
  --server-key-file /etc/bersoncarebot/postgres-mtls/server/server.key
)

bash "$apply_hba" --apply "${hba_args[@]}"
node "$probe" --run-installer
runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE bcb_webapp_dev CONNECTION LIMIT $dev_connection_limit; ALTER DATABASE bersoncarebot_test CONNECTION LIMIT $test_connection_limit;" \
  >/dev/null
limits_locked=0
bash "$apply_hba" --readiness "${hba_args[@]}" \
  --probe-command "$probe" \
  --auth-refusal-journal "$journal"

printf 'cutover-dev-test-port-context: PASS (shared HBA + bilateral zero/target + live auth readiness)\n'
