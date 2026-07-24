-- Ephemeral U5A TEST-only shared-patient lifecycle capability.
--
-- The root host wrapper applies `install`, invokes the function through the protected operator
-- login, then always applies `cleanup`. The capability must not remain between commands. It uses
-- only the app_owner ACL already installed by the canonical patient-invites strict overlay.

\set ON_ERROR_STOP on
\pset pager off

\if :{?u5a_lifecycle_expected_database}
\else
\echo 'FATAL: missing u5a_lifecycle_expected_database.'
SELECT 1 / 0 AS u5a_lifecycle_expected_database_missing;
\endif

\if :{?u5a_lifecycle_operator_role}
\else
\echo 'FATAL: missing u5a_lifecycle_operator_role.'
SELECT 1 / 0 AS u5a_lifecycle_operator_role_missing;
\endif

\if :{?u5a_lifecycle_mode}
\else
\echo 'FATAL: missing u5a_lifecycle_mode.'
SELECT 1 / 0 AS u5a_lifecycle_mode_missing;
\endif

SELECT 1 / (current_database() = :'u5a_lifecycle_expected_database')::int
  AS u5a_lifecycle_database_matches_argument;
SELECT 1 / (current_database() = 'bersoncarebot_test')::int
  AS u5a_lifecycle_exact_test_database;
SELECT 1 / (:'u5a_lifecycle_mode' IN ('install', 'cleanup'))::int
  AS u5a_lifecycle_mode_valid;
SELECT (:'u5a_lifecycle_mode' = 'cleanup')::int AS u5a_lifecycle_is_cleanup \gset

\if :u5a_lifecycle_is_cleanup
BEGIN;
DROP FUNCTION IF EXISTS app.control_u5a_patient_organization_fixture(text);
COMMIT;

SELECT 1 / (
  to_regprocedure('app.control_u5a_patient_organization_fixture(text)') IS NULL
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'SELECT'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'INSERT'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'UPDATE'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'DELETE'
  )
)::int AS u5a_lifecycle_cleanup_no_capability_residue;
\else
SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = :'u5a_lifecycle_operator_role'
      AND rolcanlogin
      AND rolinherit
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  )
  AND NOT pg_has_role(:'u5a_lifecycle_operator_role', 'app_owner', 'MEMBER')
  AND NOT pg_has_role(:'u5a_lifecycle_operator_role', 'app_staff', 'MEMBER')
  AND NOT pg_has_role(:'u5a_lifecycle_operator_role', 'app_patient', 'MEMBER')
  AND NOT pg_has_role(:'u5a_lifecycle_operator_role', 'app_worker', 'MEMBER')
  AND (
    SELECT count(*) = 1
      AND bool_and(
        granted_role.rolname = 'saas_telemetry_operator'
        AND NOT membership.admin_option
        AND membership.inherit_option
        AND membership.set_option
      )
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname = :'u5a_lifecycle_operator_role'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS capability_role
    WHERE capability_role.rolname = 'saas_telemetry_operator'
      AND NOT capability_role.rolcanlogin
      AND NOT capability_role.rolinherit
      AND NOT capability_role.rolsuper
      AND NOT capability_role.rolcreatedb
      AND NOT capability_role.rolcreaterole
      AND NOT capability_role.rolreplication
      AND NOT capability_role.rolbypassrls
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'saas_telemetry_operator'
  )
)::int AS u5a_lifecycle_operator_is_sanctioned;

SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'app_owner'
      AND NOT rolcanlogin
      AND rolsuper = false
      AND rolbypassrls
  )
  AND has_schema_privilege('app_owner', 'public', 'USAGE')
  AND has_table_privilege('app_owner', 'public.org_enrollments', 'SELECT')
  AND has_table_privilege('app_owner', 'public.org_enrollments', 'UPDATE')
  AND NOT has_table_privilege('app_owner', 'public.org_enrollments', 'INSERT')
  AND NOT has_table_privilege('app_owner', 'public.org_enrollments', 'DELETE')
  AND NOT has_table_privilege('app_owner', 'public.org_enrollments', 'TRUNCATE')
  AND to_regprocedure('app.control_u5a_patient_organization_fixture(text)') IS NULL
)::int AS u5a_lifecycle_canonical_app_owner_acl_precondition;

