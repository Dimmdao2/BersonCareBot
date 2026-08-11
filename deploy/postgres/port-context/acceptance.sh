#!/usr/bin/env bash
# Disposable PostgreSQL 16 acceptance for SCHEME revision 10.  It creates all
# passwords and key material below mktemp and never reads project environment.
set -euo pipefail

pg_bin=/usr/lib/postgresql/16/bin
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
fault=${PORTCTX_INJECT_FAULT:-}
single_mode=${1:-}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-portctx.XXXXXX")
data_dir="$work_dir/data"
cert_dir="$work_dir/certs"
log_file="$work_dir/postgres.log"
port=0
for _ in $(seq 1 40); do
  candidate=$((55000 + RANDOM % 1000))
  if ! ss -ltn "sport = :$candidate" 2>/dev/null | grep -q LISTEN; then port=$candidate; break; fi
done
[[ "$port" != 0 ]] || { echo 'port-context acceptance: no free disposable port' >&2; exit 1; }

db_name=portctx_accept
staff_login=portctx_webapp_staff
patient_login=portctx_webapp_patient
integrator_login=portctx_integrator
staff_password=staff-disposable-only
patient_password=patient-disposable-only
integrator_password=integrator-disposable-only
h0=0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a
org_a=00000000-0000-0000-0000-000000000001
org_b=00000000-0000-0000-0000-000000000002
actor=00000000-0000-0000-0000-000000000010
subject=00000000-0000-0000-0000-000000000020
request=00000000-0000-0000-0000-000000000030

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true; fi
  [[ "${PORTCTX_KEEP_DISPOSABLE:-0}" == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "port-context acceptance: FAIL${fault:+ ($fault)}: $*" >&2; exit 1; }
must_fail() { if "$@" >/dev/null 2>&1; then fail "unexpected success: $*"; fi; }
must_fail_state() {
  local wanted=$1 output status; shift
  set +e
  output=$("$@" 2>&1); status=$?
  set -e
  [[ $status -ne 0 && "$output" == *"$wanted"* ]] || fail "expected SQLSTATE $wanted, got: $output"
}
psql_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -h "$data_dir" -p "$port" -U dev -d "$db_name" "$@"; }
psql_as() {
  local user=$1 password=$2 cert=$3 key=$4; shift 4
  PGPASSWORD="$password" "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose "host=127.0.0.1 port=$port dbname=$db_name user=$user application_name=portctx-${user} sslmode=verify-full sslrootcert=$cert_dir/ca.crt sslcert=$cert sslkey=$key" "$@"
}
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }

mkdir -p "$cert_dir/newcerts"
: > "$cert_dir/index.txt"
printf '1000\n' > "$cert_dir/serial"
printf '1000\n' > "$cert_dir/crlnumber"
printf '%s\n' \
  '[ ca ]' 'default_ca = ca_default' '[ ca_default ]' "dir = $cert_dir" 'database = $dir/index.txt' \
  'new_certs_dir = $dir/newcerts' 'certificate = $dir/ca.crt' 'private_key = $dir/ca.key' \
  'serial = $dir/serial' 'crlnumber = $dir/crlnumber' 'default_md = sha256' 'default_days = 2' \
  'default_crl_days = 1' 'policy = policy_any' 'copy_extensions = copy' '[ policy_any ]' \
  'commonName = supplied' '[ client_cert ]' 'basicConstraints=CA:FALSE' 'keyUsage=digitalSignature,keyEncipherment' \
  'extendedKeyUsage=clientAuth' > "$cert_dir/ca.cnf"
