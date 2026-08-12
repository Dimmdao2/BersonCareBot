#!/usr/bin/env bash
# Creates the one shared DEV+TEST PostgreSQL mTLS authority and its exact
# server/client certificates. Existing material is verified, never rotated.
set -euo pipefail
set +x

mode=${1:---check}
env_root=/etc/bersoncarebot/postgres-mtls
authority_dir=$env_root/authority
dev_dir=$env_root/dev
test_dir=$env_root/test
server_dir=$env_root/server

die() { echo "provision-dev-test-postgres-mtls-material: $*" >&2; exit 1; }

[[ "$mode" == --check || "$mode" == --execute ]] || die 'usage: provision-dev-test-postgres-mtls-material.sh --check|--execute'
[[ $EUID -eq 0 ]] || die 'run as root'
hostname -I | tr ' ' '\n' | grep -Fxq '151.241.228.122' || die 'refusing: this is not the documented DEV/TEST host 151.241.228.122'
for command_name in openssl install getent realpath stat sha256sum; do
  command -v "$command_name" >/dev/null || die "missing command: $command_name"
done
for account in postgres dev bcb-api-test bcb-web-test; do
  getent passwd "$account" >/dev/null || die "missing required host account: $account"
done

ca_cert=$authority_dir/ca.crt
ca_crl=$authority_dir/ca.crl
ca_key=$authority_dir/private/ca.key
server_cert=$server_dir/server.crt
server_key=$server_dir/server.key

declare -A client_owner=(
  [bcb_dev_webapp_staff]=dev
  [bcb_dev_webapp_patient]=dev
  [bcb_dev_integrator]=dev
  [bcb_test_webapp_staff]=root
  [bcb_test_webapp_patient]=root
  [bcb_test_integrator]=root
)
declare -A client_group=(
  [bcb_dev_webapp_staff]=dev
  [bcb_dev_webapp_patient]=dev
  [bcb_dev_integrator]=dev
  [bcb_test_webapp_staff]=bcb-web-test
  [bcb_test_webapp_patient]=bcb-web-test
  [bcb_test_integrator]=bcb-api-test
)

client_dir() {
  case "$1" in
    bcb_dev_*) printf '%s\n' "$dev_dir" ;;
    bcb_test_*) printf '%s\n' "$test_dir" ;;
    *) die "undeclared client login: $1" ;;
  esac
}

public_key_hash_from_cert() {
  openssl x509 -in "$1" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | awk '{print $1}'
}

public_key_hash_from_key() {
  openssl pkey -in "$1" -pubout -outform DER | sha256sum | awk '{print $1}'
}

assert_mode_owner() {
  local path=$1 expected=$2 actual
  actual=$(stat -Lc '%U:%G:%a' -- "$path")
  [[ "$actual" == "$expected" ]] || die "$path ownership/mode is $actual, expected $expected"
}

verify_material() {
  [[ -d "$authority_dir" && ! -L "$authority_dir" ]] || die "missing authority directory: $authority_dir"
  for path in "$ca_cert" "$ca_crl" "$ca_key" "$server_cert" "$server_key"; do
    [[ -f "$path" && ! -L "$path" ]] || die "missing regular mTLS material: $path"
  done
  openssl x509 -in "$ca_cert" -checkend 86400 -noout >/dev/null || die 'CA expires within 24 hours'
  openssl crl -in "$ca_crl" -noout -verify -CAfile "$ca_cert" >/dev/null || die 'CRL signature is invalid'
  openssl verify -purpose sslserver -CAfile "$ca_cert" -crl_check -CRLfile "$ca_crl" "$server_cert" >/dev/null || die 'server certificate verification failed'
  openssl x509 -in "$server_cert" -checkip 127.0.0.1 -noout >/dev/null || die 'server certificate lacks 127.0.0.1 SAN'
  openssl x509 -in "$server_cert" -checkhost localhost -noout >/dev/null || die 'server certificate lacks localhost SAN'
  [[ "$(public_key_hash_from_cert "$server_cert")" == "$(public_key_hash_from_key "$server_key")" ]] || die 'server certificate/key mismatch'
  assert_mode_owner "$authority_dir" root:root:700
  assert_mode_owner "$ca_key" root:root:600
  assert_mode_owner "$server_dir" root:postgres:750
  assert_mode_owner "$server_key" postgres:postgres:600
  assert_mode_owner "$server_cert" root:postgres:640
  assert_mode_owner "$dev_dir" dev:dev:700
  assert_mode_owner "$test_dir" root:root:711
  for login in "${!client_owner[@]}"; do
    local directory cert key subject expected_owner expected_group
    directory=$(client_dir "$login")
    cert=$directory/$login.crt
    key=$directory/$login.key
    [[ -f "$cert" && ! -L "$cert" && -f "$key" && ! -L "$key" ]] || die "missing client certificate/key for $login"
    openssl verify -purpose sslclient -CAfile "$ca_cert" -crl_check -CRLfile "$ca_crl" "$cert" >/dev/null || die "client certificate verification failed: $login"
    subject=$(openssl x509 -in "$cert" -noout -subject -nameopt RFC2253)
    [[ "$subject" == "subject=CN=$login" ]] || die "client certificate CN mismatch for $login: $subject"
    [[ "$(public_key_hash_from_cert "$cert")" == "$(public_key_hash_from_key "$key")" ]] || die "client certificate/key mismatch: $login"
    expected_owner=${client_owner[$login]}
    expected_group=${client_group[$login]}
    assert_mode_owner "$key" "$expected_owner:$expected_group:640"
    assert_mode_owner "$cert" root:"$expected_group":644
  done
  for target_dir in "$dev_dir" "$test_dir"; do
    [[ -f "$target_dir/ca.crt" && -f "$target_dir/ca.crl" ]] || die "missing client CA/CRL copies in $target_dir"
    cmp -s "$ca_cert" "$target_dir/ca.crt" || die "CA copy drift in $target_dir"
    cmp -s "$ca_crl" "$target_dir/ca.crl" || die "CRL copy drift in $target_dir"
    assert_mode_owner "$target_dir/ca.crt" root:root:644
    assert_mode_owner "$target_dir/ca.crl" root:root:644
  done
  printf 'provision-dev-test-postgres-mtls-material: check PASS (existing material retained)\n'
}

