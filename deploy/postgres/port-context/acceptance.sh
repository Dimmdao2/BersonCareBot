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
integrator_external=00000000-0000-0000-0000-000000000040
integrator_cross_external=00000000-0000-0000-0000-000000000041

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
fault_detected() {
  local mechanism=$1 result=$2
  printf 'FAULT\t%s\tinjected=yes\tmechanism=%s\tresult=%s\n' "$fault" "$mechanism" "$result"
  exit 1
}

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
 ('00000000-0000-0000-0000-000000000109','integrator','$integrator_login','app_integrator_resolver','integrator','integrator.resolve','app.resolve_integrator_request(uuid)'::regprocedure),
 ('00000000-0000-0000-0000-000000000110','webapp','$staff_login','app_staff','staff','named.staff','app.named_staff_root()'::regprocedure),
 ('00000000-0000-0000-0000-000000000111','webapp','$patient_login','app_patient','patient','named.patient','app.named_patient_root()'::regprocedure),
 ('00000000-0000-0000-0000-000000000112','webapp','$staff_login','app_platform_settings','platform','named.platform','app.named_platform_root()'::regprocedure),
 ('00000000-0000-0000-0000-000000000113','integrator','$integrator_login','app_tenant_service','tenant_service','named.tenant-service','app.named_tenant_service_root()'::regprocedure),
 ('00000000-0000-0000-0000-000000000114','integrator','$integrator_login','app_service','service','named.service','app.named_service_root()'::regprocedure);
INSERT INTO app.demo_context_records VALUES ('$org_a','tenant-a'),('$org_b','tenant-b');
INSERT INTO app.platform_context_records VALUES ('platform-only');
INSERT INTO app.service_context_records VALUES ('service-only');
INSERT INTO app.context_gate_probe VALUES ('gate-probe');
INSERT INTO app_ext.integrator_external_identities VALUES
 ('$integrator_external',77,'$org_a'),('$integrator_cross_external',77,'$org_b');
INSERT INTO app_ext.integrator_user_organizations VALUES (77,'$org_a',true),(77,'$org_b',false);
SQL

case "$fault" in
  clientcert|broad_hba) ;;
  forbidden_claim) psql_admin -c "CREATE OR REPLACE FUNCTION app.install_port_context(p_capability_id uuid,p_claims app.port_context_claims) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,app_ext,pg_temp AS \$\$ BEGIN -- fault_forbidden_claim
    INSERT INTO app_ext.accepted_port_contexts(database_oid,backend_pid,transaction_id,capability_id,session_login,port,target_role,context_class,purpose,function_identity,typed_args_hash)
    SELECT (SELECT oid FROM pg_database WHERE datname=current_database()),pg_backend_pid(),pg_current_xact_id(),capability_id,session_user,port,target_role,context_class,purpose,function_identity,decode('$h0','hex') FROM app_ext.port_context_capabilities WHERE capability_id=p_capability_id;
  END \$\$; ALTER FUNCTION app.install_port_context(uuid,app.port_context_claims) OWNER TO app_seam_context_owner" ;;
  forbidden_tag) psql_admin -c "CREATE OR REPLACE FUNCTION app.hash_port_typed_args(p_args app.port_typed_arg[]) RETURNS bytea LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS \$\$ BEGIN -- fault_forbidden_tag
    RETURN decode('$h0','hex'); END \$\$; ALTER FUNCTION app.hash_port_typed_args(app.port_typed_arg[]) OWNER TO app_object_owner" ;;
  wrong_function|wrong_purpose|wrong_hash|wrong_xid|wrong_backend|wrong_role) psql_admin -c "CREATE OR REPLACE FUNCTION app.require_accepted_context(p_effective_role name,p_target_role name,p_context_class app.port_context_class,p_purpose text,p_typed_args_hash bytea,p_function_identity regprocedure) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,app,app_ext,pg_temp AS \$\$ BEGIN -- fault_${fault}
    RETURN true; END \$\$; ALTER FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure) OWNER TO app_seam_context_owner" ;;
  business_using_true) psql_admin -c 'ALTER POLICY tenant_business ON app.demo_context_records USING (true)' ;;
  dropped_restrictive_gate) psql_admin -c 'DROP POLICY gate_probe_context_gate ON app.context_gate_probe' ;;
  removed_force_rls) psql_admin -c 'ALTER TABLE app.demo_context_records NO FORCE ROW LEVEL SECURITY' ;;
  '') ;;
  *) fail "unknown PORTCTX_INJECT_FAULT=$fault" ;;
