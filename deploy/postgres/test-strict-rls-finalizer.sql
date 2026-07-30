-- Mandatory strict-policy + FORCE RLS finalizer (TEST-default, PROD-gated).
--
-- This is deliberately separate from historical compatibility migration 0177. Every supported TEST
-- migration/deploy path must run this file after migrations and reviewed policy overlays, before runtime
-- services restart. It is idempotent and fail-closed.
--
-- DB-name gate, plain-language: by default this file ONLY runs against `bersoncarebot_test` (or, with
-- `-v test_allow_disposable_database=1`, a `bcb_saas_*_scratch_*`/`bcb_saas_*_rehearsal_*` disposable copy
-- that does not look like prod/test/dev). Passing no extra flag => refuses any prod-named database exactly as
-- before this header was added; nothing below changes that path.
--
-- PROD CUTOVER (owner-gated, one-off): the real production cutover runs this exact file against the real
-- prod database. That requires an EXPLICIT extra flag, `-v allow_authorized_prod_target=1`, in addition to
-- (not instead of) `-v test_expected_database=<exact prod DB name>` (already required below). Without the
-- flag, a prod-named `test_expected_database` is refused exactly like today. With the flag, the file still
-- requires `current_database()` to equal the operator-supplied `test_expected_database` verbatim — a typo or
-- mismatch still aborts (fail-closed, division-by-zero abort, same mechanism as every other gate here).
--
-- Exact cutover invocation (run by the owner-authorized operator only, per
-- docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md §10 "B1, A2, and product smoke gates" — i.e. AFTER
-- migrations, data cleanup, settings, runtime roles/grants (§3 of SAAS_PROD_DEPLOY_PROCESS.md), and reviewed
-- policy overlays, BEFORE runtime services restart):
--
--   sudo -u postgres psql -d "$PROD_DB" -X -v ON_ERROR_STOP=1 \
--     -v allow_authorized_prod_target=1 \
--     -v test_expected_database="$PROD_DB" \
--     -v phase4_bootstrap_base_role="$PROD_BOOTSTRAP_ROLE" \
--     -v phase4_staff_role="$PROD_STAFF_ROLE" \
--     -v phase4_owner_role="$PROD_OWNER_ROLE" \
--     -f deploy/postgres/test-strict-rls-finalizer.sql
--
-- This does NOT lower any FORCE/policy strictness -- only the DB-name refusal is relaxed, and only when both
-- the flag is set AND the name matches exactly. No other assertion in this file is weakened by the flag.

\set ON_ERROR_STOP on
\pset pager off

\if :{?test_expected_database}
\else
\echo 'FATAL: missing required psql variable test_expected_database.'
SELECT 1 / 0 AS test_expected_database_missing;
\endif

SELECT 1 / (current_database() = :'test_expected_database')::int AS test_database_is_expected;

\if :{?test_allow_disposable_database}
\else
\set test_allow_disposable_database 0
\endif

\if :{?allow_authorized_prod_target}
\else
\set allow_authorized_prod_target 0
\endif

SELECT 1 / (:'test_allow_disposable_database' IN ('0', '1'))::int
  AS test_allow_disposable_database_is_valid;
SELECT 1 / (:'allow_authorized_prod_target' IN ('0', '1'))::int
  AS allow_authorized_prod_target_is_valid;
SELECT 1 / (
  current_database() = 'bersoncarebot_test'
  OR (
    :'test_allow_disposable_database' = '1'
    AND current_database() ~ '^bcb_saas_[a-z0-9_]*(scratch|rehearsal)_[a-z0-9_]+$'
    AND current_database() !~ '(prod|test|dev)'
  )
  OR (
    -- PROD cutover unlock (owner-gated). Requires the explicit flag AND an exact match against the
    -- operator-supplied expected DB name (already hard-asserted above as `test_database_is_expected`,
    -- re-checked here so this branch never depends on assertion ordering elsewhere in the file).
    :'allow_authorized_prod_target' = '1'
    AND current_database() = :'test_expected_database'
  )
)::int AS test_database_is_canonical_test_or_explicit_disposable_or_authorized_prod;

\if :{?phase4_bootstrap_base_role}
\else
\echo 'FATAL: missing required psql variable phase4_bootstrap_base_role.'
SELECT 1 / 0 AS phase4_bootstrap_base_role_missing;
\endif

\if :{?phase4_staff_role}
\else
\echo 'FATAL: missing required psql variable phase4_staff_role.'
SELECT 1 / 0 AS phase4_staff_role_missing;
\endif

\if :{?phase4_owner_role}
\else
\echo 'FATAL: missing required psql variable phase4_owner_role.'
SELECT 1 / 0 AS phase4_owner_role_missing;
\endif

