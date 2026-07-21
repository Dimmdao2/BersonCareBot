-- Literal DB-layer fail-closed proof for one fresh non-owner runtime login.
-- The caller supplies the exact base login and its only SET-able terminal role.

\set ON_ERROR_STOP on
\pset pager off

\if :{?a1_expected_login_role}
\else
\echo 'FATAL: missing a1_expected_login_role.'
SELECT 1 / 0 AS a1_expected_login_role_missing;
\endif

\if :{?a1_expected_runtime_role}
\else
\echo 'FATAL: missing a1_expected_runtime_role.'
SELECT 1 / 0 AS a1_expected_runtime_role_missing;
\endif

SELECT 1 / (session_user = :'a1_expected_login_role')::int AS a1_fresh_base_login_exact;

SET ROLE :"a1_expected_runtime_role";

SELECT 1 / (
  current_user = :'a1_expected_runtime_role'
  AND session_user = :'a1_expected_login_role'
  AND app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
  AND row_security_active('public.be_appointments'::regclass)
)::int AS a1_unsigned_context_is_empty_and_rls_active;

DO $a1_missing_context_denial$
DECLARE
  visible_rows bigint;
BEGIN
  BEGIN
    SELECT count(*) INTO visible_rows FROM public.be_appointments;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RETURN;
  END;

  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'a1_missing_context_exposed_rows:%', visible_rows;
  END IF;
END
$a1_missing_context_denial$;

RESET ROLE;

SELECT 1 / (
  current_user = :'a1_expected_login_role'
  AND session_user = :'a1_expected_login_role'
)::int AS a1_fresh_base_login_restored;
