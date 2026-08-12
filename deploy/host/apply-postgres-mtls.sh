#!/usr/bin/env bash
# Installs only the standard PG16 mTLS authentication boundary.  It owns no
# roles, grants, application env, CA private key, or service lifecycle.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
renderer="$repo_root/deploy/postgres/port-context/render-host-mtls-hba.mjs"
mode=preflight
environment=
database=
staff_login=
patient_login=
integrator_login=
ca_file=
crl_file=
server_cert_file=
server_key_file=
data_dir=
admin_user=postgres
psql_bin=psql
port=5432
probe_command=
auth_refusal_journal=

die() { echo "apply-postgres-mtls: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
Usage: sudo bash deploy/host/apply-postgres-mtls.sh --environment dev|test --preflight|--apply|--readiness \
  --database DB --staff-login ROLE --patient-login ROLE --integrator-login ROLE \
  --ca-file PATH --crl-file PATH --server-cert-file PATH --server-key-file PATH

The script obtains hba_file/config_file from PostgreSQL, backs both up, atomically
installs the exact first-match HBA block plus TLS verifier settings, reloads, and
rolls both exact files back if PostgreSQL rejects the change.  It refuses PROD and
all hosts other than the documented 151.241.228.122 DEV/TEST host.

Disposable acceptance only: BCB_PG_MTLS_SELFTEST=1 --environment disposable
--data-dir PGDATA --admin-user USER --psql PATH.  This mode never accepts a path
outside the disposable work directory and is not a host deployment mode.

Readiness is deliberately behavioural.  It additionally requires a root-owned,
mode-safe --probe-command and --auth-refusal-journal.  The command is invoked for
positive-staff, positive-patient, positive-integrator, password-only, wrong-cn,
non-tls, socket, and server-impersonation.  It must resolve the exact client
credentials and certificate material without printing them; positive probes exit
zero and negative probes exit non-zero.  The journal must acquire a fresh Postgres
authentication refusal during the negative probes.
EOF
}