openssl req -x509 -new -nodes -newkey rsa:2048 -keyout "$cert_dir/ca.key" -out "$cert_dir/ca.crt" -subj /CN=portctx-ca -days 2 >/dev/null 2>&1
openssl req -x509 -new -nodes -newkey rsa:2048 -keyout "$cert_dir/other-ca.key" -out "$cert_dir/other-ca.crt" -subj /CN=portctx-other-ca -days 2 >/dev/null 2>&1
printf '%s\n' '[req]' 'distinguished_name=dn' 'req_extensions=req_ext' 'prompt=no' '[dn]' 'CN=127.0.0.1' '[req_ext]' 'subjectAltName=IP:127.0.0.1' > "$cert_dir/server.cnf"
openssl req -new -nodes -newkey rsa:2048 -keyout "$cert_dir/server.key" -out "$cert_dir/server.csr" -config "$cert_dir/server.cnf" >/dev/null 2>&1
openssl x509 -req -in "$cert_dir/server.csr" -CA "$cert_dir/ca.crt" -CAkey "$cert_dir/ca.key" -CAcreateserial -out "$cert_dir/server.crt" -days 2 -extensions req_ext -extfile "$cert_dir/server.cnf" >/dev/null 2>&1
issue_client() {
  local name=$1 cn=$2
  openssl req -new -nodes -newkey rsa:2048 -keyout "$cert_dir/$name.key" -out "$cert_dir/$name.csr" -subj "/CN=$cn" >/dev/null 2>&1
  openssl ca -batch -config "$cert_dir/ca.cnf" -extensions client_cert -in "$cert_dir/$name.csr" -out "$cert_dir/$name.crt" >/dev/null 2>&1
  chmod 0600 "$cert_dir/$name.key"
}
issue_client staff-old "$staff_login"
# The overlap certificate intentionally has the same exact CN.  It need not be
# in the CA revocation index because only the old serial is revoked below.
openssl req -new -nodes -newkey rsa:2048 -keyout "$cert_dir/staff-rotated.key" -out "$cert_dir/staff-rotated.csr" -subj "/CN=$staff_login" >/dev/null 2>&1
openssl x509 -req -in "$cert_dir/staff-rotated.csr" -CA "$cert_dir/ca.crt" -CAkey "$cert_dir/ca.key" -CAcreateserial -out "$cert_dir/staff-rotated.crt" -days 2 >/dev/null 2>&1
chmod 0600 "$cert_dir/staff-rotated.key"
issue_client patient "$patient_login"
issue_client integrator "$integrator_login"
issue_client wrong-port wrong_port
openssl req -new -nodes -newkey rsa:2048 -keyout "$cert_dir/expired.key" -out "$cert_dir/expired.csr" -subj "/CN=$staff_login" >/dev/null 2>&1
openssl x509 -req -in "$cert_dir/expired.csr" -CA "$cert_dir/ca.crt" -CAkey "$cert_dir/ca.key" -CAcreateserial -out "$cert_dir/expired.crt" -days 0 >/dev/null 2>&1
chmod 0600 "$cert_dir/expired.key"
openssl ca -gencrl -config "$cert_dir/ca.cnf" -out "$cert_dir/ca.crl" >/dev/null 2>&1
chmod 0600 "$cert_dir/server.key"

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' \
  "listen_addresses = '127.0.0.1'" "port = $port" "unix_socket_directories = '$data_dir'" \
  'ssl = on' "ssl_ca_file = '$cert_dir/ca.crt'" "ssl_crl_file = '$cert_dir/ca.crl'" \
  "ssl_cert_file = '$cert_dir/server.crt'" "ssl_key_file = '$cert_dir/server.key'" \
  "password_encryption = 'scram-sha-256'" 'log_min_messages = warning' 'log_min_error_statement = error' >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" -o '-c log_line_prefix=%m[%p] ' start >/dev/null
"$pg_bin/createdb" -h 127.0.0.1 -p "$port" "$db_name"
psql_admin -c "CREATE ROLE $staff_login LOGIN PASSWORD '$staff_password'; CREATE ROLE $patient_login LOGIN PASSWORD '$patient_password'; CREATE ROLE $integrator_login LOGIN PASSWORD '$integrator_password';"
psql_admin -v app_staff_login="$staff_login" -v app_patient_login="$patient_login" -v integrator_login="$integrator_login" -f "$repo_root/deploy/postgres/port-context/contract.sql"

printf '%s\n' \
  "local $db_name dev trust" \
  "hostnossl $db_name $staff_login,$patient_login,$integrator_login 0.0.0.0/0 reject" \
  "hostnossl $db_name $staff_login,$patient_login,$integrator_login ::0/0 reject" \
  "local $db_name $staff_login,$patient_login,$integrator_login reject" \
  "hostssl $db_name $staff_login 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN" \
  "hostssl $db_name $staff_login ::0/0 scram-sha-256 clientcert=verify-full clientname=CN" \
  "hostssl $db_name $patient_login 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN" \
  "hostssl $db_name $patient_login ::0/0 scram-sha-256 clientcert=verify-full clientname=CN" \
  "hostssl $db_name $integrator_login 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN" \
  "hostssl $db_name $integrator_login ::0/0 scram-sha-256 clientcert=verify-full clientname=CN" \
  'host all all 0.0.0.0/0 reject' 'host all all ::0/0 reject' > "$data_dir/pg_hba.conf"
