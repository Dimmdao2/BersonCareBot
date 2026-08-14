-- One-time fresh-PROD migration bridge.
--
-- The historical Drizzle chain still contains executable GRANT/REVOKE/OWNER statements for these
-- three retired roles. The revision-10 declaration intentionally excludes them from the target
-- shared-role baseline and lists them in zeroState. They must therefore exist only while the old
-- schema is being advanced; the final single-target zero/cutover removes them again.
--
-- This file creates no LOGIN, membership, password, database ACL or object ACL. Migrations themselves
-- create their historical object ownership/grants, all of which are erased by the final target zero.

\set ON_ERROR_STOP on

DO $bcb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_identity_bootstrap') THEN
    CREATE ROLE app_identity_bootstrap NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_operational_diagnostic') THEN
    CREATE ROLE app_operational_diagnostic NOLOGIN;
  END IF;
END
$bcb$;

ALTER ROLE app_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS INHERIT;
ALTER ROLE app_owner RESET ALL;
ALTER ROLE app_identity_bootstrap NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE app_identity_bootstrap RESET ALL;
ALTER ROLE app_operational_diagnostic NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE app_operational_diagnostic RESET ALL;

DO $bcb$
DECLARE
  bad text;
BEGIN
  SELECT role.rolname INTO bad
  FROM pg_catalog.pg_roles role
  WHERE role.rolname IN ('app_owner', 'app_identity_bootstrap', 'app_operational_diagnostic')
    AND (role.rolcanlogin OR role.rolsuper OR role.rolcreatedb OR role.rolcreaterole OR role.rolreplication
      OR role.rolbypassrls <> (role.rolname = 'app_owner')
      OR role.rolinherit <> (role.rolname = 'app_owner'))
  ORDER BY role.rolname
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe pre-migration legacy bridge role attributes: %', bad;
  END IF;

  SELECT granted.rolname || '->' || member.rolname INTO bad
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = membership.member
  WHERE granted.rolname IN ('app_owner', 'app_identity_bootstrap', 'app_operational_diagnostic')
  ORDER BY granted.rolname, member.rolname
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'pre-existing member on pre-migration legacy bridge role: %', bad;
  END IF;

  RAISE NOTICE 'BCB_PRE_MIGRATION_LEGACY_ROLE_BRIDGE_VERIFIED';
END
$bcb$;
