#!/usr/bin/env bash
# Recreate the one canonical TEST database from a protected custom-format dump.
# This script is an internal primitive of deploy-test-full-reset.sh, not a public deploy entrypoint.
set -euo pipefail

DB=bersoncarebot_test
OWNER_ROLE=bersoncarebot_test
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

if ! psql -X -d postgres -Atqc "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='$OWNER_ROLE'" | grep -qx 1; then
  psql -X -d postgres -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE \"$OWNER_ROLE\" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;" >/dev/null
else
  psql -X -d postgres -v ON_ERROR_STOP=1 -c \
    "ALTER ROLE \"$OWNER_ROLE\" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;" >/dev/null
fi

psql -X -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid)
     FROM pg_catalog.pg_stat_activity
    WHERE datname='$DB' AND pid<>pg_backend_pid();" >/dev/null
dropdb --if-exists "$DB"
createdb --owner="$OWNER_ROLE" --template=template0 "$DB"

psql -X -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --no-comments \
  --role="$OWNER_ROLE" \
  --dbname="$DB" \
  "$DUMP"

database_owner="$(psql -X -d postgres -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname='$DB'")"
platform_users_owner="$(psql -X -d "$DB" -Atqc "SELECT tableowner FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename='platform_users'")"
[ "$database_owner" = "$OWNER_ROLE" ] || fail "database owner is $database_owner, expected $OWNER_ROLE"
[ "$platform_users_owner" = "$OWNER_ROLE" ] || fail "platform_users owner is $platform_users_owner, expected $OWNER_ROLE"

platform_users="$(psql -X -d "$DB" -Atqc 'SELECT count(*) FROM public.platform_users')"
integrator_identities="$(psql -X -d "$DB" -Atqc 'SELECT count(*) FROM integrator.identities')"
public_tables="$(psql -X -d "$DB" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
[[ "$platform_users" =~ ^[1-9][0-9]*$ ]] || fail "platform_users restore sanity failed"
[[ "$integrator_identities" =~ ^[1-9][0-9]*$ ]] || fail "integrator.identities restore sanity failed"
[[ "$public_tables" =~ ^[1-9][0-9]*$ ]] || fail "public table restore sanity failed"

psql -X -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$DB\" CONNECTION LIMIT -1;" >/dev/null
restore_failed=0
echo "restore-test-db-from-dump: PASS (platform_users=$platform_users integrator_identities=$integrator_identities public_tables=$public_tables)"