if [[ "$fault" == clientcert ]]; then sed -i 's/ clientcert=verify-full clientname=CN//' "$data_dir/pg_hba.conf"; fi
if [[ "$fault" == broad_hba ]]; then sed -i "2i hostssl $db_name all 0.0.0.0/0 trust" "$data_dir/pg_hba.conf"; fi
psql_admin -c 'SELECT pg_reload_conf()' >/dev/null

psql_admin <<SQL >/dev/null
INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose,function_identity) VALUES
 ('00000000-0000-0000-0000-000000000101','webapp','$staff_login','app_staff','staff','relation',NULL),
 ('00000000-0000-0000-0000-000000000102','webapp','$patient_login','app_patient','patient','relation',NULL),
 ('00000000-0000-0000-0000-000000000103','webapp','$staff_login','app_platform_settings','platform','relation',NULL),
 ('00000000-0000-0000-0000-000000000104','integrator','$integrator_login','app_integrator_request','integrator','relation',NULL),
 ('00000000-0000-0000-0000-000000000105','integrator','$integrator_login','app_tenant_service','tenant_service','relation',NULL),
 ('00000000-0000-0000-0000-000000000106','integrator','$integrator_login','app_service','service','relation',NULL),
 ('00000000-0000-0000-0000-000000000107','webapp','$staff_login','app_pre_session','pre_session','auth.password.begin','app.pre_session_begin_password_login(text)'::regprocedure),
 ('00000000-0000-0000-0000-000000000108','webapp','$staff_login','app_pre_session','pre_session','auth.password.resolve','app.pre_session_resolve_identity(uuid)'::regprocedure),
 ('00000000-0000-0000-0000-000000000109','integrator','$integrator_login','app_integrator_resolver','integrator','integrator.resolve','app.resolve_integrator_request(bigint,uuid)'::regprocedure);
INSERT INTO app.demo_context_records VALUES ('$org_a','tenant-a'),('$org_b','tenant-b');
INSERT INTO app.platform_context_records VALUES ('platform-only');
INSERT INTO app.service_context_records VALUES ('service-only');
INSERT INTO app.context_gate_probe VALUES ('gate-probe');
SQL

case "$fault" in
  forbidden_claim) psql_admin -c "CREATE OR REPLACE FUNCTION app.install_port_context(uuid,app.port_context_claims) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,app_ext,pg_temp AS \$\$ BEGIN INSERT INTO app_ext.accepted_port_contexts(database_oid,backend_pid,transaction_id,capability_id,session_login,port,target_role,context_class,purpose,function_identity,typed_args_hash) SELECT (SELECT oid FROM pg_database WHERE datname=current_database()),pg_backend_pid(),pg_current_xact_id(),capability_id,session_user,port,target_role,context_class,purpose,function_identity,decode('$h0','hex') FROM app_ext.port_context_capabilities WHERE capability_id=\$1; END \$\$; ALTER FUNCTION app.install_port_context(uuid,app.port_context_claims) OWNER TO app_seam_context_owner" ;;
  forbidden_tag) psql_admin -c "CREATE OR REPLACE FUNCTION app.hash_port_typed_args(app.port_typed_arg[]) RETURNS bytea LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS \$\$ SELECT decode('$h0','hex') \$\$" ;;
  wrong_function|wrong_purpose|wrong_hash|wrong_xid|wrong_backend|wrong_role) psql_admin -c "CREATE OR REPLACE FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS \$\$ SELECT true \$\$; ALTER FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure) OWNER TO app_seam_context_owner" ;;
  business_using_true) psql_admin -c 'ALTER POLICY tenant_business ON app.demo_context_records USING (true)' ;;
  dropped_restrictive_gate) psql_admin -c 'DROP POLICY gate_probe_context_gate ON app.context_gate_probe' ;;
  removed_force_rls) psql_admin -c 'ALTER TABLE app.demo_context_records NO FORCE ROW LEVEL SECURITY' ;;
  '') ;;
  *) fail "unknown PORTCTX_INJECT_FAULT=$fault" ;;
esac