esac

if [[ -n "$fault" ]]; then
  case "$fault" in
    clientcert)
      grep -q 'hostssl .*scram-sha-256$' "$data_dir/pg_hba.conf" || fail 'clientcert fault did not alter HBA mechanism'
      assert_eq "$(env PGPASSWORD="$staff_password" "$pg_bin/psql" -X "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login sslmode=require sslrootcert=$cert_dir/ca.crt" -Atc 'SELECT current_user')" "$staff_login"
      fault_detected hba_clientcert_removed auth_without_certificate_succeeded
      ;;
    broad_hba)
      grep -q "hostssl $db_name all 0.0.0.0/0 trust" "$data_dir/pg_hba.conf" || fail 'broad_hba fault did not alter HBA mechanism'
      assert_eq "$(env PGPASSWORD=ignored "$pg_bin/psql" -X "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login sslmode=require" -Atc 'SELECT current_user')" "$staff_login"
      fault_detected hba_broad_trust_inserted auth_without_certificate_and_password_succeeded
      ;;
    forbidden_claim)
      psql_admin -Atc "SELECT pg_get_functiondef('app.install_port_context(uuid,app.port_context_claims)'::regprocedure)" | grep -q fault_forbidden_claim || fail 'forbidden_claim injection did not replace installer'
      psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000101',ROW(1,'staff','app_staff','relation',NULL,decode('$h0','hex'),NULL,NULL,'$org_a'::uuid,NULL,NULL)::app.port_context_claims);" >/dev/null
      fault_detected class_claim_validation_removed invalid_staff_claim_installed
      ;;
    forbidden_tag)
      psql_admin -Atc "SELECT pg_get_functiondef('app.hash_port_typed_args(app.port_typed_arg[])'::regprocedure)" | grep -q fault_forbidden_tag || fail 'forbidden_tag injection did not replace hash helper'
      assert_eq "$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('unknown@1',decode('00','hex'))::app.port_typed_arg]),'hex')")" "$h0"
      fault_detected typed_tag_validation_removed unknown_tag_hashed
      ;;
    wrong_function|wrong_purpose|wrong_hash|wrong_xid|wrong_backend|wrong_role)
      psql_admin -Atc "SELECT pg_get_functiondef('app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)'::regprocedure)" | grep -q "fault_${fault}" || fail "$fault injection did not replace gate"
      assert_eq "$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -Atc "BEGIN; SET LOCAL ROLE app_staff; SELECT app.require_accepted_context('app_staff','app_patient','patient','wrong.purpose',decode('$h0','hex'),NULL::regprocedure); ROLLBACK;" | awk '/^t$/{value=$0} END{print value}')" t
      fault_detected "gate_${fault}_removed" context_mismatch_accepted
      ;;
    business_using_true)
      assert_eq "$(psql_admin -Atc "SELECT polqual IS NOT NULL AND pg_get_expr(polqual,polrelid)='true' FROM pg_policy WHERE polname='tenant_business'")" t
      fault_detected tenant_business_predicate_removed cross_tenant_visibility_would_be_allowed
      ;;
    dropped_restrictive_gate)
      assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_policy WHERE polname='gate_probe_context_gate'")" 0
      fault_detected restrictive_gate_dropped no_context_gate_removed
      ;;
    removed_force_rls)
      assert_eq "$(psql_admin -Atc "SELECT relforcerowsecurity FROM pg_class WHERE oid='app.demo_context_records'::regclass")" f
      fault_detected force_rls_removed owner_bypass_enabled
      ;;
  esac
fi

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

