#!/usr/bin/env bash
# Offline initial access cutover for exactly one declared database/environment.
set -euo pipefail
set +x

environment=
database=
backup_file=
operational_connection_limit=
execute=0

die() { echo "cutover-postgres-port-context: $*" >&2; exit 1; }
usage() {
  echo 'usage: cutover-postgres-port-context.sh --execute --environment dev|test --database DB --backup-file /dedicated/new.dump [--operational-connection-limit -1|N]' >&2
}

while (($#)); do
  case "$1" in
    --execute) execute=1 ;;
    --environment|--database|--backup-file|--operational-connection-limit)
      (($# >= 2)) || die "missing value for $1"
      key=${1#--}; key=${key//-/_}; printf -v "$key" '%s' "$2"
      shift ;;
    --help) usage; exit 0 ;;
    *) die "unknown argument $1" ;;
  esac
  shift
done
(( execute == 1 )) || { usage; exit 2; }
[[ $EUID -eq 0 ]] || die 'run as root'
hostname -I | tr ' ' '\n' | grep -Fxq '151.241.228.122' ||
  die 'refusing outside the documented DEV/TEST host 151.241.228.122'
[[ "$backup_file" = /* && ! -e "$backup_file" ]] || die '--backup-file must be a new absolute path'
backup_parent=$(realpath -e -- "$(dirname -- "$backup_file")")
[[ -d "$backup_parent" && "$backup_parent" != / && "$backup_parent" != /home && "$backup_parent" != /home/dev ]] ||
  die '--backup-file requires an existing dedicated directory'

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
case "$environment:$database" in
  dev:bcb_webapp_dev)
    [[ "$repo_root" == /home/dev/dev-projects/BersonCareBot ]] ||
      die "DEV cutover requires the exact integration checkout, got $repo_root"
    api_env="$repo_root/.env"
    webapp_env="$repo_root/apps/webapp/.env.dev"
    bootstrap_mode=--dev-port-context-execute
    staff_login=bcb_dev_webapp_staff
    patient_login=bcb_dev_webapp_patient
    global_admin_login=bcb_dev_webapp_global_admin
    integrator_login=bcb_dev_integrator
    password_prefix=BCB_DEV
    tls_dir=/etc/bersoncarebot/postgres-mtls/dev
    ;;
  test:bersoncarebot_test)
    [[ "$repo_root" == /opt/projects/bersoncarebot-test ]] ||
      die "TEST cutover requires the exact deployed TEST checkout, got $repo_root"
    api_env=/opt/env/bersoncarebot/api.test
    webapp_env=/opt/env/bersoncarebot/webapp.test
    bootstrap_mode=--port-context-execute
    staff_login=bcb_test_webapp_staff
    patient_login=bcb_test_webapp_patient
    global_admin_login=bcb_test_webapp_global_admin
    integrator_login=bcb_test_integrator
    password_prefix=BCB_TEST
    tls_dir=/etc/bersoncarebot/postgres-mtls/test
    ;;
  *) die 'environment/database must be exactly dev/bcb_webapp_dev or test/bersoncarebot_test' ;;
esac

material="$repo_root/deploy/host/provision-dev-test-postgres-mtls-material.sh"
bootstrap="$repo_root/deploy/host/bootstrap-c4-test-env.mjs"
apply_hba="$repo_root/deploy/host/apply-postgres-mtls.sh"
probe_source="$repo_root/deploy/host/probe-dev-test-postgres-mtls.mjs"
cutover="$repo_root/deploy/postgres/privileges/initial-cutover.mjs"
sequence="$repo_root/deploy/host/port-context-cutover-sequence.sh"
journal=/var/log/postgresql/postgresql-16-main.log
for path in "$material" "$bootstrap" "$apply_hba" "$probe_source" "$cutover" "$sequence" "$api_env" "$webapp_env"; do
  [[ -f "$path" && ! -L "$path" ]] || die "missing regular artifact $path"
done
[[ -f "$journal" && -r "$journal" ]] || die "unreadable PostgreSQL journal $journal"

# mTLS material is host bootstrap state, not database state. Add only the exact
# target environment's missing clients; never rotate an existing authority/key.
bash "$material" --execute --environment "$environment"
bash "$material" --check --environment "$environment"

api_env_backup="${backup_file}.api-env.before"
webapp_env_backup="${backup_file}.webapp-env.before"
[[ ! -e "$api_env_backup" && ! -e "$webapp_env_backup" ]] || die 'environment backup target already exists'
install -o root -g root -m 0600 "$api_env" "$api_env_backup"
install -o root -g root -m 0600 "$webapp_env" "$webapp_env_backup"
node --experimental-strip-types "$bootstrap" "$bootstrap_mode"

secret_file=$(mktemp /run/bersoncarebot-port-context-secrets.XXXXXX)
probe_dir=/usr/local/libexec
probe=$probe_dir/bersoncarebot-port-context-probe.mjs
cleanup_secrets() { rm -f -- "$secret_file"; }
trap cleanup_secrets EXIT
chmod 0600 "$secret_file"
node - "$api_env" "$webapp_env" "$integrator_login" "$staff_login" "$patient_login" "$global_admin_login" >"$secret_file" <<'NODE'
const { readFileSync } = require('node:fs');
function parse(path) {
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match || values.has(match[1])) throw new Error(`invalid or duplicate env entry in ${path}`);
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1).replaceAll(`'"'"'`, "'");
    }
    values.set(match[1], value);
  }
  return values;
}
const [apiPath, webappPath, integratorLogin, staffLogin, patientLogin, globalAdminLogin] = process.argv.slice(2);
const api = parse(apiPath);
const webapp = parse(webappPath);
function password(values, key, expectedLogin) {
  const url = new URL(values.get(key));
  if (decodeURIComponent(url.username) !== expectedLogin || !url.password) throw new Error(`${key} identity mismatch`);
  return decodeURIComponent(url.password);
}
const inviteProof = webapp.get('DB_PRINCIPAL_SIGNING_SECRET')
  || webapp.get('INTEGRATOR_WEBHOOK_SECRET')
  || webapp.get('INTEGRATOR_SHARED_SECRET')
  || webapp.get('SESSION_COOKIE_SECRET');
if (!inviteProof || inviteProof.length < 32) throw new Error('patient invite proof secret is missing or too short');
process.stdout.write(JSON.stringify({
  integrator: password(api, 'INTEGRATOR_DB_URL', integratorLogin),
  staff: password(webapp, 'DATABASE_URL_STAFF', staffLogin),
  patient: password(webapp, 'DATABASE_URL_PATIENT', patientLogin),
  globalAdmin: password(webapp, 'DATABASE_URL_GLOBAL_ADMIN', globalAdminLogin),
  inviteProof,
}));
NODE
read_secret() {
  node -e "const v=JSON.parse(require('node:fs').readFileSync(process.argv[1],'utf8'))[process.argv[2]]; if(!v)process.exit(1); process.stdout.write(v)" "$secret_file" "$1"
}
export "${password_prefix}_WEBAPP_STAFF_PASSWORD=$(read_secret staff)"
export "${password_prefix}_WEBAPP_PATIENT_PASSWORD=$(read_secret patient)"
export "${password_prefix}_WEBAPP_GLOBAL_ADMIN_PASSWORD=$(read_secret globalAdmin)"
export "${password_prefix}_INTEGRATOR_PASSWORD=$(read_secret integrator)"
export "${password_prefix}_INVITE_PROOF_SECRET=$(read_secret inviteProof)"

captured_connection_limit=$(runuser -u postgres -- psql -X -d postgres -Atqc \
  "SELECT datconnlimit FROM pg_catalog.pg_database WHERE datname='$database';")
[[ "$captured_connection_limit" =~ ^-?[0-9]+$ ]] || die 'could not capture target connection limit'
if [[ "$captured_connection_limit" == 0 ]]; then
  [[ "$operational_connection_limit" =~ ^(-1|[1-9][0-9]*)$ ]] ||
    die 'target is already fail-closed at CONNECTION LIMIT 0; retry requires --operational-connection-limit -1|N'
  connection_limit=$operational_connection_limit
elif [[ -n "$operational_connection_limit" ]]; then
  die '--operational-connection-limit is only valid when retrying a target already at CONNECTION LIMIT 0'
else
  connection_limit=$captured_connection_limit
fi
PORT_CONTEXT_CUTOVER_STARTED=0
PORT_CONTEXT_CUTOVER_COMPLETE=0
port_context_cutover_close_target() {
  runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE $database CONNECTION LIMIT 0;
     SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
     WHERE datname='$database' AND pid<>pg_backend_pid();" >/dev/null
}
port_context_cutover_install_target() {
  node --experimental-strip-types "$cutover" \
    --env "$environment" --db "$database" \
    --admin-socket /var/run/postgresql --admin-port 5432 \
    --backup-file "$backup_file"
}
port_context_cutover_apply_hba() {
  bash "$apply_hba" --apply "${hba_args[@]}"
}
port_context_cutover_open_readiness_window() {
  # Probes are sequential, so one connection is sufficient.  The EXIT guard
  # immediately returns this target to zero if any probe or later step fails.
  runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE $database CONNECTION LIMIT 1;" >/dev/null
}
port_context_cutover_verify_readiness() {
  bash "$apply_hba" --readiness "${hba_args[@]}" \
    --probe-command "$probe" --auth-refusal-journal "$journal"
}
port_context_cutover_restore_operational_limit() {
  runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE $database CONNECTION LIMIT $connection_limit;" >/dev/null
}
fail_closed_exit() {
  local status=$?
  cleanup_secrets
  if [[ ${PORT_CONTEXT_CUTOVER_STARTED:-0} -eq 1 && ${PORT_CONTEXT_CUTOVER_COMPLETE:-0} -ne 1 ]]; then
    if ! port_context_cutover_close_target; then
      echo 'cutover-postgres-port-context: failed to leave target at CONNECTION LIMIT 0' >&2
      status=70
    fi
  fi
  exit "$status"
}

hba_args=(
  --environment "$environment"
  --database "$database"
  --staff-login "$staff_login"
  --patient-login "$patient_login"
  --global-admin-login "$global_admin_login"
  --integrator-login "$integrator_login"
  --ca-file "$tls_dir/ca.crt"
  --crl-file "$tls_dir/ca.crl"
  --server-cert-file /etc/bersoncarebot/postgres-mtls/server/server.crt
  --server-key-file /etc/bersoncarebot/postgres-mtls/server/server.key
)
install -d -o root -g root -m 0755 "$probe_dir"
install -o root -g root -m 0700 "$probe_source" "$probe"
node "$probe" --validate "$environment"

# shellcheck source=deploy/host/port-context-cutover-sequence.sh
source "$sequence"
trap fail_closed_exit EXIT
run_port_context_cutover_sequence

trap - EXIT
cleanup_secrets
printf 'cutover-postgres-port-context: PASS (environment=%s database=%s backup=%s)\n' \
  "$environment" "$database" "$backup_file"