# mTLS: valid exact CN + SCRAM works.  All connection negatives reject before SQL.
assert_eq "$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -Atc 'SELECT current_user')" "$staff_login"
assert_eq "$(psql_as "$patient_login" "$patient_password" "$cert_dir/patient.crt" "$cert_dir/patient.key" -Atc 'SELECT current_user')" "$patient_login"
assert_eq "$(psql_as "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" -Atc 'SELECT current_user')" "$integrator_login"
must_fail env PGPASSWORD="$staff_password" "$pg_bin/psql" -X "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login sslmode=require sslrootcert=$cert_dir/ca.crt" -c 'SELECT 1'
must_fail psql_as "$patient_login" "$patient_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'SELECT 1'
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/wrong-port.crt" "$cert_dir/wrong-port.key" -c 'SELECT 1'
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/expired.crt" "$cert_dir/expired.key" -c 'SELECT 1'
must_fail env PGPASSWORD="$staff_password" "$pg_bin/psql" -X "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login sslmode=disable" -c 'SELECT 1'
must_fail env PGPASSWORD="$staff_password" "$pg_bin/psql" -X -h "$data_dir" -d "$db_name" -U "$staff_login" -c 'SELECT 1'
must_fail env PGPASSWORD="$staff_password" PGSSLMODE=verify-full PGSSLROOTCERT="$cert_dir/other-ca.crt" PGSSLCERT="$cert_dir/staff-old.crt" PGSSLKEY="$cert_dir/staff-old.key" "$pg_bin/psql" -X -h 127.0.0.1 -p "$port" -d "$db_name" -U "$staff_login" -c 'SELECT 1'

# Direct login and bare SET ROLE are loud and do not reveal a managed row.
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'SELECT * FROM app.demo_context_records'
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'BEGIN; SET LOCAL ROLE app_staff; SELECT * FROM app.context_gate_probe; COMMIT'
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'BEGIN; SET LOCAL ROLE app_pre_session; SELECT app.pre_session_begin_password_login($$person@example.test$$); COMMIT'

run_direct() {
  local user=$1 password=$2 cert=$3 key=$4 cap=$5 role=$6 class=$7 purpose=$8 fn=$9 hash=${10} actor_sql=${11} subject_sql=${12} org_sql=${13} integrator_sql=${14} request_sql=${15} query=${16} expected=${17}
  local result
  result=$(psql_as "$user" "$password" "$cert" "$key" -qAt <<SQL
BEGIN;
RESET ROLE;
SELECT app.clear_port_context();
SELECT app.install_port_context('$cap'::uuid, ROW(1,'$class'::app.port_context_class,'$role'::name,'$purpose',$fn,$hash,$actor_sql,$subject_sql,$org_sql,$integrator_sql,$request_sql)::app.port_context_claims);
SET LOCAL ROLE $role;
$query
RESET ROLE;
SELECT app.clear_port_context();
COMMIT;
SQL
)
  assert_eq "$(printf '%s\n' "$result" | awk 'NF{last=$0} END{print last}')" "$expected"
}

# Representative positive contexts: each receives exactly its declared result.
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000101 app_staff staff relation 'NULL::regprocedure' "decode('$h0','hex')" "'$actor'::uuid" 'NULL::uuid' "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT string_agg(note,$$, $$ ORDER BY note) FROM app.demo_context_records;' tenant-a
run_direct "$patient_login" "$patient_password" "$cert_dir/patient.crt" "$cert_dir/patient.key" 00000000-0000-0000-0000-000000000102 app_patient patient relation 'NULL::regprocedure' "decode('$h0','hex')" "'$actor'::uuid" "'$subject'::uuid" "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT string_agg(note,$$, $$ ORDER BY note) FROM app.demo_context_records;' tenant-a
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000103 app_platform_settings platform relation 'NULL::regprocedure' "decode('$h0','hex')" "'$actor'::uuid" 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' 'SELECT note FROM app.platform_context_records;' platform-only
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000104 app_integrator_request integrator relation 'NULL::regprocedure' "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' "'$org_a'::uuid" '77::bigint' 'NULL::uuid' 'SELECT string_agg(note,$$, $$ ORDER BY note) FROM app.demo_context_records;' tenant-a
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000105 app_tenant_service tenant_service relation 'NULL::regprocedure' "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' "'$org_b'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT string_agg(note,$$, $$ ORDER BY note) FROM app.demo_context_records;' tenant-b
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000106 app_service service relation 'NULL::regprocedure' "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' 'SELECT note FROM app.service_context_records;' service-only