# Variant A maps physical IDs only in the pre-session identity seam.  The
# following business transactions receive those opaque values, never physical
# IDs, and the public accessors resolve them privately for current RLS callers.
resolve_opaque() {
  local physical_id=$1 hash result
  hash=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('$physical_id'::uuid))::app.port_typed_arg]),'hex')")
  result=$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -qAt <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
BEGIN;
SELECT app.clear_port_context();
SELECT app.install_port_context('00000000-0000-0000-0000-000000000108',ROW(1,'pre_session','app_pre_session','auth.password.resolve','app.pre_session_resolve_identity(uuid)'::regprocedure,decode('$hash','hex'),NULL,NULL,NULL,NULL,'$request'::uuid)::app.port_context_claims);
SET LOCAL ROLE app_pre_session;
SELECT app.pre_session_resolve_identity('$physical_id'::uuid);
RESET ROLE;
SELECT app.clear_port_context();
COMMIT;
SQL
)
  [[ "$result" =~ ^[0-9a-f-]{36}$ && "$result" != "$physical_id" ]] || fail "variant A resolver did not return opaque id for $physical_id"
  printf '%s\n' "$result"
}

opaque_actor=$(resolve_opaque "$actor")
opaque_subject=$(resolve_opaque "$subject")

# Representative positive contexts: each receives exactly its declared result.
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000101 app_staff staff relation 'NULL::regprocedure' "decode('$h0','hex')" "'$opaque_actor'::uuid" 'NULL::uuid' "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' "SELECT app.current_actor_user_id()::text || ':' || (SELECT string_agg(note, ', ' ORDER BY note) FROM app.demo_context_records);" "$actor:tenant-a"
run_direct "$patient_login" "$patient_password" "$cert_dir/patient.crt" "$cert_dir/patient.key" 00000000-0000-0000-0000-000000000102 app_patient patient relation 'NULL::regprocedure' "decode('$h0','hex')" "'$opaque_actor'::uuid" "'$opaque_subject'::uuid" "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' "SELECT app.current_actor_user_id()::text || ':' || app.current_patient_user_id()::text || ':' || (SELECT string_agg(note, ', ' ORDER BY note) FROM app.demo_context_records);" "$actor:$subject:tenant-a"
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000103 app_platform_settings platform relation 'NULL::regprocedure' "decode('$h0','hex')" "'$opaque_actor'::uuid" 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' 'SELECT note FROM app.platform_context_records;' platform-only
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000104 app_integrator_request integrator relation 'NULL::regprocedure' "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' "'$org_a'::uuid" '77::bigint' 'NULL::uuid' 'SELECT string_agg(note,$$, $$ ORDER BY note) FROM app.demo_context_records;' tenant-a
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000105 app_tenant_service tenant_service relation 'NULL::regprocedure' "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' "'$org_b'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT string_agg(note,$$, $$ ORDER BY note) FROM app.demo_context_records;' tenant-b
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000106 app_service service relation 'NULL::regprocedure' "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' 'SELECT note FROM app.service_context_records;' service-only

# Exact named roots are positive controls for every declared runtime class.
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000110 app_staff staff named.staff "'app.named_staff_root()'::regprocedure" "decode('$h0','hex')" "'$opaque_actor'::uuid" 'NULL::uuid' "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT app.named_staff_root();' named-staff
run_direct "$patient_login" "$patient_password" "$cert_dir/patient.crt" "$cert_dir/patient.key" 00000000-0000-0000-0000-000000000111 app_patient patient named.patient "'app.named_patient_root()'::regprocedure" "decode('$h0','hex')" "'$opaque_actor'::uuid" "'$opaque_subject'::uuid" "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT app.named_patient_root();' named-patient
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000112 app_platform_settings platform named.platform "'app.named_platform_root()'::regprocedure" "decode('$h0','hex')" "'$opaque_actor'::uuid" 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' 'SELECT app.named_platform_root();' named-platform
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000113 app_tenant_service tenant_service named.tenant-service "'app.named_tenant_service_root()'::regprocedure" "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' "'$org_a'::uuid" 'NULL::bigint' 'NULL::uuid' 'SELECT app.named_tenant_service_root();' named-tenant-service
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000114 app_service service named.service "'app.named_service_root()'::regprocedure" "decode('$h0','hex')" 'NULL::uuid' 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' 'SELECT app.named_service_root();' named-service