BEGIN;
CREATE FUNCTION app.control_u5a_patient_organization_fixture(p_action text)
RETURNS TABLE (target_status text, active_relationships integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_total integer;
  v_clinic_a integer;
  v_clinic_b integer;
  v_clinic_a_status text;
  v_clinic_b_status text;
BEGIN
  IF current_database() <> 'bersoncarebot_test' THEN
    RAISE EXCEPTION 'u5a_lifecycle_exact_test_database_required' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('status', 'discharge', 'restore') THEN
    RAISE EXCEPTION 'u5a_lifecycle_invalid_action' USING ERRCODE = '22023';
  END IF;
  IF current_user <> 'app_owner'
  OR current_setting('role', true) IS DISTINCT FROM 'none'
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = session_user
      AND rolcanlogin
      AND rolinherit
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  )
  OR pg_has_role(session_user, 'app_owner', 'MEMBER')
  OR pg_has_role(session_user, 'app_staff', 'MEMBER')
  OR pg_has_role(session_user, 'app_patient', 'MEMBER')
  OR pg_has_role(session_user, 'app_worker', 'MEMBER')
  OR NOT (
    SELECT count(*) = 1
      AND bool_and(
        granted_role.rolname = 'saas_telemetry_operator'
        AND NOT membership.admin_option
        AND membership.inherit_option
        AND membership.set_option
      )
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname = session_user
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS capability_role
    WHERE capability_role.rolname = 'saas_telemetry_operator'
      AND NOT capability_role.rolcanlogin
      AND NOT capability_role.rolinherit
      AND NOT capability_role.rolsuper
      AND NOT capability_role.rolcreatedb
      AND NOT capability_role.rolcreaterole
      AND NOT capability_role.rolreplication
      AND NOT capability_role.rolbypassrls
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'saas_telemetry_operator'
  ) THEN
    RAISE EXCEPTION 'u5a_lifecycle_operator_required' USING ERRCODE = '42501';
  END IF;

  -- Freeze enrollment writers for this short transaction. This protects the exact A+B set from
  -- concurrent INSERT/UPDATE/DELETE while both canonical rows and their statuses are verified.
  LOCK TABLE public.org_enrollments IN SHARE MODE;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE id = '53000000-0000-4000-8000-00000000b105'::uuid
        AND organization_id = '53000000-0000-4000-8000-0000000000a1'::uuid
    )::integer,
    count(*) FILTER (
      WHERE id = '53000000-0000-4000-8000-00000000b203'::uuid
        AND organization_id = '53000000-0000-4000-8000-0000000000b1'::uuid
    )::integer,
    max(status) FILTER (
      WHERE id = '53000000-0000-4000-8000-00000000b105'::uuid
        AND organization_id = '53000000-0000-4000-8000-0000000000a1'::uuid
    ),
    max(status) FILTER (
      WHERE id = '53000000-0000-4000-8000-00000000b203'::uuid
        AND organization_id = '53000000-0000-4000-8000-0000000000b1'::uuid
    )
  INTO v_total, v_clinic_a, v_clinic_b, v_clinic_a_status, v_clinic_b_status
  FROM public.org_enrollments
  WHERE platform_user_id = '53000000-0000-4000-8000-00000000a301'::uuid;

  IF v_total <> 2
     OR v_clinic_a <> 1
     OR v_clinic_b <> 1
     OR v_clinic_a_status <> 'active'
     OR v_clinic_b_status NOT IN ('active', 'discharged') THEN
    RAISE EXCEPTION 'u5a_lifecycle_fixture_shape_mismatch' USING ERRCODE = '23514';
  END IF;

  IF p_action = 'discharge' AND v_clinic_b_status = 'active' THEN
    UPDATE public.org_enrollments
    SET status = 'discharged'
    WHERE id = '53000000-0000-4000-8000-00000000b203'::uuid
      AND organization_id = '53000000-0000-4000-8000-0000000000b1'::uuid
      AND platform_user_id = '53000000-0000-4000-8000-00000000a301'::uuid
      AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'u5a_lifecycle_discharge_did_not_converge' USING ERRCODE = '40001';
    END IF;
  ELSIF p_action = 'restore' AND v_clinic_b_status = 'discharged' THEN
    UPDATE public.org_enrollments
    SET status = 'active'
    WHERE id = '53000000-0000-4000-8000-00000000b203'::uuid
      AND organization_id = '53000000-0000-4000-8000-0000000000b1'::uuid
      AND platform_user_id = '53000000-0000-4000-8000-00000000a301'::uuid
      AND status = 'discharged';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'u5a_lifecycle_restore_did_not_converge' USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      enrollment.status,
      count(*) FILTER (WHERE relationship.status = 'active')::integer
    FROM public.org_enrollments AS enrollment
    CROSS JOIN public.org_enrollments AS relationship
    WHERE enrollment.id = '53000000-0000-4000-8000-00000000b203'::uuid
      AND enrollment.organization_id = '53000000-0000-4000-8000-0000000000b1'::uuid
      AND enrollment.platform_user_id = '53000000-0000-4000-8000-00000000a301'::uuid
      AND relationship.platform_user_id = '53000000-0000-4000-8000-00000000a301'::uuid
    GROUP BY enrollment.status;
END
$function$;

ALTER FUNCTION app.control_u5a_patient_organization_fixture(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.control_u5a_patient_organization_fixture(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.control_u5a_patient_organization_fixture(text)
  FROM app_staff, app_patient, app_worker, saas_telemetry_operator;
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.control_u5a_patient_organization_fixture(text) TO %I',
  :'u5a_lifecycle_operator_role'
)\gexec
COMMIT;

SELECT 1 / (
  has_function_privilege(
    :'u5a_lifecycle_operator_role',
    'app.control_u5a_patient_organization_fixture(text)',
    'EXECUTE'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'SELECT'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'INSERT'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'UPDATE'
  )
  AND NOT has_table_privilege(
    :'u5a_lifecycle_operator_role', 'public.org_enrollments', 'DELETE'
  )
  AND (
    SELECT owner.rolname = 'app_owner'
      AND procedure.prosecdef
      AND procedure.proconfig = ARRAY['search_path=pg_catalog']
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = 'app.control_u5a_patient_organization_fixture(text)'::regprocedure
  )
)::int AS u5a_lifecycle_closed_capability_installed;
\endif