# Named roots carry the exact purpose, regprocedure and typed SQL arguments.
hash_begin=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('text@1',textsend('person@example.test'))::app.port_typed_arg]),'hex')")
hash_resolve=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('$actor'::uuid))::app.port_typed_arg]),'hex')")
hash_integrator_resolve=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('bigint@1',int8send(77::bigint))::app.port_typed_arg,ROW('uuid@1',uuid_send('$org_a'::uuid))::app.port_typed_arg]),'hex')")
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000107 app_pre_session pre_session auth.password.begin "'app.pre_session_begin_password_login(text)'::regprocedure" "decode('$hash_begin','hex')" 'NULL::uuid' 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' "'$request'::uuid" "SELECT app.pre_session_begin_password_login('person@example.test');" pre-session:person@example.test
opaque=$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -qAt <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
BEGIN; SELECT app.clear_port_context(); SELECT app.install_port_context('00000000-0000-0000-0000-000000000108',ROW(1,'pre_session','app_pre_session','auth.password.resolve','app.pre_session_resolve_identity(uuid)'::regprocedure,decode('$hash_resolve','hex'),NULL,NULL,NULL,NULL,'$request'::uuid)::app.port_context_claims); SET LOCAL ROLE app_pre_session; SELECT app.pre_session_resolve_identity('$actor'::uuid); RESET ROLE; SELECT app.clear_port_context(); COMMIT;
SQL
)
[[ "$opaque" =~ ^[0-9a-f-]{36}$ && "$opaque" != "$actor" ]] || fail 'variant A resolver did not return opaque id'
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000109 app_integrator_resolver integrator integrator.resolve "'app.resolve_integrator_request(bigint,uuid)'::regprocedure" "decode('$hash_integrator_resolve','hex')" 'NULL::uuid' 'NULL::uuid' "'$org_a'::uuid" '77::bigint' 'NULL::uuid' "SELECT app.resolve_integrator_request(77,'$org_a'::uuid);" "integrator:77:$org_a"

# Exact gates reject wrong function/purpose/hash/role and a reused (new xid) context.
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000107',ROW(1,'pre_session','app_pre_session','wrong.purpose','app.pre_session_begin_password_login(text)'::regprocedure,decode('$h0','hex'),NULL,NULL,NULL,NULL,'$request'::uuid)::app.port_context_claims);"
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000101',ROW(1,'staff','app_staff','relation',NULL,decode('$h0','hex'),NULL,NULL,'$org_a'::uuid,NULL,NULL)::app.port_context_claims);"
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000107',ROW(1,'pre_session','app_pre_session','auth.password.begin','app.pre_session_begin_password_login(text)'::regprocedure,decode('$h0','hex'),NULL,NULL,NULL,NULL,'$request'::uuid)::app.port_context_claims); SET LOCAL ROLE app_pre_session; SELECT app.pre_session_begin_password_login('other@example.test');"
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000101',ROW(1,'staff','app_staff','relation',NULL,decode('$h0','hex'),'$actor'::uuid,NULL,'$org_a'::uuid,NULL,NULL)::app.port_context_claims); SET LOCAL ROLE app_patient; SELECT * FROM app.demo_context_records;"
must_fail_state 42501 psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000101',ROW(1,'staff','app_staff','relation',NULL,decode('$h0','hex'),'$actor'::uuid,NULL,'$org_a'::uuid,NULL,NULL)::app.port_context_claims); COMMIT; BEGIN; SET LOCAL ROLE app_staff; SELECT * FROM app.context_gate_probe;"
must_fail_state 22023 psql_admin -c "SELECT app.hash_port_typed_args(ARRAY[ROW('unknown@1',decode('00','hex'))::app.port_typed_arg]);"

# All ten tags are framed by PostgreSQL 16 binary-send functions and agree with Node.
sql_hash=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('$org_a'::uuid)),ROW('oid@1',oidsend(42::oid)),ROW('integer@1',int4send(-2)),ROW('bigint@1',int8send(-2)),ROW('xid8@1',xid8send('9'::xid8)),ROW('boolean@1',boolsend(true)),ROW('text@1',textsend('тест')),ROW('name@1',namesend('name'::name)),ROW('bytea@1',byteasend(decode('00ff','hex'))),ROW('timestamptz@1',timestamptz_send('2000-01-01 00:00:00+00'::timestamptz))]::app.port_typed_arg[]),'hex')")
node_hash=$(node - <<'NODE'
const crypto=require('node:crypto'); const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b}; const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};
const a=[['uuid@1','00000000000000000000000000000001'],['oid@1','0000002a'],['integer@1','fffffffe'],['bigint@1','fffffffffffffffe'],['xid8@1','0000000000000009'],['boolean@1','01'],['text@1',Buffer.from('тест').toString('hex')],['name@1',Buffer.from('name').toString('hex')],['bytea@1','00ff'],['timestamptz@1','0000000000000000']]; const p=[Buffer.from('BCBPORTARGS\0'),u16(1),u16(a.length)]; a.forEach(([t,h],i)=>{const v=Buffer.from(h,'hex'),tag=Buffer.from(t);p.push(u16(i+1),u16(1),u16(tag.length),tag,u16(2),u32(v.length),v)}); process.stdout.write(crypto.createHash('sha256').update(Buffer.concat(p)).digest('hex'));
NODE
)
assert_eq "$sql_hash" "$node_hash"
assert_eq "$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),'hex')")" "$h0"
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_roles WHERE (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) AND rolname IN ('$staff_login','$patient_login','$integrator_login','app_staff','app_patient','app_object_owner','app_seam_context_owner')")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('$staff_login','$patient_login','$integrator_login') AND table_schema IN ('app','app_ext')")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE u.rolname IN ('$staff_login','$patient_login','$integrator_login') AND (m.inherit_option OR NOT m.set_option OR m.admin_option)")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_class WHERE relnamespace='app'::regnamespace AND relname IN ('demo_context_records','platform_context_records','service_context_records','context_gate_probe') AND NOT relforcerowsecurity")" 0

