#!/usr/bin/env bash
# Retire one explicitly named legacy media-worker PostgreSQL LOGIN. This is a
# root/DB-admin operation, intentionally outside application migrations.
set +x
set -euo pipefail

database=""
retired_role=""

usage() {
  cat >&2 <<'EOF'
Usage: retire-media-db-login.sh --database <canonical-db-name> --role <exact-legacy-login>

Run only through the local PostgreSQL administrator path. The role name is an
exact canonical declaration parameter, never a pattern or inferred username.
EOF
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --database) database="${2:-}"; shift 2 ;;
    --role) retired_role="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[ "${EUID}" -eq 0 ] || { echo 'FATAL: run as root/DB administrator' >&2; exit 1; }
[[ "$database" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo 'FATAL: unsafe canonical database identifier' >&2; exit 1; }
[[ "$retired_role" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo 'FATAL: unsafe exact legacy role identifier' >&2; exit 1; }

sudo -u postgres psql -d "$database" -X -v ON_ERROR_STOP=1 \
  -v retired_media_db_login_role="$retired_role" <<'SQL'
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

SELECT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'retired_media_db_login_role'
) AS retired_media_db_login_exists
\gset

\if :retired_media_db_login_exists
  -- Nothing below this line can commit if ownership/dependency preflight fails.
  -- ACL (`a`) and membership (`m`) dependencies are deliberately removed below;
  -- every other dependency is unsafe and must abort before a partial retirement.
  WITH target AS (
    SELECT oid FROM pg_roles WHERE rolname = :'retired_media_db_login_role'
  )
  SELECT 1 / (
    NOT EXISTS (
      SELECT 1 FROM pg_namespace object JOIN target ON object.nspowner = target.oid
      UNION ALL
      SELECT 1 FROM pg_database object JOIN target ON object.datdba = target.oid
      UNION ALL
      SELECT 1 FROM pg_class object JOIN target ON object.relowner = target.oid
      UNION ALL
      SELECT 1 FROM pg_proc object JOIN target ON object.proowner = target.oid
      UNION ALL
      SELECT 1 FROM pg_type object JOIN target ON object.typowner = target.oid
      UNION ALL
      SELECT 1 FROM pg_default_acl object JOIN target ON object.defaclrole = target.oid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_shdepend dependency
      JOIN target ON target.oid = dependency.refobjid
      WHERE dependency.refclassid = 'pg_authid'::regclass
        AND dependency.deptype NOT IN ('a', 'm')
    )
  )::int AS retired_media_db_login_has_no_unsafe_ownership_or_dependencies;

  -- Revoke both incoming and outgoing memberships before credentials disappear.
  SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
  FROM pg_auth_members membership
  JOIN pg_roles granted ON granted.oid = membership.roleid
  JOIN pg_roles member ON member.oid = membership.member
  WHERE member.rolname = :'retired_media_db_login_role'
     OR granted.rolname = :'retired_media_db_login_role'
  \gexec

  SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', database_name.datname, :'retired_media_db_login_role')
  FROM pg_database database_name
  WHERE datallowconn
  \gexec

  WITH schemas(schema_name) AS (
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema')
      AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'
  )
  SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', schema_name, :'retired_media_db_login_role') FROM schemas
  UNION ALL
  SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, :'retired_media_db_login_role') FROM schemas
  UNION ALL
  SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, :'retired_media_db_login_role') FROM schemas
  UNION ALL
  SELECT format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I', schema_name, :'retired_media_db_login_role') FROM schemas
  \gexec

  SELECT format('REVOKE %s (%I) ON TABLE %I.%I FROM %I',
    acl.privilege_type, attribute.attname, namespace.nspname, relation.relname, :'retired_media_db_login_role')
  FROM pg_attribute attribute
  JOIN pg_class relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = :'retired_media_db_login_role'
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
  \gexec

  SELECT format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
    namespace.nspname, object.typname, :'retired_media_db_login_role')
  FROM pg_type object
  JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
  CROSS JOIN LATERAL aclexplode(object.typacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = :'retired_media_db_login_role'
  \gexec

  SELECT DISTINCT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL PRIVILEGES ON %s FROM %I',
    owner_role.rolname,
    CASE WHEN namespace.oid IS NULL THEN '' ELSE format(' IN SCHEMA %I', namespace.nspname) END,
    CASE defaults.defaclobjtype
      WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'ROUTINES' ELSE 'TYPES'
    END,
    :'retired_media_db_login_role'
  )
  FROM pg_default_acl defaults
  JOIN pg_roles owner_role ON owner_role.oid = defaults.defaclrole
  LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = :'retired_media_db_login_role'
    AND defaults.defaclobjtype IN ('r', 'S', 'f', 'T')
  \gexec

  WITH target AS (
    SELECT oid FROM pg_roles WHERE rolname = :'retired_media_db_login_role'
  )
  SELECT 1 / (
    NOT EXISTS (SELECT 1 FROM pg_auth_members membership JOIN target ON target.oid IN (membership.roleid, membership.member))
    AND NOT EXISTS (
      SELECT 1 FROM pg_shdepend dependency JOIN target ON target.oid = dependency.refobjid
      WHERE dependency.refclassid = 'pg_authid'::regclass
    )
  )::int AS retired_media_db_login_has_zero_memberships_and_dependencies;

  DROP ROLE :"retired_media_db_login_role";
  \echo 'media DB login retirement: dropped exact legacy role.'
\else
  \echo 'media DB login retirement: exact legacy role already absent (PASS).'
\endif

COMMIT;
SQL
