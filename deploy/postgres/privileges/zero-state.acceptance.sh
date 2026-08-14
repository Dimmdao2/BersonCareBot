#!/usr/bin/env bash
# Behavioral acceptance for the owner-ordered revoke-only zero state.
# Uses an isolated PostgreSQL 16 cluster; DEV, TEST and the UI server are never contacted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
CLI="$SCRIPT_DIR/generate-cli.mjs"
GENERATED="$REPO_ROOT/deploy/postgres/generated"

ZERO_WORK="$(mktemp -d /tmp/bcb-zero-state-XXXXXX)"
ZERO_SOCKET="$(mktemp -d /tmp/bcb-zero-socket-XXXXXX)"
ZERO_PGDATA="$ZERO_WORK/pgdata"
ZERO_LOG="$ZERO_WORK/postgres.log"

cleanup() {
  "$PGBIN/pg_ctl" -D "$ZERO_PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ZERO_WORK" "$ZERO_SOCKET"
}
trap cleanup EXIT

psql_admin() { psql -X -h "$ZERO_SOCKET" -U postgres -v ON_ERROR_STOP=1 "$@"; }

"$PGBIN/initdb" -D "$ZERO_PGDATA" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
"$PGBIN/pg_ctl" -D "$ZERO_PGDATA" -l "$ZERO_LOG" -w start -o \
  "-k $ZERO_SOCKET -c listen_addresses='' -c log_min_error_statement=error" >/dev/null

node "$CLI" --all --zero-state --check
node "$CLI" --zero-state-cluster --check

psql_admin -d postgres <<'SQL'
CREATE ROLE app_owner NOLOGIN BYPASSRLS;
CREATE ROLE app_staff NOLOGIN;
CREATE ROLE bersoncarebot_test LOGIN;
CREATE ROLE bcb_webapp_dev_user LOGIN;
CREATE ROLE harmless_admin NOLOGIN;
GRANT app_owner TO bcb_webapp_dev_user;
CREATE DATABASE bersoncarebot_test OWNER bersoncarebot_test;
CREATE DATABASE bcb_webapp_dev OWNER bcb_webapp_dev_user;
SQL

for zero_db in bersoncarebot_test bcb_webapp_dev; do
  psql_admin -d "$zero_db" <<'SQL'
CREATE SCHEMA app AUTHORIZATION app_owner;
CREATE TYPE app.probe_kind AS ENUM ('one');
ALTER TYPE app.probe_kind OWNER TO app_owner;
CREATE TABLE public.probe (id integer, secret text);
ALTER TABLE public.probe OWNER TO app_owner;
INSERT INTO public.probe VALUES (1, 'secret');
CREATE POLICY allow_all ON public.probe USING (true) WITH CHECK (true);
GRANT SELECT ON public.probe TO PUBLIC;
GRANT UPDATE (secret) ON public.probe TO app_staff;
CREATE SEQUENCE app.probe_seq;
ALTER SEQUENCE app.probe_seq OWNER TO app_owner;
GRANT USAGE ON SEQUENCE app.probe_seq TO PUBLIC;
CREATE FUNCTION app.probe_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1';
ALTER FUNCTION app.probe_fn() OWNER TO app_owner;
GRANT EXECUTE ON FUNCTION app.probe_fn() TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO PUBLIC;
CREATE SCHEMA legacy_extra AUTHORIZATION harmless_admin;
CREATE TABLE legacy_extra.unknown_owner_probe(id integer);
ALTER TABLE legacy_extra.unknown_owner_probe OWNER TO harmless_admin;
CREATE TYPE legacy_extra.unknown_payload AS (value text);
ALTER TYPE legacy_extra.unknown_payload OWNER TO harmless_admin;
GRANT USAGE ON TYPE legacy_extra.unknown_payload TO PUBLIC;
CREATE COLLATION legacy_extra.unknown_collation (provider = libc, locale = 'C');
ALTER COLLATION legacy_extra.unknown_collation OWNER TO harmless_admin;
GRANT SELECT ON public.probe TO harmless_admin;
GRANT SELECT ON legacy_extra.unknown_owner_probe TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE harmless_admin GRANT SELECT ON TABLES TO PUBLIC;
SELECT lo_create(9001);
ALTER LARGE OBJECT 9001 OWNER TO app_owner;
GRANT SELECT ON LARGE OBJECT 9001 TO PUBLIC;
SQL
  if [[ "$zero_db" == bersoncarebot_test ]]; then
    extension_owner=bersoncarebot_test
  else
    extension_owner=bcb_webapp_dev_user
  fi
  psql_admin -d postgres -c "GRANT CREATE ON DATABASE \"$zero_db\" TO \"$extension_owner\";" >/dev/null
  psql_admin -d "$zero_db" -v extension_owner="$extension_owner" <<'SQL'
