-- One-time DEV-only C0 login topology bootstrap.
--
-- This file deliberately contains no password and is not a migration, deploy, refresh, restore,
-- or runtime-overlay step. The two roles are cluster-global and survive database replacement.
-- Run it only through the operator procedure in LOCAL_DEV_AND_AGENT_TESTING.md.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
DECLARE
  wall_role_count integer;
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C0 bootstrap requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C0 bootstrap requires the exact postgres superuser operator';
  END IF;

  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'DEV C0 bootstrap requires PostgreSQL 16 membership options';
  END IF;

  IF pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database()))
       <> 'bcb_webapp_dev_user'
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bcb_webapp_dev_user') THEN
    RAISE EXCEPTION 'DEV C0 bootstrap requires the canonical DEV owner topology';
  END IF;

  SELECT count(*)
    INTO wall_role_count
  FROM pg_roles
  WHERE rolname IN ('app_staff', 'app_patient')
    AND rolcanlogin
    AND NOT rolsuper
    AND NOT rolcreatedb
    AND NOT rolcreaterole
    AND NOT rolreplication
    AND NOT rolbypassrls;

  IF wall_role_count <> 2 THEN
    RAISE EXCEPTION 'canonical app_staff/app_patient wall roles are absent or unsafe';
  END IF;

  IF pg_has_role('app_staff', 'app_patient', 'MEMBER')
     OR pg_has_role('app_patient', 'app_staff', 'MEMBER') THEN
    RAISE EXCEPTION 'canonical app_staff/app_patient wall roles have cross-membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE owner_role.rolname IN (
      'bcb_dev_runtime_staff_login',
      'bcb_dev_runtime_nonstaff_login'
    )
      AND namespace.nspname IN ('public', 'integrator', 'app')
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
    WHERE owner_role.rolname IN (
      'bcb_dev_runtime_staff_login',
      'bcb_dev_runtime_nonstaff_login'
    )
      AND namespace.nspname IN ('public', 'integrator', 'app')
  ) THEN
    RAISE EXCEPTION 'existing DEV C0 runtime login owns protected application objects';
  END IF;
END
$guard$;

SELECT format(
  'CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  role_name
)
FROM (VALUES
  ('bcb_dev_runtime_staff_login'),
  ('bcb_dev_runtime_nonstaff_login')
) AS required_role(role_name)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = required_role.role_name)
\gexec

ALTER ROLE bcb_dev_runtime_staff_login
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE bcb_dev_runtime_nonstaff_login
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE bcb_dev_runtime_staff_login RESET ALL;
ALTER ROLE bcb_dev_runtime_nonstaff_login RESET ALL;

-- Remove every direct capability edge before restoring the two exact SET-only edges.
SELECT format('REVOKE %I FROM %I', granted_role.rolname, member_role.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles member_role ON member_role.oid = membership.member
WHERE member_role.rolname IN (
  'bcb_dev_runtime_staff_login',
  'bcb_dev_runtime_nonstaff_login'
)
ORDER BY member_role.rolname, granted_role.rolname
\gexec

GRANT app_staff TO bcb_dev_runtime_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT app_patient TO bcb_dev_runtime_nonstaff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

DO $assertions$
DECLARE
  target_role text;
  expected_wall text;
BEGIN
  FOR target_role, expected_wall IN
    VALUES
      ('bcb_dev_runtime_staff_login', 'app_staff'),
      ('bcb_dev_runtime_nonstaff_login', 'app_patient')
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = target_role
        AND rolcanlogin
        AND NOT rolinherit
        AND NOT rolsuper
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolreplication
        AND NOT rolbypassrls
        AND rolconfig IS NULL
    ) THEN
      RAISE EXCEPTION 'unsafe DEV C0 runtime role attributes';
    END IF;

    IF 1 <> (
      SELECT count(*)
      FROM pg_auth_members membership
      JOIN pg_roles member_role ON member_role.oid = membership.member
      JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
      WHERE member_role.rolname = target_role
        AND granted_role.rolname = expected_wall
        AND NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
    ) OR 1 <> (
      SELECT count(*)
      FROM pg_auth_members membership
      JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = target_role
    ) THEN
      RAISE EXCEPTION 'DEV C0 runtime role membership is not the exact SET-only edge';
    END IF;
  END LOOP;

  IF pg_has_role('bcb_dev_runtime_staff_login', 'app_patient', 'MEMBER')
     OR pg_has_role('bcb_dev_runtime_nonstaff_login', 'app_staff', 'MEMBER')
     OR pg_has_role('bcb_dev_runtime_staff_login', 'app_owner', 'MEMBER')
     OR pg_has_role('bcb_dev_runtime_nonstaff_login', 'app_owner', 'MEMBER')
     OR pg_has_role('bcb_dev_runtime_staff_login', 'bcb_webapp_dev_user', 'MEMBER')
     OR pg_has_role('bcb_dev_runtime_nonstaff_login', 'bcb_webapp_dev_user', 'MEMBER') THEN
    RAISE EXCEPTION 'DEV C0 runtime role has a forbidden transitive membership';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C0 runtime login topology: OK (passwords unchanged; no env or database data changed)'
