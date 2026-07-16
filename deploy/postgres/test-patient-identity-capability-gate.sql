-- Canonical TEST-only proof that the locked app_patient capability recognizes the two
-- representative walkthrough patients and rejects an unrelated fixture patient.
-- The fixed UUIDs are repo-reserved fixture identities; stdout intentionally contains
-- only the three boolean outcomes.
\set ON_ERROR_STOP on
\set QUIET 1
\o /dev/null

SELECT 1 / (current_database() = 'bersoncarebot_test')::int
  AS test_patient_identity_capability_wrong_database;
SELECT 1 / COALESCE((
  SELECT (NOT rolcanlogin AND NOT rolbypassrls)::int
  FROM pg_roles
  WHERE rolname = 'app_patient'
), 0) AS test_patient_identity_capability_role_not_locked;

BEGIN;

DO $context$
DECLARE
  v_nonce text := 'fixture-capability-a-' || pg_backend_pid()::text;
  v_expires_at bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300;
  v_secret text;
  v_signature text;
BEGIN
  SELECT secret INTO STRICT v_secret FROM app.context_signing_secrets WHERE id = true;
  v_signature := encode(app_ext.hmac(
    concat_ws('|', 'v1', v_nonce, pg_backend_pid()::text, v_expires_at::text,
      '53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a101', ''),
    v_secret, 'sha256'), 'hex');
  PERFORM app.install_signed_context(
    v_nonce, pg_backend_pid(), v_expires_at,
    '53000000-0000-4000-8000-0000000000a1',
    '53000000-0000-4000-8000-00000000a101',
    NULL, v_signature);
END
$context$;
SET SESSION AUTHORIZATION app_patient;
SELECT app.is_current_patient_test_account() AS patient_a \gset
RESET SESSION AUTHORIZATION;
DO $context$ BEGIN PERFORM app.reset_principal_context(); END $context$;

DO $context$
DECLARE
  v_nonce text := 'fixture-capability-b-' || pg_backend_pid()::text;
  v_expires_at bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300;
  v_secret text;
  v_signature text;
BEGIN
  SELECT secret INTO STRICT v_secret FROM app.context_signing_secrets WHERE id = true;
  v_signature := encode(app_ext.hmac(
    concat_ws('|', 'v1', v_nonce, pg_backend_pid()::text, v_expires_at::text,
      '53000000-0000-4000-8000-0000000000b1', '53000000-0000-4000-8000-00000000a201', ''),
    v_secret, 'sha256'), 'hex');
  PERFORM app.install_signed_context(
    v_nonce, pg_backend_pid(), v_expires_at,
    '53000000-0000-4000-8000-0000000000b1',
    '53000000-0000-4000-8000-00000000a201',
    NULL, v_signature);
END
$context$;
SET SESSION AUTHORIZATION app_patient;
SELECT app.is_current_patient_test_account() AS patient_b \gset
RESET SESSION AUTHORIZATION;
DO $context$ BEGIN PERFORM app.reset_principal_context(); END $context$;

DO $context$
DECLARE
  v_nonce text := 'fixture-capability-unrelated-' || pg_backend_pid()::text;
  v_expires_at bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300;
  v_secret text;
  v_signature text;
BEGIN
  SELECT secret INTO STRICT v_secret FROM app.context_signing_secrets WHERE id = true;
  v_signature := encode(app_ext.hmac(
    concat_ws('|', 'v1', v_nonce, pg_backend_pid()::text, v_expires_at::text,
      '53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a102', ''),
    v_secret, 'sha256'), 'hex');
  PERFORM app.install_signed_context(
    v_nonce, pg_backend_pid(), v_expires_at,
    '53000000-0000-4000-8000-0000000000a1',
    '53000000-0000-4000-8000-00000000a102',
    NULL, v_signature);
END
$context$;
SET SESSION AUTHORIZATION app_patient;
SELECT app.is_current_patient_test_account() AS unrelated \gset
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