# Named roots carry the exact purpose, regprocedure and typed SQL arguments.
hash_begin=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('text@1',textsend('person@example.test'))::app.port_typed_arg]),'hex')")
hash_integrator_resolve=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('$integrator_external'::uuid))::app.port_typed_arg]),'hex')")
run_direct "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" 00000000-0000-0000-0000-000000000107 app_pre_session pre_session auth.password.begin "'app.pre_session_begin_password_login(text)'::regprocedure" "decode('$hash_begin','hex')" 'NULL::uuid' 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' "'$request'::uuid" "SELECT app.pre_session_begin_password_login('person@example.test');" pre-session:person@example.test
run_direct "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" 00000000-0000-0000-0000-000000000109 app_integrator_resolver integrator integrator.resolve "'app.resolve_integrator_request(uuid)'::regprocedure" "decode('$hash_integrator_resolve','hex')" 'NULL::uuid' 'NULL::uuid' 'NULL::uuid' 'NULL::bigint' 'NULL::uuid' "SELECT app.resolve_integrator_request('$integrator_external'::uuid);" "integrator:77:$org_a"
hash_integrator_unknown=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('00000000-0000-0000-0000-000000000042'::uuid))::app.port_typed_arg]),'hex')")
hash_integrator_cross=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1',uuid_send('$integrator_cross_external'::uuid))::app.port_typed_arg]),'hex')")
must_fail_state 42501 psql_as "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000109',ROW(1,'integrator','app_integrator_resolver','integrator.resolve','app.resolve_integrator_request(uuid)'::regprocedure,decode('$hash_integrator_unknown','hex'),NULL,NULL,NULL,NULL,NULL)::app.port_context_claims); SET LOCAL ROLE app_integrator_resolver; SELECT app.resolve_integrator_request('00000000-0000-0000-0000-000000000042'::uuid);"
must_fail_state 42501 psql_as "$integrator_login" "$integrator_password" "$cert_dir/integrator.crt" "$cert_dir/integrator.key" -c "BEGIN; SELECT app.install_port_context('00000000-0000-0000-0000-000000000109',ROW(1,'integrator','app_integrator_resolver','integrator.resolve','app.resolve_integrator_request(uuid)'::regprocedure,decode('$hash_integrator_cross','hex'),NULL,NULL,NULL,NULL,NULL)::app.port_context_claims); SET LOCAL ROLE app_integrator_resolver; SELECT app.resolve_integrator_request('$integrator_cross_external'::uuid);"

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
# Independent PG16 catalog checks: expected owners and ACLs are asserted in
# both directions, while login principals remain unable to call the gate.
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_type WHERE typnamespace='app'::regnamespace AND typname IN ('port_name','port_context_class','port_typed_arg','port_context_claims') AND typowner <> 'app_object_owner'::regrole")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_proc WHERE oid='app.hash_port_typed_args(app.port_typed_arg[])'::regprocedure AND proowner <> 'app_object_owner'::regrole")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_proc WHERE oid IN ('app.install_port_context(uuid,app.port_context_claims)'::regprocedure,'app.clear_port_context()'::regprocedure,'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)'::regprocedure,'app.current_org_id()'::regprocedure,'app.current_actor_user_id()'::regprocedure,'app.current_patient_user_id()'::regprocedure,'app.current_integrator_user_id()'::regprocedure) AND proowner <> 'app_seam_context_owner'::regrole")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_proc WHERE oid IN ('app_ext.resolve_variant_a_identity(uuid)'::regprocedure,'app_ext.resolve_variant_a_physical(uuid)'::regprocedure,'app.resolve_integrator_request(uuid)'::regprocedure) AND proowner <> 'app_seam_identity_lookup_owner'::regrole")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_roles WHERE (rolname LIKE 'app_seam_%_owner' OR rolname IN ('app_pre_session','app_staff','app_patient','app_clinic_billing','app_platform_settings','app_worker','app_operational_media_worker','saas_telemetry_operator','app_integrator_request','app_integrator_resolver','app_operational_delivery_worker','app_operational_scheduler','app_tenant_service','app_service')) AND NOT has_schema_privilege(oid,'app','USAGE')")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM aclexplode((SELECT nspacl FROM pg_namespace WHERE nspname='app')) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='USAGE' AND COALESCE(r.rolname,'PUBLIC') NOT IN ('$staff_login','$patient_login','$integrator_login','app_object_owner','app_pre_session','app_staff','app_patient','app_clinic_billing','app_platform_settings','app_worker','app_operational_media_worker','saas_telemetry_operator','app_integrator_request','app_integrator_resolver','app_operational_delivery_worker','app_operational_scheduler','app_tenant_service','app_service','app_seam_context_owner','app_seam_password_auth_owner','app_seam_email_otp_owner','app_seam_passkey_owner','app_seam_phone_binding_owner','app_seam_self_security_owner','app_seam_identity_lookup_owner','app_seam_patient_invite_owner','app_seam_org_invite_owner','app_seam_specialist_provision_owner','app_seam_public_slug_owner','app_seam_public_booking_owner','app_seam_dedicated_bot_owner','app_seam_payment_webhook_owner','app_seam_delivery_scope_owner','app_seam_patient_program_resolver_owner','app_seam_settings_preauth_owner','app_seam_settings_integrator_owner','app_seam_settings_runtime_owner','app_seam_org_commerce_owner','app_seam_patient_org_projection_owner','app_seam_patient_booking_owner','app_seam_patient_self_actions_owner','app_seam_reminder_patient_owner','app_seam_reminder_materialization_owner','app_seam_reminder_specialist_owner','app_seam_reminder_appointment_owner','app_seam_reminder_email_cooldown_owner','app_seam_telemetry_patient_owner','app_seam_telemetry_media_owner','app_seam_telemetry_operator_owner','app_seam_catalog_public_owner','app_seam_catalog_admin_owner','app_seam_org_directory_owner','app_seam_telemetry_exclusion_owner','saas_telemetry_owner','saas_system_health_owner','app_seam_login_token_owner','app_seam_oauth_owner','app_seam_phone_otp_owner','app_seam_staff_security_owner','app_seam_patient_lfk_media_owner')")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_roles WHERE rolname IN ('$staff_login','$patient_login','$integrator_login') AND has_function_privilege(oid,'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)','EXECUTE')")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_roles WHERE rolname IN ('app_pre_session','app_staff','app_patient','app_clinic_billing','app_platform_settings','app_worker','app_operational_media_worker','saas_telemetry_operator','app_integrator_request','app_integrator_resolver','app_operational_delivery_worker','app_operational_scheduler','app_tenant_service','app_service') AND NOT has_function_privilege(oid,'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)','EXECUTE')")" 0
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid='app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)'::regprocedure)) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND COALESCE(r.rolname,'PUBLIC') IN ('PUBLIC','$staff_login','$patient_login','$integrator_login')")" 0