GRANT CREATE ON SCHEMA public TO :"extension_owner";
SET ROLE :"extension_owner";
CREATE EXTENSION pgcrypto;
RESET ROLE;
SQL
  psql_admin -d postgres -c "REVOKE CREATE ON DATABASE \"$zero_db\" FROM \"$extension_owner\";" >/dev/null
done

# The defect is reachable before zero state: an application login reads the row directly.
psql -X -h "$ZERO_SOCKET" -U bcb_webapp_dev_user -d bcb_webapp_dev -Atc \
  'SELECT secret FROM public.probe;' | grep -qx secret

for zero_db in bersoncarebot_test bcb_webapp_dev; do
  psql_admin -d "$zero_db" -1 -f "$GENERATED/zero-state.$zero_db.sql" >/dev/null
done

# The first pass must remove independent owner/ACL/default/policy/RLS faults without dropping data.
for zero_db in bersoncarebot_test bcb_webapp_dev; do
  psql_admin -d "$zero_db" -Atc \
    "SELECT (SELECT count(*) FROM public.probe) || ':' || pg_get_userbyid(relowner) || ':' || relrowsecurity || ':' || relforcerowsecurity
       FROM pg_class WHERE oid='public.probe'::regclass;" | grep -qx '1:postgres:true:true'
  psql_admin -d "$zero_db" -Atc \
    "SELECT count(*) FROM pg_policy WHERE polrelid='public.probe'::regclass;" | grep -qx 0
  psql_admin -d "$zero_db" -Atc \
    "SELECT pg_get_userbyid(nspowner) || ':' || pg_get_userbyid(relowner)
       FROM pg_namespace JOIN pg_class ON relnamespace=pg_namespace.oid
      WHERE nspname='legacy_extra' AND relname='unknown_owner_probe';" | grep -qx 'postgres:postgres'
  psql_admin -d "$zero_db" -Atc \
    "SELECT has_database_privilege('harmless_admin', current_database(), 'CONNECT') || ':' ||
            has_schema_privilege('harmless_admin', 'legacy_extra', 'USAGE') || ':' ||
            has_table_privilege('harmless_admin', 'legacy_extra.unknown_owner_probe', 'SELECT');" \
    | grep -qx 'false:false:false'
  psql_admin -d "$zero_db" -Atc \
    "SELECT pg_get_userbyid(type.typowner) || ':' ||
            (NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(type.typacl, acldefault('T', type.typowner))) acl WHERE acl.grantee=0)) || ':' ||
            pg_get_userbyid(object_collation.collowner) || ':' ||
            (SELECT pg_get_userbyid(extowner) FROM pg_extension WHERE extname='pgcrypto')
       FROM pg_type type
       JOIN pg_namespace namespace ON namespace.oid=type.typnamespace
       JOIN pg_collation object_collation ON object_collation.collnamespace=namespace.oid
      WHERE namespace.nspname='legacy_extra'
        AND type.typname='unknown_payload'
        AND object_collation.collname='unknown_collation';" | grep -qx 'postgres:true:postgres:postgres'
done

# Target-local zero revokes CONNECT before the cluster finalizer deletes shared
# login roles, and PostgreSQL logs the loud database-specific refusal.
set +e
psql -X -h "$ZERO_SOCKET" -U bcb_webapp_dev_user -d bcb_webapp_dev -Atc 'SELECT 1' \
  >"$ZERO_WORK/nologin.out" 2>&1
nologin_rc=$?
set -e
test "$nologin_rc" -ne 0
grep -Eq 'permission denied for database|нет доступа к базе данных' "$ZERO_WORK/nologin.out"
grep -Eq 'permission denied for database|нет доступа к базе данных' "$ZERO_LOG"

# Inject nine independent fault classes; a second run must repair every one and keep the row.
psql_admin -d bcb_webapp_dev <<'SQL'
ALTER TABLE public.probe OWNER TO app_owner;
ALTER TABLE public.probe DISABLE ROW LEVEL SECURITY;
CREATE POLICY rogue_allow ON public.probe USING (true);
GRANT SELECT ON public.probe TO PUBLIC;
GRANT UPDATE (secret) ON public.probe TO app_staff;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO PUBLIC;
GRANT app_owner TO harmless_admin;
ALTER TYPE legacy_extra.unknown_payload OWNER TO harmless_admin;
GRANT USAGE ON TYPE legacy_extra.unknown_payload TO PUBLIC;
ALTER COLLATION legacy_extra.unknown_collation OWNER TO harmless_admin;
DROP EXTENSION pgcrypto;
GRANT CREATE ON DATABASE bcb_webapp_dev TO bcb_webapp_dev_user;
GRANT CREATE ON SCHEMA public TO bcb_webapp_dev_user;
SET ROLE bcb_webapp_dev_user;
CREATE EXTENSION pgcrypto WITH SCHEMA public;
RESET ROLE;
REVOKE CREATE ON DATABASE bcb_webapp_dev FROM bcb_webapp_dev_user;
SQL
psql_admin -d bcb_webapp_dev -1 -f "$GENERATED/zero-state.bcb_webapp_dev.sql" >/dev/null
psql_admin -d bcb_webapp_dev -Atc \
  "SELECT (SELECT count(*) FROM public.probe) || ':' || pg_get_userbyid(relowner) || ':' || relrowsecurity || ':' || relforcerowsecurity
     FROM pg_class WHERE oid='public.probe'::regclass;" | grep -qx '1:postgres:true:true'
