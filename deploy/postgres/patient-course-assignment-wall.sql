-- Patient-side RLS wall for public.courses (taskdb #708 follow-up / #724 context, 2026-07-13).
--
-- Root cause (confirmed LIVE on bersoncarebot_test, not just from migration files -- the live
-- policy/grant state on this table had already diverged from what the 0160/0177 migration files
-- show, see below): GET /api/patient/courses returned 500 "permission denied for table courses"
-- for a fully-enrolled patient under the app_patient DB role. Two independent problems, both closed
-- here:
--   1. app_patient had NO grant at all on public.courses (SELECT or otherwise) -- `courses` is
--      tiered SCOPED in tiers-218.tsv but was never added to
--      docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs, so the generator that produces
--      deploy/postgres/p0-5b-grants.sql's app_patient table set never picked it up.
--   2. Even with a grant, the table's ONLY policy (live text, confirmed via
--      `select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.courses'::regclass`)
--      is staff/org-only and has NO patient branch at all:
--        USING (app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))
--      -- i.e. a patient session (app.is_staff() = false) would see ZERO rows regardless of grant.
--
-- Why this isn't in the auto-generated P0.8.x migrations: rls-descriptor-model.mjs's patientColumn/
-- patientChain/patientConditional(Chain)/patientPolymorphic descriptor shapes all model "this row
-- belongs to exactly one owning patient row via a direct column or an FK-id chain to one". Courses
-- don't fit that shape: `courses.program_template_id` is a shared reference that MULTIPLE
-- `treatment_program_instances` rows (each for a DIFFERENT patient) can point at via their own
-- `template_id` column -- the relationship is "assigned to me" (an EXISTS match on a shared
-- non-owning column), not "owned by me". Hand-authored here, living outside the generated migration
-- chain -- the exact same precedent as deploy/postgres/p2-b-protected-principal-context.sql for
-- narrow additions the generator doesn't model -- but using the SAME predicate idiom
-- (`app.is_staff()`, `app.current_org_id()`, `app.current_patient_user_id()`) as every other B4
-- patient-wall policy, mirroring `treatment_program_instances`' own live policy text exactly:
--   USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))
--          OR (app.current_patient_user_id() IS NOT NULL AND patient_user_id = app.current_patient_user_id()))
--
-- Product target (owner, taskdb #724, 2026-07-13): a patient sees a course ONLY via assignment in
-- THEIR OWN treatment program (an instance whose template_id equals that course's
-- program_template_id) -- never a full/global catalog. The marketplace/store view (content_access_
-- grants-based purchase) is separate future work (#724), explicitly out of scope here.
--
-- Idempotent / safe to re-run: DROP POLICY IF EXISTS + CREATE POLICY replaces the prior policy in
-- place (same name kept -- "saas_org_dormant_p0_8_3", this table's original P0.8.3 policy name);
-- GRANT is additive and re-runnable.
--
-- Rollback: re-run with -v patient_courses_wall_down=1 -- restores the staff/org-only policy this
-- table had before this script, and revokes the app_patient grant added here.

\set ON_ERROR_STOP on
\pset pager off

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace = n.oid
              WHERE n.nspname = 'app' AND p.proname = 'is_staff')
  AND EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace = n.oid
              WHERE n.nspname = 'app' AND p.proname = 'current_org_id')
  AND EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace = n.oid
              WHERE n.nspname = 'app' AND p.proname = 'current_patient_user_id')
  AND to_regclass('public.courses') IS NOT NULL
  AND to_regclass('public.treatment_program_instances') IS NOT NULL
)::int AS patient_courses_wall_preflight_ok \gset

\if :patient_courses_wall_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient role, app.is_staff()/app.current_org_id()/app.current_patient_user_id(), public.courses, public.treatment_program_instances must all exist.'
SELECT 1 / 0 AS patient_courses_wall_abort;
\endif

\if :{?patient_courses_wall_down}

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."courses";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."courses"
  FOR ALL
  USING (app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))
  WITH CHECK (app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()));

REVOKE SELECT ON TABLE public.courses FROM app_patient;

\echo 'patient-course-assignment-wall DOWN complete: public.courses restored to staff/org-only policy, app_patient grant revoked.'

\else

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."courses";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."courses"
  FOR ALL
  USING (
    (app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))
    OR (
      app.current_patient_user_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."treatment_program_instances" AS "b4course_instance"
        WHERE "b4course_instance"."patient_user_id" = app.current_patient_user_id()
          AND "b4course_instance"."template_id" = "courses"."program_template_id"
      )
    )
  )
  WITH CHECK (
    (app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))
    OR (
      app.current_patient_user_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."treatment_program_instances" AS "b4course_instance"
        WHERE "b4course_instance"."patient_user_id" = app.current_patient_user_id()
          AND "b4course_instance"."template_id" = "courses"."program_template_id"
      )
    )
  );

GRANT SELECT ON TABLE public.courses TO app_patient;

\echo 'patient-course-assignment-wall UP complete: public.courses patient-assignment RLS + app_patient SELECT grant applied.'

\endif