# Clear writes a retained closed row; pruning removes only rows older than 24h.
psql_admin -c "INSERT INTO app_ext.accepted_port_contexts(database_oid,backend_pid,transaction_id,capability_id,session_login,port,target_role,context_class,purpose,typed_args_hash,installed_at,cleared_at) VALUES ((SELECT oid FROM pg_database WHERE datname=current_database()),999999,'1'::xid8,'00000000-0000-0000-0000-000000000101','$staff_login','webapp','app_staff','staff','relation',decode('$h0','hex'),clock_timestamp()-interval '25 hours',clock_timestamp()-interval '25 hours')" >/dev/null
psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'BEGIN; SELECT app.clear_port_context(); COMMIT' >/dev/null
assert_eq "$(psql_admin -Atc 'SELECT count(*) FROM app_ext.accepted_port_contexts WHERE backend_pid=999999')" 0

# Rotation: old and new overlap, CRL reload rejects old reconnections, then a
# catalog drain terminates *every* backend authenticated as the retired login.
# PoolConfig/env overlap and process pool restart are intentionally outside this
# disposable SQL lane and are reported in the final residual line.
assert_eq "$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-rotated.crt" "$cert_dir/staff-rotated.key" -Atc 'SELECT current_user')" "$staff_login"
old_pids=()
for old_index in 1 2; do
  PGPASSWORD="$staff_password" "$pg_bin/psql" -X -v ON_ERROR_STOP=1 "host=127.0.0.1 port=$port dbname=$db_name user=$staff_login application_name=portctx-old-survivor-$old_index sslmode=verify-full sslrootcert=$cert_dir/ca.crt sslcert=$cert_dir/staff-old.crt sslkey=$cert_dir/staff-old.key" -Atc 'SELECT pg_sleep(30)' >/dev/null 2>&1 &
  old_pids+=("$!")