# Role membership is cluster-wide, so the target-local pass must leave it for
# the finalizer after every target database has reached zero.
psql_admin -d postgres -Atc \
  "SELECT count(*) FROM pg_auth_members WHERE roleid='app_owner'::regrole OR member='app_owner'::regrole;" \
  | grep -qx 2
psql_admin -d bcb_webapp_dev -Atc \
  "SELECT pg_get_userbyid(type.typowner) || ':' ||
          (NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(type.typacl, acldefault('T', type.typowner))) acl WHERE acl.grantee=0)) || ':' ||
          pg_get_userbyid(object_collation.collowner) || ':' ||
          (SELECT pg_get_userbyid(extowner) FROM pg_extension WHERE extname='pgcrypto')
     FROM pg_type type
     JOIN pg_namespace namespace ON namespace.oid=type.typnamespace
     JOIN pg_collation object_collation ON object_collation.collnamespace=namespace.oid
    WHERE namespace.nspname='legacy_extra'
      AND type.typname='unknown_payload'
      AND object_collation.collname='unknown_collation';" | grep -qx 'postgres:true:postgres:postgres'

# A statement appended after the zero verifier must roll the whole psql -1 application back.
cp "$GENERATED/zero-state.bcb_webapp_dev.sql" "$ZERO_WORK/atomic.sql"
printf '%s\n' 'GRANT SELECT ON public.probe TO PUBLIC;' \
  'SELECT * FROM public.zero_state_table_that_does_not_exist;' >>"$ZERO_WORK/atomic.sql"
set +e
psql_admin -d bcb_webapp_dev -1 -f "$ZERO_WORK/atomic.sql" >"$ZERO_WORK/atomic.out" 2>&1
atomic_rc=$?
set -e
test "$atomic_rc" -ne 0
psql_admin -d bcb_webapp_dev -Atc \
  "SELECT has_table_privilege('public', 'public.probe', 'SELECT');" | grep -qx f

# Shared role cleanup is target-neutral: it retains a role while any third
# database still depends on it, then removes it after all target-local zero and
# login cleanup passes have made that role globally disposable.
psql_admin -d postgres -c 'CREATE DATABASE zero_state_dependency_probe OWNER postgres' >/dev/null
psql_admin -d zero_state_dependency_probe -c 'CREATE TABLE public.blocker(id integer); ALTER TABLE public.blocker OWNER TO app_owner;' >/dev/null
psql_admin -d postgres -1 -f "$GENERATED/zero-state.cluster.sql" >"$ZERO_WORK/cluster-retained.out" 2>&1
grep -Eq 'legacy role app_owner retained' "$ZERO_WORK/cluster-retained.out"
psql_admin -d postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolname='app_owner';" | grep -qx 1
psql_admin -d postgres -c 'DROP DATABASE zero_state_dependency_probe;' >/dev/null

node "$CLI" --env dev --db bcb_webapp_dev --target-login-cleanup >"$ZERO_WORK/dev-login-cleanup.sql"
node "$CLI" --env test --db bersoncarebot_test --target-login-cleanup >"$ZERO_WORK/test-login-cleanup.sql"
psql_admin -d postgres -1 -f "$ZERO_WORK/dev-login-cleanup.sql" >/dev/null
psql_admin -d postgres -1 -f "$ZERO_WORK/test-login-cleanup.sql" >/dev/null
psql_admin -d postgres -1 -f "$GENERATED/zero-state.cluster.sql" >/dev/null
psql_admin -d postgres -Atc \
  "SELECT count(*) FROM pg_roles WHERE rolname IN ('app_owner','bersoncarebot_test','bcb_webapp_dev_user');" \
  | grep -qx 0
psql_admin -d postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolname='app_staff';" | grep -qx 1
psql_admin -d postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolname='harmless_admin';" | grep -qx 1

set +e
psql -X -h "$ZERO_SOCKET" -U bcb_webapp_dev_user -d bcb_webapp_dev -Atc 'SELECT 1' \
  >"$ZERO_WORK/dropped-login.out" 2>&1
dropped_rc=$?
set -e
test "$dropped_rc" -ne 0
grep -Eq 'does not exist|не существует' "$ZERO_WORK/dropped-login.out"
grep -Eq 'does not exist|не существует' "$ZERO_LOG"

echo 'zero-state acceptance: PASS (ACL/owner/default/policy/RLS repair, atomicity, cross-DB role-drop gate, loud target CONNECT refusal)'
