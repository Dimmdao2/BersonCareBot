-- Owner-ready TEST locked DB matrix over deterministic fixture v2.
-- Run only as the TEST database superuser after the fixture has converged and strict policies are active.
-- Every apparent write is rolled back; the signing secret is read inside PostgreSQL and is never printed.

\set ON_ERROR_STOP on
\pset pager off

\if :{?test_expected_database}
\else
\echo 'FATAL: missing test_expected_database.'
SELECT 1 / 0;
\endif
\if :{?matrix_staff_role}
\else
\set matrix_staff_role app_staff
\endif
\if :{?matrix_patient_role}
\else
\set matrix_patient_role app_patient
\endif

SELECT 1 / (current_database() = :'test_expected_database')::int AS matrix_exact_test_database;
SELECT 1 / (current_database() = 'bersoncarebot_test')::int AS matrix_canonical_test_database;
SELECT 1 / (SELECT rolsuper::int FROM pg_roles WHERE rolname = current_user) AS matrix_operator_is_superuser;
SELECT 1 / (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'matrix_staff_role' AND NOT rolbypassrls)
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'matrix_patient_role' AND NOT rolbypassrls)
)::int AS matrix_runtime_roles_are_nobypassrls;
SELECT 1 / (
  to_regprocedure('app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)') IS NOT NULL
  AND to_regprocedure('app.release_principal_context()') IS NOT NULL
)::int AS matrix_locked_context_helpers_exist;

BEGIN;

-- Clinic A staff: own reads/writes succeed; Clinic B reads/writes are invisible.
RESET ROLE;
SELECT 'owner_ready_a_' || pg_backend_pid() || '_' || floor(extract(epoch FROM clock_timestamp()))::bigint AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 240 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
  concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
    '53000000-0000-4000-8000-0000000000a1', '', ''),
  (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET ROLE :"matrix_staff_role";
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000a1'::uuid, NULL::uuid, NULL::bigint, :'ctx_sig');
SELECT 1 / (count(*) = 1)::int AS matrix_a_reads_a
FROM public.org_enrollments WHERE id = '53000000-0000-4000-8000-00000000b101'::uuid;
SELECT 1 / (count(*) = 0)::int AS matrix_a_cannot_read_b
FROM public.org_enrollments WHERE id = '53000000-0000-4000-8000-00000000b201'::uuid;
WITH changed AS (
  UPDATE public.org_enrollments SET status = status
  WHERE id = '53000000-0000-4000-8000-00000000b101'::uuid RETURNING id
) SELECT 1 / (count(*) = 1)::int AS matrix_a_writes_a FROM changed;
WITH changed AS (
  UPDATE public.org_enrollments SET status = status
  WHERE id = '53000000-0000-4000-8000-00000000b201'::uuid RETURNING id
) SELECT 1 / (count(*) = 0)::int AS matrix_a_cannot_write_b FROM changed;
WITH changed AS (
  UPDATE public.be_appointments SET updated_at = updated_at
  WHERE id = '53000000-0000-4000-8000-00000000c101'::uuid RETURNING id
) SELECT 1 / (count(*) = 1)::int AS matrix_org_scoped_booking_write_a FROM changed;
WITH changed AS (
  UPDATE public.be_appointments SET updated_at = updated_at
  WHERE id = '53000000-0000-4000-8000-00000000c301'::uuid RETURNING id
) SELECT 1 / (count(*) = 0)::int AS matrix_a_cannot_write_booking_b FROM changed;
SELECT app.release_principal_context();

-- Clinic B staff: symmetric proof.
RESET ROLE;
SELECT 'owner_ready_b_' || pg_backend_pid() || '_' || floor(extract(epoch FROM clock_timestamp()))::bigint AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 240 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
  concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
    '53000000-0000-4000-8000-0000000000b1', '', ''),
  (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET ROLE :"matrix_staff_role";
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000b1'::uuid, NULL::uuid, NULL::bigint, :'ctx_sig');
SELECT 1 / (count(*) = 1)::int AS matrix_b_reads_b
FROM public.org_enrollments WHERE id = '53000000-0000-4000-8000-00000000b201'::uuid;
SELECT 1 / (count(*) = 0)::int AS matrix_b_cannot_read_a
FROM public.org_enrollments WHERE id = '53000000-0000-4000-8000-00000000b101'::uuid;
WITH changed AS (
  UPDATE public.org_enrollments SET status = status
  WHERE id = '53000000-0000-4000-8000-00000000b201'::uuid RETURNING id
) SELECT 1 / (count(*) = 1)::int AS matrix_b_writes_b FROM changed;
WITH changed AS (
  UPDATE public.org_enrollments SET status = status
  WHERE id = '53000000-0000-4000-8000-00000000b101'::uuid RETURNING id
) SELECT 1 / (count(*) = 0)::int AS matrix_b_cannot_write_a FROM changed;
SELECT app.release_principal_context();

-- The shared patient must remain valid under an explicitly selected A context and B context.
RESET ROLE;
SELECT 'owner_ready_patient_a_' || pg_backend_pid() || '_' || floor(extract(epoch FROM clock_timestamp()))::bigint AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 240 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
  concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
    '53000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-00000000a301', ''),
  (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET ROLE :"matrix_patient_role";
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000a1'::uuid,
  '53000000-0000-4000-8000-00000000a301'::uuid, NULL::bigint, :'ctx_sig');
SELECT 1 / (
  app.current_org_id() = '53000000-0000-4000-8000-0000000000a1'::uuid
  AND app.current_patient_user_id() = '53000000-0000-4000-8000-00000000a301'::uuid
  AND (SELECT count(*) FROM public.org_enrollments
       WHERE id = '53000000-0000-4000-8000-00000000b105'::uuid) = 1
)::int AS matrix_shared_patient_selected_a;
SELECT app.release_principal_context();

RESET ROLE;
SELECT 'owner_ready_patient_b_' || pg_backend_pid() || '_' || floor(extract(epoch FROM clock_timestamp()))::bigint AS ctx_nonce,
       pg_backend_pid() AS ctx_pid,
       floor(extract(epoch FROM clock_timestamp()))::bigint + 240 AS ctx_exp
\gset
SELECT encode(app_ext.hmac(
  concat_ws('|', 'v1', :'ctx_nonce', (:ctx_pid)::text, (:ctx_exp)::text,
    '53000000-0000-4000-8000-0000000000b1', '53000000-0000-4000-8000-00000000a301', ''),
  (SELECT secret FROM app.context_signing_secrets WHERE id = true), 'sha256'), 'hex') AS ctx_sig
\gset
SET ROLE :"matrix_patient_role";
SET row_security = on;
SELECT app.install_signed_context(:'ctx_nonce', :ctx_pid, :ctx_exp,
  '53000000-0000-4000-8000-0000000000b1'::uuid,
  '53000000-0000-4000-8000-00000000a301'::uuid, NULL::bigint, :'ctx_sig');
SELECT 1 / (
  app.current_org_id() = '53000000-0000-4000-8000-0000000000b1'::uuid
  AND app.current_patient_user_id() = '53000000-0000-4000-8000-00000000a301'::uuid
  AND (SELECT count(*) FROM public.org_enrollments
       WHERE id = '53000000-0000-4000-8000-00000000b203'::uuid) = 1
)::int AS matrix_shared_patient_selected_b;
SELECT app.release_principal_context();
RESET ROLE;

ROLLBACK;

\echo 'owner-ready locked DB matrix: OK (all writes rolled back)'
