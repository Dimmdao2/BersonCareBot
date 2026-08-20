#!/usr/bin/env bash
# Recreate the one canonical TEST database from a protected custom-format dump.
# This script is an internal primitive of deploy-test-full-reset.sh, not a public deploy entrypoint.
set -euo pipefail

DB=bersoncarebot_test
# Ordinary restored objects land on app_object_owner — the shared, cluster-wide, NOLOGIN object-owner
# role that deploy-test.sh/deploy-dev already provision via `generate-cli.mjs --shared-role-baseline`
# (deploy/postgres/privileges/generate.mjs). This script does not create or alter that role: doing so
# here would duplicate the declarative role chokepoint and could silently drift from it.
RESTORE_ROLE=app_object_owner
DUMP="${1:-}"

fail(){ echo "FATAL: restore-test-db-from-dump: $*" >&2; exit 1; }

[ "$(id -un)" = postgres ] || fail "must run as OS user postgres"
[ -n "$DUMP" ] || fail "usage: $0 /absolute/path/to/custom.dump"
[[ "$DUMP" = /* ]] || fail "dump path must be absolute"
[ -f "$DUMP" ] && [ ! -L "$DUMP" ] && [ -r "$DUMP" ] || fail "dump must be a readable regular non-symlink file"
pg_restore --list "$DUMP" >/dev/null || fail "dump is not a readable PostgreSQL custom archive"

close_target(){
  psql -X -d postgres -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"$DB\" CONNECTION LIMIT 0;
     SELECT pg_terminate_backend(pid)
       FROM pg_catalog.pg_stat_activity
      WHERE datname='$DB' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
}

restore_failed=1
cleanup(){
  if [ "$restore_failed" = 1 ]; then close_target; fi
}
trap cleanup EXIT

restore_role_state="$(psql -X -d postgres -Atqc \
  "SELECT rolsuper::text || '|' || rolcreatedb::text || '|' || rolcreaterole::text || '|' ||
          rolcanlogin::text || '|' || rolbypassrls::text
     FROM pg_catalog.pg_roles WHERE rolname='$RESTORE_ROLE';")"
[ "$restore_role_state" = "false|false|false|false|false" ] ||
  fail "$RESTORE_ROLE is missing or not the stationary shared object owner; run generate-cli.mjs --shared-role-baseline first"

psql -X -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid)
     FROM pg_catalog.pg_stat_activity
    WHERE datname='$DB' AND pid<>pg_backend_pid();" >/dev/null
dropdb --if-exists "$DB"
createdb --owner=postgres --template=template0 "$DB"

psql -X -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --no-comments \
  --role="$RESTORE_ROLE" \
  --dbname="$DB" \
  "$DUMP"

database_owner="$(psql -X -d postgres -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname='$DB'")"
platform_users_owner="$(psql -X -d "$DB" -Atqc "SELECT tableowner FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename='platform_users'")"
[ "$database_owner" = postgres ] || fail "database owner is $database_owner, expected postgres"
[ "$platform_users_owner" = "$RESTORE_ROLE" ] || fail "platform_users owner is $platform_users_owner, expected $RESTORE_ROLE"

platform_users="$(psql -X -d "$DB" -Atqc 'SELECT count(*) FROM public.platform_users')"
# integrator.identities was retired with the pre-B0 schema; integrator.schema_migrations is the
# integrator ledger table and is the current always-present proxy for "the integrator schema
# restored with its own migration history", the same role identities played before.
integrator_schema_migrations="$(psql -X -d "$DB" -Atqc 'SELECT count(*) FROM integrator.schema_migrations')"
public_tables="$(psql -X -d "$DB" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
[[ "$platform_users" =~ ^[1-9][0-9]*$ ]] || fail "platform_users restore sanity failed"
[[ "$integrator_schema_migrations" =~ ^[1-9][0-9]*$ ]] || fail "integrator.schema_migrations restore sanity failed"
[[ "$public_tables" =~ ^[1-9][0-9]*$ ]] || fail "public table restore sanity failed"

psql -X -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$DB\" CONNECTION LIMIT -1;" >/dev/null
restore_failed=0
echo "restore-test-db-from-dump: PASS (platform_users=$platform_users integrator_schema_migrations=$integrator_schema_migrations public_tables=$public_tables)"