\set phase4_enforce_locked_context 1
\ir phase4-locked-helper-rls-policies.sql
-- The generated base renderer intentionally owns the common policy set.  These reviewed overlays
-- replace a few same-named policies with product/process-specific strict variants and therefore
-- must always run AFTER the renderer and BEFORE FORCE/assertion.
\ir organization-member-invites-rls.sql
\ir patient-invites-rls.sql
\ir patient-course-assignment-wall.sql
\ir patient-visible-catalog-rls.sql
\ir phase4-app-worker-narrow-rls.sql
\ir patient-media-playback-telemetry-accessors.sql
\ir phase4-force-rls-cutover.sql

DO $test_strict_specialized_policy_assertions$
DECLARE
  v_courses_using text;
  v_invites_using text;
  v_media_files_using text;
  v_media_jobs_using text;
  v_invite_definer_count integer;
BEGIN
  SELECT lower(pg_get_expr(policy.polqual, policy.polrelid))
  INTO v_courses_using
  FROM pg_policy policy
  WHERE policy.polrelid = 'public.courses'::regclass
    AND policy.polname = 'saas_org_dormant_p0_8_3';

  IF v_courses_using IS NULL
     OR position('app.current_patient_user_id()' IN v_courses_using) = 0
     OR position('b4course_instance' IN v_courses_using) = 0
     OR position('treatment_program_instances' IN v_courses_using) = 0 THEN
    RAISE EXCEPTION 'test_strict_courses_assignment_policy_missing';
  END IF;

  SELECT lower(pg_get_expr(policy.polqual, policy.polrelid))
  INTO v_invites_using
  FROM pg_policy policy
  WHERE policy.polrelid = 'public.organization_member_invites'::regclass
    AND policy.polname = 'saas_org_dormant_p0_8_3';

  IF v_invites_using IS NULL
     OR position('current_user' IN v_invites_using) <> 0
     OR position('app.is_staff()' IN v_invites_using) = 0
     OR position('app.current_org_id()' IN v_invites_using) = 0
     OR position('current_setting' IN v_invites_using) <> 0 THEN
    RAISE EXCEPTION 'test_strict_invites_fail_closed_policy_missing';
  END IF;

  SELECT count(*)
  INTO v_invite_definer_count
  FROM pg_proc procedure
  JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
  WHERE procedure.oid IN (
    'app.lookup_pending_org_invite(text)'::regprocedure,
    'app.accept_org_invite(text,uuid,text)'::regprocedure
  )
    AND procedure.prosecdef
    AND owner_role.rolname = 'app_owner'
    AND owner_role.rolbypassrls
    AND NOT owner_role.rolcanlogin;

  IF v_invite_definer_count <> 2
     OR NOT has_table_privilege('app_owner', 'public.organization_member_invites', 'SELECT,UPDATE')
     OR NOT has_table_privilege('app_owner', 'public.be_organizations', 'SELECT')
     OR NOT has_table_privilege('app_owner', 'public.platform_users', 'SELECT,UPDATE')
     OR NOT has_table_privilege('app_owner', 'public.be_organization_members', 'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'test_strict_invite_definer_boundary_missing';
  END IF;

  SELECT lower(pg_get_expr(policy.polqual, policy.polrelid))
  INTO v_media_files_using
  FROM pg_policy policy
  WHERE policy.polrelid = 'public.media_files'::regclass
    AND policy.polname = 'saas_org_dormant_p0_8_3';

  SELECT lower(pg_get_expr(policy.polqual, policy.polrelid))
  INTO v_media_jobs_using
  FROM pg_policy policy
  WHERE policy.polrelid = 'public.media_transcode_jobs'::regclass
    AND policy.polname = 'saas_org_dormant_p0_8_4';

  IF v_media_files_using IS NULL
     OR v_media_jobs_using IS NULL
     OR position('app_worker' IN v_media_files_using) = 0
     OR position('app_worker' IN v_media_jobs_using) = 0 THEN
    RAISE EXCEPTION 'test_strict_app_worker_media_policy_missing';
  END IF;

  IF NOT has_table_privilege('app_patient', 'public.courses', 'SELECT') THEN
    RAISE EXCEPTION 'test_strict_courses_patient_select_grant_missing';
  END IF;

  IF NOT has_function_privilege('app_patient', 'app.lookup_pending_org_invite(text)', 'EXECUTE')
     OR NOT has_function_privilege('app_patient', 'app.accept_org_invite(text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'test_strict_invite_accessor_grants_missing';
  END IF;
END
$test_strict_specialized_policy_assertions$;