# Clear writes a retained closed row; pruning removes only rows older than 24h.
psql_admin -c "INSERT INTO app_ext.accepted_port_contexts(database_oid,backend_pid,transaction_id,capability_id,session_login,port,target_role,context_class,purpose,typed_args_hash,installed_at,cleared_at) VALUES ((SELECT oid FROM pg_database WHERE datname=current_database()),999999,'1'::xid8,'00000000-0000-0000-0000-000000000101','$staff_login','webapp','app_staff','staff','relation',decode('$h0','hex'),clock_timestamp()-interval '25 hours',clock_timestamp()-interval '25 hours')" >/dev/null
psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'BEGIN; SELECT app.clear_port_context(); COMMIT' >/dev/null
assert_eq "$(psql_admin -Atc 'SELECT count(*) FROM app_ext.accepted_port_contexts WHERE backend_pid=999999')" 0

# Rotation: old and new overlap, CRL reload rejects old reconnections, then drain
# is necessary to kill the already-authenticated backend; rotated cert remains good.
assert_eq "$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-rotated.crt" "$cert_dir/staff-rotated.key" -Atc 'SELECT current_user')" "$staff_login"
PGPASSWORD="$staff_password" "$pg_bin/psql" -X -v ON_ERROR_STOP=1 "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login application_name=portctx-old-survivor sslmode=verify-full sslrootcert=$cert_dir/ca.crt sslcert=$cert_dir/staff-old.crt sslkey=$cert_dir/staff-old.key" -Atc 'SELECT pg_sleep(30)' >/dev/null 2>&1 &
old_psql=$!
for _ in $(seq 1 30); do old_backend=$(psql_admin -Atc "SELECT pid FROM pg_stat_activity WHERE application_name='portctx-old-survivor'"); [[ -n "$old_backend" ]] && break; sleep 0.1; done
[[ -n "${old_backend:-}" ]] || fail 'old certificate backend did not survive long enough'
openssl ca -config "$cert_dir/ca.cnf" -revoke "$cert_dir/staff-old.crt" >/dev/null 2>&1
openssl ca -gencrl -config "$cert_dir/ca.cnf" -out "$cert_dir/ca.crl" >/dev/null 2>&1
psql_admin -c 'SELECT pg_reload_conf()' >/dev/null
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'SELECT 1'
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_stat_activity WHERE pid=$old_backend")" 1
psql_admin -c "SELECT pg_terminate_backend($old_backend)" >/dev/null
set +e; wait "$old_psql"; old_status=$?; set -e
[[ $old_status -ne 0 ]] || fail 'terminated old backend exited successfully'
assert_eq "$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-rotated.crt" "$cert_dir/staff-rotated.key" -Atc 'SELECT current_user')" "$staff_login"

grep -q 'accepted port context required' "$log_file" || fail '42501 denial absent from PostgreSQL server log'

if [[ "$single_mode" != --single && -z "$fault" ]]; then
  for injected in clientcert broad_hba forbidden_claim forbidden_tag wrong_function wrong_purpose wrong_hash wrong_xid wrong_backend wrong_role business_using_true dropped_restrictive_gate removed_force_rls; do
    if PORTCTX_INJECT_FAULT="$injected" "$0" --single >/dev/null 2>&1; then
      fail "fault injection survived: $injected"
    fi
  done
fi
echo "port-context acceptance: OK (PG16 disposable cluster cleaned: $work_dir)"