while (($#)); do
  case "$1" in
    --preflight) mode=preflight ;;
    --apply) mode=apply ;;
    --readiness) mode=readiness ;;
    --environment|--database|--staff-login|--patient-login|--integrator-login|--ca-file|--crl-file|--server-cert-file|--server-key-file|--data-dir|--admin-user|--psql|--port|--probe-command|--auth-refusal-journal)
      (($# >= 2)) || die "missing value for $1"
      if [[ "$1" == --psql ]]; then
        psql_bin=$2
      else
        key=${1#--}; key=${key//-/_}; printf -v "$key" '%s' "$2"
      fi
      shift ;;
    --help) usage; exit 0 ;;
    *) die "unknown argument $1" ;;
  esac
  shift
done

[[ -x "$renderer" || -f "$renderer" ]] || die "missing HBA renderer: $renderer"
[[ -n "$environment" && -n "$database" && -n "$staff_login" && -n "$patient_login" && -n "$integrator_login" ]] || die 'environment, database, and all three login names are required'
for path in "$ca_file" "$crl_file" "$server_cert_file" "$server_key_file"; do
  [[ -n "$path" && "$path" = /* && "$path" != *$'\n'* && "$path" != *"'"* ]] || die 'TLS material paths must be absolute and contain neither newline nor quote'
done

is_within() {
  local child=$1 parent=$2
  [[ "$(realpath -m -- "$child")" == "$(realpath -m -- "$parent")"/* ]]
}

if [[ "$environment" == disposable ]]; then
  [[ "${BCB_PG_MTLS_SELFTEST:-}" == 1 && -n "$data_dir" ]] || die 'disposable mode is reserved for BCB_PG_MTLS_SELFTEST=1 with --data-dir'
  disposable_root=$(dirname "$(realpath -m -- "$data_dir")")
  for path in "$ca_file" "$crl_file" "$server_cert_file" "$server_key_file"; do is_within "$path" "$disposable_root" || die "disposable TLS path escapes the disposable work directory: $path"; done
  [[ -x "$psql_bin" ]] || die "disposable --psql must name the PG16 psql binary"
else
  [[ "$environment" == dev || "$environment" == test ]] || die 'only documented dev or test hosts are eligible; PROD is always refused'
  hostname -I | tr ' ' '\n' | grep -Fxq '151.241.228.122' || die 'refusing: this is not the documented DEV/TEST host 151.241.228.122'
  [[ $EUID -eq 0 ]] || die 'host apply/preflight must run as root so backup and atomic replacement preserve PostgreSQL ownership'
  admin_user=postgres
fi

run_psql() {
  if [[ "$environment" == disposable ]]; then
    "$psql_bin" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U "$admin_user" -d postgres "$@"
  else
    runuser -u postgres -- "$psql_bin" -X -v ON_ERROR_STOP=1 -d postgres "$@"
  fi
}

scalar() { run_psql -Atqc "$1"; }
require_tls_material() {
  for path in "$ca_file" "$crl_file" "$server_cert_file" "$server_key_file"; do [[ -f "$path" && -r "$path" ]] || die "missing/unreadable TLS material: $path"; done
  command -v openssl >/dev/null || die 'openssl is required to validate public CA/CRL/server certificate material'
  openssl x509 -in "$ca_file" -noout >/dev/null
  openssl crl -in "$crl_file" -noout >/dev/null
  openssl x509 -in "$server_cert_file" -noout >/dev/null
  openssl x509 -in "$ca_file" -checkend 0 -noout >/dev/null || die "CA certificate is expired: $ca_file"
  openssl x509 -in "$server_cert_file" -checkend 0 -noout >/dev/null || die "server certificate is expired: $server_cert_file"
  openssl verify -CAfile "$ca_file" "$server_cert_file" >/dev/null || die 'server certificate does not validate to the supplied CA chain'
  [[ -n "$(openssl crl -in "$crl_file" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')" ]] || die 'CRL does not declare an issuer'
  openssl crl -in "$crl_file" -noout -verify -CAfile "$ca_file" >/dev/null || die 'CRL signature does not validate to the supplied CA chain'
  local cert_public_key key_public_key
  cert_public_key=$(openssl x509 -in "$server_cert_file" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | awk '{print $1}')
  key_public_key=$(openssl pkey -in "$server_key_file" -pubout -outform DER | sha256sum | awk '{print $1}')
  [[ "$cert_public_key" == "$key_public_key" ]] || die 'server certificate does not match server private key'
  local key_mode=$((8#$(stat -c '%a' -- "$server_key_file")))
  (( (key_mode & 077) == 0 )) || die "server key permissions are too broad: $server_key_file"
}

hba_file=$(scalar 'SHOW hba_file;')
config_file=$(scalar 'SHOW config_file;')
[[ -n "$hba_file" && -n "$config_file" && -f "$hba_file" && -f "$config_file" ]] || die 'PostgreSQL did not report readable hba_file/config_file'
if [[ "$environment" == disposable ]]; then
  is_within "$hba_file" "$data_dir" || die 'disposable hba_file escapes PGDATA'
  is_within "$config_file" "$data_dir" || die 'disposable config_file escapes PGDATA'
fi

render_args=(--database "$database" --staff-login "$staff_login" --patient-login "$patient_login" --integrator-login "$integrator_login")
require_tls_material

verify_ssl_context() {
  local expected actual wire_output
  expected=$(openssl x509 -in "$server_cert_file" -noout -fingerprint -sha256 | tr -d '\r')
  wire_output=$(mktemp)
  if ! openssl s_client -starttls postgres -connect "127.0.0.1:$port" -CAfile "$ca_file" -verify_return_error </dev/null >"$wire_output" 2>/dev/null; then
    rm -f -- "$wire_output"
    die 'PostgreSQL TLS handshake did not validate with the supplied CA chain'
  fi
  actual=$(openssl x509 -in "$wire_output" -noout -fingerprint -sha256 2>/dev/null | tr -d '\r') || {
    rm -f -- "$wire_output"
    die 'PostgreSQL TLS handshake did not present a server certificate'
  }
  rm -f -- "$wire_output"
  [[ "$actual" == "$expected" ]] || die 'PostgreSQL did not activate the requested server SSL context'
}

verify_loaded_configuration() {
  [[ "$(scalar 'SHOW ssl;')" == on ]] || die 'PostgreSQL did not load ssl=on'
  [[ "$(scalar 'SHOW ssl_ca_file;')" == "$ca_file" ]] || die 'PostgreSQL did not load the requested ssl_ca_file'
  [[ "$(scalar 'SHOW ssl_crl_file;')" == "$crl_file" ]] || die 'PostgreSQL did not load the requested ssl_crl_file'
  [[ "$(scalar 'SHOW ssl_cert_file;')" == "$server_cert_file" ]] || die 'PostgreSQL did not load the requested ssl_cert_file'
  [[ "$(scalar 'SHOW ssl_key_file;')" == "$server_key_file" ]] || die 'PostgreSQL did not load the requested ssl_key_file'
  [[ "$(scalar "SELECT count(*) FROM pg_file_settings WHERE error IS NOT NULL;")" == 0 ]] || die 'PostgreSQL reports a configuration parse error'
  [[ "$(scalar "SELECT count(*) FROM pg_settings WHERE name IN ('ssl','ssl_ca_file','ssl_crl_file','ssl_cert_file','ssl_key_file') AND pending_restart;")" == 0 ]] || die 'TLS configuration is pending restart; rollback and use the controlled restart cutover'
  verify_ssl_context
}

run_readiness_probes() {
  [[ -n "$probe_command" && -n "$auth_refusal_journal" ]] || die 'readiness requires --probe-command and --auth-refusal-journal'
  [[ "$probe_command" = /* && -x "$probe_command" && -f "$probe_command" ]] || die 'readiness probe command must be an executable absolute regular file'
  [[ "$auth_refusal_journal" = /* && -f "$auth_refusal_journal" && -r "$auth_refusal_journal" ]] || die 'readiness auth-refusal journal must be a readable absolute regular file'
  local probe_mode_bits
  probe_mode_bits=$((8#$(stat -c '%a' -- "$probe_command")))
  (( (probe_mode_bits & 022) == 0 )) || die 'readiness probe command must not be writable by group or other'
  if [[ "$environment" != disposable ]]; then
    [[ "$(stat -c '%u' -- "$probe_command")" == 0 ]] || die 'host readiness probe command must be owned by root'
  fi
  local probe_mode mode expected offset fresh_journal
  offset=$(wc -c < "$auth_refusal_journal")
  for probe_mode in positive-staff positive-patient positive-integrator password-only wrong-cn non-tls socket server-impersonation; do
    case "$probe_mode" in positive-*) expected=success ;; *) expected=failure ;; esac
    set +e
    "$probe_command" "$probe_mode" "$database" "$staff_login" "$patient_login" "$integrator_login" >/dev/null 2>&1
    mode=$?
    set -e
    if [[ "$expected" == success && $mode -ne 0 ]] || [[ "$expected" == failure && $mode -eq 0 ]]; then
      die "readiness $probe_mode probe did not $expected"
    fi
  done
  fresh_journal=$(mktemp)
  tail -c "+$((offset + 1))" "$auth_refusal_journal" > "$fresh_journal" || true
  if ! rg -q 'FATAL:|authentication failed|certificate authentication|no pg_hba\.conf entry' "$fresh_journal"; then
    rm -f -- "$fresh_journal"
    die 'readiness negative probes produced no PostgreSQL authentication refusal journal evidence'
  fi
  rm -f -- "$fresh_journal"
}

verify_readiness() {
  verify_loaded_configuration
  run_readiness_probes
}

if [[ "$mode" == preflight || "$mode" == readiness ]]; then
  if [[ "$mode" == readiness ]]; then verify_readiness; fi
  printf 'apply-postgres-mtls: %s PASS (hba=%s config=%s)\n' "$mode" "$hba_file" "$config_file"
  exit 0
fi

backup_dir=$(mktemp -d "$(dirname "$hba_file")/.bcb-mtls-backup.XXXXXX")
hba_candidate=$(mktemp "$(dirname "$hba_file")/.bcb-mtls-hba.XXXXXX")
config_candidate=$(mktemp "$(dirname "$config_file")/.bcb-mtls-config.XXXXXX")
cp -p -- "$hba_file" "$backup_dir/pg_hba.conf.before"
cp -p -- "$config_file" "$backup_dir/postgresql.conf.before"
rollback_needed=1
rollback() {
  local status=$?
  if [[ $rollback_needed -eq 1 ]]; then
    cp -p -- "$backup_dir/pg_hba.conf.before" "$hba_file"
    cp -p -- "$backup_dir/postgresql.conf.before" "$config_file"
    run_psql -qAtc 'SELECT pg_reload_conf()' >/dev/null 2>&1 || true
    echo "apply-postgres-mtls: rollback restored exact preflight files from $backup_dir" >&2
  fi
  rm -f -- "$hba_candidate" "$config_candidate"
  exit "$status"
}
trap rollback EXIT

node "$renderer" merge --input "$hba_file" --output "$hba_candidate" "${render_args[@]}"
awk '
  $0 == "# BEGIN BCB MANAGED MTLS POSTGRESQL" { begins++; if (inside || begins > 1) invalid=1; inside=1; next }
  $0 == "# END BCB MANAGED MTLS POSTGRESQL" { ends++; if (!inside) invalid=1; inside=0; next }
  !inside { print }
  END { if (inside || invalid || begins != ends) exit 2 }
' "$config_file" > "$config_candidate" || die 'existing postgresql.conf has a malformed managed mTLS block'
cat >> "$config_candidate" <<EOF

# BEGIN BCB MANAGED MTLS POSTGRESQL
ssl = on
ssl_ca_file = '$ca_file'
ssl_crl_file = '$crl_file'
ssl_cert_file = '$server_cert_file'
ssl_key_file = '$server_key_file'
# END BCB MANAGED MTLS POSTGRESQL
EOF

chown --reference="$hba_file" "$hba_candidate"
chmod --reference="$hba_file" "$hba_candidate"
chown --reference="$config_file" "$config_candidate"
chmod --reference="$config_file" "$config_candidate"
mv -f -- "$hba_candidate" "$hba_file"
mv -f -- "$config_candidate" "$config_file"
if [[ "$environment" == disposable && "${BCB_PG_MTLS_INJECT_FAULT:-}" == reload_failure ]]; then
  die 'injected disposable reload failure'
fi
run_psql -qAtc 'SELECT pg_reload_conf()' >/dev/null
verify_loaded_configuration
rollback_needed=0
trap - EXIT
printf 'apply-postgres-mtls: apply PASS (backup retained at %s)\n' "$backup_dir"
