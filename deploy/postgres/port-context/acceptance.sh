#!/usr/bin/env bash
# Disposable PostgreSQL 16 acceptance for SCHEME rev. 9 core. It never reads project env or a live DB.
set -euo pipefail

pg_bin=/usr/lib/postgresql/16/bin
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-portctx.XXXXXX")
data_dir="$work_dir/data"
cert_dir="$work_dir/certs"
log_file="$work_dir/postgres.log"
port=0
for _ in $(seq 1 20); do
  candidate=$((55000 + RANDOM % 500))
  if ! ss -ltn "sport = :$candidate" 2>/dev/null | grep -q LISTEN; then port=$candidate; break; fi
done
[[ "$port" != 0 ]] || { echo 'port-context acceptance: no free disposable port' >&2; exit 1; }
db_name=portctx_accept
staff_login=portctx_webapp_staff
patient_login=portctx_webapp_patient
integrator_login=portctx_integrator
staff_password=staff-local-only-password
patient_password=patient-local-only-password
integrator_password=integrator-local-only-password

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true; fi
  [[ "${PORTCTX_KEEP_DISPOSABLE:-0}" == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT

fail() { echo "port-context acceptance: FAIL: $*" >&2; exit 1; }
must_fail() { if "$@" >/dev/null 2>&1; then fail "unexpected success: $*"; fi; }
psql_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" "$@"; }
psql_as() {
  local user=$1 password=$2 cert=$3 key=$4; shift 4
  PGPASSWORD="$password" "$pg_bin/psql" -X -v ON_ERROR_STOP=1 "host=127.0.0.1 port=$port dbname=$db_name user=$user sslmode=verify-full sslrootcert=$cert_dir/ca.crt sslcert=$cert sslkey=$key" "$@"
}

mkdir -p "$cert_dir"
openssl req -x509 -new -nodes -newkey rsa:2048 -keyout "$cert_dir/ca.key" -out "$cert_dir/ca.crt" -subj /CN=portctx-ca -days 1 >/dev/null 2>&1
cat > "$cert_dir/server.cnf" <<'EOF'
[req]
distinguished_name=dn
req_extensions=req_ext
prompt=no
[dn]
CN=127.0.0.1
[req_ext]
subjectAltName=IP:127.0.0.1
EOF
openssl req -new -nodes -newkey rsa:2048 -keyout "$cert_dir/server.key" -out "$cert_dir/server.csr" -config "$cert_dir/server.cnf" >/dev/null 2>&1
openssl x509 -req -in "$cert_dir/server.csr" -CA "$cert_dir/ca.crt" -CAkey "$cert_dir/ca.key" -CAcreateserial -out "$cert_dir/server.crt" -days 1 -extensions req_ext -extfile "$cert_dir/server.cnf" >/dev/null 2>&1
for login in "$staff_login" "$patient_login" "$integrator_login" wrong_port; do
  openssl req -new -nodes -newkey rsa:2048 -keyout "$cert_dir/$login.key" -out "$cert_dir/$login.csr" -subj "/CN=$login" >/dev/null 2>&1
  openssl x509 -req -in "$cert_dir/$login.csr" -CA "$cert_dir/ca.crt" -CAkey "$cert_dir/ca.key" -CAcreateserial -out "$cert_dir/$login.crt" -days 1 >/dev/null 2>&1
  chmod 0600 "$cert_dir/$login.key"
done
chmod 0600 "$cert_dir/server.key"

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
cat >> "$data_dir/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $port
unix_socket_directories = '$data_dir'
ssl = on
ssl_ca_file = '$cert_dir/ca.crt'
ssl_cert_file = '$cert_dir/server.crt'
ssl_key_file = '$cert_dir/server.key'
password_encryption = 'scram-sha-256'
log_min_messages = warning
log_min_error_statement = error
EOF
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" -o '-c log_line_prefix=%m[%p] ' start >/dev/null
"$pg_bin/createdb" -h 127.0.0.1 -p "$port" "$db_name"

psql_admin -c "CREATE ROLE $staff_login LOGIN PASSWORD '$staff_password'; CREATE ROLE $patient_login LOGIN PASSWORD '$patient_password'; CREATE ROLE $integrator_login LOGIN PASSWORD '$integrator_password';"
psql_admin -v app_staff_login="$staff_login" -v app_patient_login="$patient_login" -v integrator_login="$integrator_login" -f "$repo_root/deploy/postgres/port-context/contract.sql"
psql_admin -c "INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose) VALUES
 ('00000000-0000-0000-0000-000000000101','webapp','$staff_login','app_staff','staff','relation'),
 ('00000000-0000-0000-0000-000000000102','webapp','$patient_login','app_patient','patient','relation'),
 ('00000000-0000-0000-0000-000000000103','integrator','$integrator_login','app_operational_delivery_worker','integrator','relation');
 INSERT INTO app.demo_context_records VALUES ('00000000-0000-0000-0000-000000000001','accepted');"

cat > "$data_dir/pg_hba.conf" <<EOF
local $db_name dev trust
hostnossl $db_name $staff_login,$patient_login,$integrator_login 0.0.0.0/0 reject
hostnossl $db_name $staff_login,$patient_login,$integrator_login ::0/0 reject
local $db_name $staff_login,$patient_login,$integrator_login reject
hostssl $db_name $staff_login 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN
hostssl $db_name $staff_login ::0/0 scram-sha-256 clientcert=verify-full clientname=CN
hostssl $db_name $patient_login 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN
hostssl $db_name $patient_login ::0/0 scram-sha-256 clientcert=verify-full clientname=CN
hostssl $db_name $integrator_login 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN
hostssl $db_name $integrator_login ::0/0 scram-sha-256 clientcert=verify-full clientname=CN
host all all 0.0.0.0/0 reject
host all all ::0/0 reject
EOF
psql_admin -c 'SELECT pg_reload_conf()' >/dev/null

# HBA: each exact CN+cert+SCRAM path succeeds; password alone, wrong cert, non-TLS and socket do not.
[[ $(psql_as "$staff_login" "$staff_password" "$cert_dir/$staff_login.crt" "$cert_dir/$staff_login.key" -Atc 'SELECT current_user') == "$staff_login" ]] || fail 'staff mTLS login'
[[ $(psql_as "$patient_login" "$patient_password" "$cert_dir/$patient_login.crt" "$cert_dir/$patient_login.key" -Atc 'SELECT current_user') == "$patient_login" ]] || fail 'patient mTLS login'
[[ $(psql_as "$integrator_login" "$integrator_password" "$cert_dir/$integrator_login.crt" "$cert_dir/$integrator_login.key" -Atc 'SELECT current_user') == "$integrator_login" ]] || fail 'integrator mTLS login'
must_fail env PGPASSWORD="$staff_password" "$pg_bin/psql" -X "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login sslmode=require sslrootcert=$cert_dir/ca.crt" -c 'SELECT 1'
must_fail psql_as "$patient_login" "$patient_password" "$cert_dir/$staff_login.crt" "$cert_dir/$staff_login.key" -c 'SELECT 1'
must_fail env PGPASSWORD="$staff_password" "$pg_bin/psql" -X "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login sslmode=disable" -c 'SELECT 1'
must_fail env PGPASSWORD="$staff_password" "$pg_bin/psql" -X -h "$data_dir" -d "$db_name" -U "$staff_login" -c 'SELECT 1'

# Login has neither table ACL nor executable named root before SET ROLE; a runtime role has no RLS access without context.
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/$staff_login.crt" "$cert_dir/$staff_login.key" -c 'SELECT * FROM app.demo_context_records'
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/$staff_login.crt" "$cert_dir/$staff_login.key" -c "BEGIN; SET LOCAL ROLE app_staff; SELECT * FROM app.demo_context_records; COMMIT"

run_context() {
  local user=$1 password=$2 cert=$3 key=$4 cap=$5 role=$6 class=$7 row=$8
  local access_sql="SELECT count(*) FROM app.demo_context_records;"
  if [[ "$class" == integrator ]]; then
    access_sql="SELECT app.require_accepted_context(current_user::name, current_user::name, 'integrator'::app.port_context_class, 'relation', decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'), NULL::regprocedure);"
  fi
  psql_as "$user" "$password" "$cert" "$key" -v cap="$cap" -v role="$role" -v class="$class" -v row="$row" -v access_sql="$access_sql" <<'SQL' >/dev/null
BEGIN;
RESET ROLE;
SELECT app.clear_port_context();
SELECT app.install_port_context(:'cap'::uuid, ROW(1, :'class'::app.port_context_class, :'role'::name, 'relation', NULL::regprocedure, decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'), CASE WHEN :'class' IN ('staff','patient') THEN '00000000-0000-0000-0000-000000000010'::uuid ELSE NULL END, CASE WHEN :'class' = 'patient' THEN '00000000-0000-0000-0000-000000000020'::uuid ELSE NULL END, CASE WHEN :'class' IN ('staff','patient') THEN '00000000-0000-0000-0000-000000000001'::uuid ELSE NULL END, CASE WHEN :'class' = 'integrator' THEN 1 ELSE NULL END, '00000000-0000-0000-0000-000000000030'::uuid)::app.port_context_claims);
SET LOCAL ROLE :"role";
:access_sql
RESET ROLE;
SELECT app.clear_port_context();
COMMIT;
SQL
}
run_context "$staff_login" "$staff_password" "$cert_dir/$staff_login.crt" "$cert_dir/$staff_login.key" 00000000-0000-0000-0000-000000000101 app_staff staff staff
run_context "$patient_login" "$patient_password" "$cert_dir/$patient_login.crt" "$cert_dir/$patient_login.key" 00000000-0000-0000-0000-000000000102 app_patient patient patient
run_context "$integrator_login" "$integrator_password" "$cert_dir/$integrator_login.crt" "$cert_dir/$integrator_login.key" 00000000-0000-0000-0000-000000000103 app_operational_delivery_worker integrator integrator
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/$staff_login.crt" "$cert_dir/$staff_login.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000101', ROW(1,'staff','app_staff','wrong',NULL,decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),'00000000-0000-0000-0000-000000000010',NULL,'00000000-0000-0000-0000-000000000001',NULL,'00000000-0000-0000-0000-000000000030')::app.port_context_claims);"

# SQL framing agrees with Node for NULL/empty distinction and all PG16 binary-send primitives.
sql_hash=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('00000000-0000-0000-0000-000000000001'::uuid)),ROW('oid@1',oidsend(42::oid)),ROW('integer@1',int4send(-2)),ROW('bigint@1',int8send(-2)),ROW('xid8@1',xid8send('9'::xid8)),ROW('boolean@1',boolsend(true)),ROW('text@1',textsend('тест')),ROW('name@1',namesend('name'::name)),ROW('bytea@1',byteasend(decode('00ff','hex'))),ROW('timestamptz@1',timestamptz_send('2000-01-01 00:00:00+00'::timestamptz)),ROW('bytea@1',NULL)]::app.port_typed_arg[]),'hex')")
node_hash=$(node - <<'NODE'
const crypto = require('node:crypto');
const b16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b}; const b32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};
const values=[['uuid@1',Buffer.from('00000000000000000000000000000001','hex')],['oid@1',Buffer.from('0000002a','hex')],['integer@1',Buffer.from('fffffffe','hex')],['bigint@1',Buffer.from('fffffffffffffffe','hex')],['xid8@1',Buffer.from('0000000000000009','hex')],['boolean@1',Buffer.from('01','hex')],['text@1',Buffer.from('тест')],['name@1',Buffer.from('name')],['bytea@1',Buffer.from('00ff','hex')],['timestamptz@1',Buffer.alloc(8)],['bytea@1',null]];
const f=[Buffer.from('BCBPORTARGS\0'),b16(1),b16(values.length)];values.forEach(([t,v],i)=>{const tag=Buffer.from(t);f.push(b16(i+1),b16(1),b16(tag.length),tag,b16(2),v===null?Buffer.from('ffffffff','hex'):b32(v.length),...(v===null?[]:[v]));});console.log(crypto.createHash('sha256').update(Buffer.concat(f)).digest('hex'));
NODE
)
[[ "$sql_hash" == "$node_hash" ]] || fail "PG16 binary-send typed arg hash mismatch (sql=$sql_hash node=$node_hash)"
[[ $(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),'hex')") == 0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a ]] || fail 'zero typed hash'
[[ $(psql_admin -Atc "SELECT count(*) FROM pg_roles WHERE rolbypassrls AND rolname IN ('$staff_login','$patient_login','$integrator_login','app_staff','app_patient','app_operational_delivery_worker')") == 0 ]] || fail 'BYPASSRLS present'
grep -q 'accepted port context required' "$log_file" || fail '42501 denial absent from PostgreSQL log'
echo "port-context acceptance: OK (disposable cluster cleaned: $work_dir)"
