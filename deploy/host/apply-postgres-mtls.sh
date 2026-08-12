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
EOF
}

while (($#)); do
  case "$1" in
    --preflight) mode=preflight ;;
    --apply) mode=apply ;;
    --readiness) mode=readiness ;;
    --environment|--database|--staff-login|--patient-login|--integrator-login|--ca-file|--crl-file|--server-cert-file|--server-key-file|--data-dir|--admin-user|--psql|--port)
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

verify_loaded() {
  [[ "$(scalar 'SHOW ssl;')" == on ]] || die 'PostgreSQL did not load ssl=on'
  [[ "$(scalar 'SHOW ssl_ca_file;')" == "$ca_file" ]] || die 'PostgreSQL did not load the requested ssl_ca_file'
  [[ "$(scalar 'SHOW ssl_crl_file;')" == "$crl_file" ]] || die 'PostgreSQL did not load the requested ssl_crl_file'
  [[ "$(scalar 'SHOW ssl_cert_file;')" == "$server_cert_file" ]] || die 'PostgreSQL did not load the requested ssl_cert_file'
  [[ "$(scalar 'SHOW ssl_key_file;')" == "$server_key_file" ]] || die 'PostgreSQL did not load the requested ssl_key_file'
  [[ "$(scalar "SELECT count(*) FROM pg_file_settings WHERE error IS NOT NULL;")" == 0 ]] || die 'PostgreSQL reports a configuration parse error'
  [[ "$(scalar "SELECT count(*) FROM pg_settings WHERE name IN ('ssl','ssl_ca_file','ssl_crl_file','ssl_cert_file','ssl_key_file') AND pending_restart;")" == 0 ]] || die 'TLS configuration is pending restart; rollback and use the controlled restart cutover'
  [[ "$(scalar 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;')" == 0 ]] || die 'PostgreSQL reports a pg_hba.conf parse error'
  node "$renderer" validate --input "$hba_file" "${render_args[@]}"
  # The catalog is consulted after reload: this proves the server parsed the
  # active HBA, rather than only proving text in an unreferenced staging file.
  [[ "$(scalar "SELECT count(*) FROM pg_hba_file_rules WHERE type='hostssl' AND auth_method='scram-sha-256';")" -ge 6 ]] || die 'loaded pg_hba_file_rules lacks the six exact mTLS/SCRAM rows'
}

if [[ "$mode" == preflight || "$mode" == readiness ]]; then
  if [[ "$mode" == readiness ]]; then verify_loaded; fi
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
  $0 == "# BEGIN BCB MANAGED MTLS POSTGRESQL" { inside=1; next }
  $0 == "# END BCB MANAGED MTLS POSTGRESQL" { if (!inside) exit 2; inside=0; next }
  !inside { print }
  END { if (inside) exit 2 }
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
verify_loaded
rollback_needed=0
trap - EXIT
printf 'apply-postgres-mtls: apply PASS (backup retained at %s)\n' "$backup_dir"
