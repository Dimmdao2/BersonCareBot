-- Canonical TEST-only proof that the locked app_patient capability recognizes the two
-- representative walkthrough patients and rejects an unrelated fixture patient.
-- The fixed UUIDs are repo-reserved fixture identities; stdout intentionally contains
-- only the three boolean outcomes.
\set ON_ERROR_STOP on
\set QUIET 1
\o /dev/null

\if :{?patient_identity_runtime_login_role}
\else
  \echo 'FATAL: missing patient_identity_runtime_login_role.'
  SELECT 1 / 0 AS patient_identity_runtime_login_role_missing;
\endif

SELECT 1 / (current_database() = 'bersoncarebot_test')::int
  AS test_patient_identity_capability_wrong_database;
SELECT 1 / COALESCE((
  SELECT (
    rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls
  )::int
  FROM pg_roles
  WHERE rolname = 'app_patient'
), 0) AS test_patient_identity_capability_role_not_restricted;
SELECT 1 / COALESCE((
  SELECT (
    rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  )::int
  FROM pg_roles
  WHERE rolname = :'patient_identity_runtime_login_role'
), 0) AS test_patient_identity_runtime_login_not_restricted;
WITH RECURSIVE runtime_login AS (
  SELECT oid
  FROM pg_roles
  WHERE rolname = :'patient_identity_runtime_login_role'
), direct_memberships AS (
  SELECT membership.*
  FROM pg_auth_members membership
  JOIN runtime_login ON runtime_login.oid = membership.member
), reachable_roles(roleid) AS (
  SELECT roleid FROM direct_memberships
  UNION
  SELECT membership.roleid
  FROM pg_auth_members membership
  JOIN reachable_roles reachable ON reachable.roleid = membership.member
)
SELECT 1 / (
  :'patient_identity_runtime_login_role' <> 'app_patient'
  AND NOT pg_has_role(:'patient_identity_runtime_login_role', 'app_staff', 'MEMBER')
  AND NOT pg_has_role('app_patient', 'app_staff', 'MEMBER')
  AND 1 = (
    SELECT count(*)
    FROM direct_memberships membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname = 'app_patient'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  AND 1 = (SELECT count(*) FROM direct_memberships)
  AND NOT EXISTS (
    SELECT 1
    FROM reachable_roles reachable
    JOIN pg_roles granted_role ON granted_role.oid = reachable.roleid
    WHERE granted_role.rolname <> 'app_patient'
  )
)::int AS test_patient_identity_runtime_topology_exact;

BEGIN;

SELECT 'fixture-capability-a-' || pg_backend_pid()::text AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 300 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
    concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
      '53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a101', ''),
    (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET SESSION AUTHORIZATION :"patient_identity_runtime_login_role";
SET ROLE app_patient;
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000a1'::uuid,
  '53000000-0000-4000-8000-00000000a101'::uuid, NULL::bigint, :'ctx_sig');
SELECT app.is_current_patient_test_account() AS patient_a \gset
SELECT app.release_principal_context();
RESET ROLE;
RESET SESSION AUTHORIZATION;

SELECT 'fixture-capability-b-' || pg_backend_pid()::text AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 300 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
    concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
      '53000000-0000-4000-8000-0000000000b1', '53000000-0000-4000-8000-00000000a201', ''),
    (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET SESSION AUTHORIZATION :"patient_identity_runtime_login_role";
SET ROLE app_patient;
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000b1'::uuid,
  '53000000-0000-4000-8000-00000000a201'::uuid, NULL::bigint, :'ctx_sig');
SELECT app.is_current_patient_test_account() AS patient_b \gset
SELECT app.release_principal_context();
RESET ROLE;
RESET SESSION AUTHORIZATION;

SELECT 'fixture-capability-unrelated-' || pg_backend_pid()::text AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 300 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
    concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
      '53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a102', ''),
    (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET SESSION AUTHORIZATION :"patient_identity_runtime_login_role";
SET ROLE app_patient;
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000a1'::uuid,
  '53000000-0000-4000-8000-00000000a102'::uuid, NULL::bigint, :'ctx_sig');
SELECT app.is_current_patient_test_account() AS unrelated \gset
SELECT app.release_principal_context();
RESET ROLE;
RESET SESSION AUTHORIZATION;

\if :patient_a
\else
  \echo 'FATAL: locked patient identity capability rejected representative patient A.'
  SELECT 1 / 0 AS patient_a_capability_failed;
\endif
\if :patient_b
\else
  \echo 'FATAL: locked patient identity capability rejected representative patient B.'
  SELECT 1 / 0 AS patient_b_capability_failed;
\endif
\if :unrelated
  \echo 'FATAL: locked patient identity capability accepted unrelated patient.'
  SELECT 1 / 0 AS unrelated_patient_capability_failed;
\endif

ROLLBACK;
\o
\unset QUIET
\echo 'locked patient identity capability: patientA=true patientB=true unrelated=false'