done
for _ in $(seq 1 30); do old_backend_count=$(psql_admin -Atc "SELECT count(*) FROM pg_stat_activity WHERE usename='$staff_login' AND datname='$db_name'"); [[ "$old_backend_count" == 2 ]] && break; sleep 0.1; done
assert_eq "${old_backend_count:-0}" 2
openssl ca -config "$cert_dir/ca.cnf" -revoke "$cert_dir/staff-old.crt" >/dev/null 2>&1
openssl ca -gencrl -config "$cert_dir/ca.cnf" -out "$cert_dir/ca.crl" >/dev/null 2>&1
psql_admin -c 'SELECT pg_reload_conf()' >/dev/null
must_fail psql_as "$staff_login" "$staff_password" "$cert_dir/staff-old.crt" "$cert_dir/staff-old.key" -c 'SELECT 1'
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_stat_activity WHERE usename='$staff_login' AND datname='$db_name'")" 2
assert_eq "$(psql_admin -Atc "SELECT bool_and(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE usename='$staff_login' AND datname='$db_name'")" t
for old_psql in "${old_pids[@]}"; do
  set +e; wait "$old_psql"; old_status=$?; set -e
  [[ $old_status -ne 0 ]] || fail 'terminated old backend exited successfully'
done
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM pg_stat_activity WHERE usename='$staff_login' AND datname='$db_name'")" 0
assert_eq "$(psql_as "$staff_login" "$staff_password" "$cert_dir/staff-rotated.crt" "$cert_dir/staff-rotated.key" -Atc 'SELECT current_user')" "$staff_login"

grep -q 'accepted port context required' "$log_file" || fail '42501 denial absent from PostgreSQL server log'

if [[ "$single_mode" != --single && -z "$fault" ]]; then
  printf 'FAULT\tinjected\tmechanism\texpected_error_or_result\n'
  faults=(clientcert broad_hba forbidden_claim forbidden_tag wrong_function wrong_purpose wrong_hash wrong_xid wrong_backend wrong_role business_using_true dropped_restrictive_gate removed_force_rls)
  for batch_start in 0 3 6 9 12; do
    batch_pids=()
    batch_faults=()
    for batch_index in 0 1 2; do
      fault_index=$((batch_start + batch_index))
      [[ $fault_index -lt ${#faults[@]} ]] || continue
      injected=${faults[$fault_index]}
      mutation_log="$work_dir/mutation.${injected}.log"
      PORTCTX_INJECT_FAULT="$injected" "$0" --single >"$mutation_log" 2>&1 &
      batch_pids+=("$!")
      batch_faults+=("$injected")
    done
    for batch_index in "${!batch_pids[@]}"; do
      injected=${batch_faults[$batch_index]}
      mutation_log="$work_dir/mutation.${injected}.log"
      if wait "${batch_pids[$batch_index]}"; then
        fail "fault injection survived: $injected"
      fi
      mutation_evidence=$(rg '^FAULT' "$mutation_log" | tail -1 || true)
      [[ -n "$mutation_evidence" ]] || fail "fault injection harness failure ($injected): no injected mechanism evidence; $(tail -3 "$mutation_log" | tr '\n' ' ')"
      printf '%s\n' "$mutation_evidence"
    done
  done
fi
echo "port-context acceptance: OK (PG16 disposable cluster cleaned: $work_dir; residual: application PoolConfig/env overlap and pool restart are runtime/deploy-lane controls, not disposable SQL acceptance)"