if [[ "$mode" == --check ]]; then
  verify_material
  exit 0
fi

for path in "$authority_dir" "$dev_dir" "$test_dir" "$server_dir"; do
  [[ ! -e "$path" ]] || {
    verify_material
    exit 0
  }
done

umask 077
install -d -o root -g root -m 0755 "$env_root"
work_dir=$(mktemp -d "$env_root/.mtls-build.XXXXXX")
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT
mkdir -p "$work_dir/authority/private" "$work_dir/authority/newcerts" "$work_dir/output"
: > "$work_dir/authority/index.txt"
printf '1000\n' > "$work_dir/authority/serial"
printf '1000\n' > "$work_dir/authority/crlnumber"

write_ca_config() {
  local destination=$1 authority_path=$2
  cat > "$destination" <<EOF
[ ca ]
default_ca = bcb_ca
[ bcb_ca ]
dir = $authority_path
database = \$dir/index.txt
new_certs_dir = \$dir/newcerts
certificate = \$dir/ca.crt
private_key = \$dir/private/ca.key
serial = \$dir/serial
crlnumber = \$dir/crlnumber
default_md = sha256
default_days = 825
default_crl_days = 30
policy = exact_cn
unique_subject = no
copy_extensions = none
[ exact_cn ]
commonName = supplied
[ server_cert ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost,IP:127.0.0.1
[ client_cert ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = clientAuth
EOF
}

write_ca_config "$work_dir/authority/openssl.cnf" "$work_dir/authority"
openssl req -x509 -new -nodes -newkey rsa:3072 -sha256 -days 3650 \
  -keyout "$work_dir/authority/private/ca.key" -out "$work_dir/authority/ca.crt" \
  -subj '/CN=BersonCare DEV-TEST PostgreSQL mTLS CA' \
  -addext 'basicConstraints=critical,CA:true,pathlen:0' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1

issue_certificate() {
  local common_name=$1 extension=$2 prefix=$3
  openssl req -new -nodes -newkey rsa:3072 -sha256 \
    -keyout "$work_dir/output/$prefix.key" -out "$work_dir/output/$prefix.csr" \
    -subj "/CN=$common_name" >/dev/null 2>&1
  openssl ca -batch -config "$work_dir/authority/openssl.cnf" -extensions "$extension" \
    -in "$work_dir/output/$prefix.csr" -out "$work_dir/output/$prefix.crt" >/dev/null 2>&1
}

issue_certificate localhost server_cert server
for login in "${!client_owner[@]}"; do issue_certificate "$login" client_cert "$login"; done
openssl ca -gencrl -config "$work_dir/authority/openssl.cnf" -out "$work_dir/authority/ca.crl" >/dev/null 2>&1
rm -f -- "$work_dir/output"/*.csr

install -d -o root -g root -m 0700 "$authority_dir"
install -d -o root -g root -m 0700 "$authority_dir/private" "$authority_dir/newcerts"
install -o root -g root -m 0600 "$work_dir/authority/private/ca.key" "$ca_key"
install -o root -g root -m 0644 "$work_dir/authority/ca.crt" "$ca_cert"
install -o root -g root -m 0644 "$work_dir/authority/ca.crl" "$ca_crl"
install -o root -g root -m 0600 "$work_dir/authority/index.txt" "$authority_dir/index.txt"
install -o root -g root -m 0600 "$work_dir/authority/index.txt.attr" "$authority_dir/index.txt.attr"
install -o root -g root -m 0600 "$work_dir/authority/serial" "$authority_dir/serial"
install -o root -g root -m 0600 "$work_dir/authority/crlnumber" "$authority_dir/crlnumber"
for issued in "$work_dir/authority/newcerts"/*; do install -o root -g root -m 0600 "$issued" "$authority_dir/newcerts/$(basename "$issued")"; done
write_ca_config "$authority_dir/openssl.cnf" "$authority_dir"
chmod 0600 "$authority_dir/openssl.cnf"

install -d -o root -g postgres -m 0750 "$server_dir"
install -o root -g postgres -m 0640 "$work_dir/output/server.crt" "$server_cert"
install -o postgres -g postgres -m 0600 "$work_dir/output/server.key" "$server_key"
install -d -o dev -g dev -m 0700 "$dev_dir"
install -d -o root -g root -m 0711 "$test_dir"
for target_dir in "$dev_dir" "$test_dir"; do
  install -o root -g root -m 0644 "$ca_cert" "$target_dir/ca.crt"
  install -o root -g root -m 0644 "$ca_crl" "$target_dir/ca.crl"
done
for login in "${!client_owner[@]}"; do
  directory=$(client_dir "$login")
  install -o root -g "${client_group[$login]}" -m 0644 "$work_dir/output/$login.crt" "$directory/$login.crt"
  install -o "${client_owner[$login]}" -g "${client_group[$login]}" -m 0640 "$work_dir/output/$login.key" "$directory/$login.key"
done

verify_material
printf 'provision-dev-test-postgres-mtls-material: execute PASS (new material installed; secrets not printed)\n'
