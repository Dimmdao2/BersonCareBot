-- Phase 4 / C1 walls: narrow app_worker RLS exception for tenant-agnostic dispatch tables.
--
-- Context: media-worker (and any other pure-dispatch background process) connects under the
-- "infra" DB principal — by design (see docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md)
-- it never installs a signed org/patient context and never SET ROLEs to app_staff/app_patient,
-- because the rows it touches were already tenant-filtered at enqueue/upload time in a staff or
-- patient session. Under phase4-locked-helper-rls-policies.sql's enforce-mode predicates
-- (phase4_enforce_locked_context=1), that leaves a bare `app_worker`-shaped connection with ZERO
-- visibility on tables whose only USING clauses require is_staff()+org-match or a patient context —
-- table-level GRANTs alone can't fix this, since RLS is a row filter independent of GRANTs.
--
-- This script adds ONE additional OR-branch — `pg_has_role(current_user, 'app_worker', 'member')`
-- — to the enforce-mode policy on the specific narrow set of tables a pure-dispatch worker
-- actually touches (grounded from code: apps/media-worker/src/{pipelineEnabled,processTranscodeJob,
-- jobs/claim}.ts). It intentionally does NOT touch every FORCE-RLS table — only the ones an
-- infra-principal connection is known to need — so a compromised/broad app_worker role still can't
-- read arbitrary tenant data outside this narrow surface.
--
-- Idempotent: safe to re-run. Requires phase4-locked-helper-rls-policies.sql (enforce mode) and
-- p0-5b-role-split-staff-patient.sql (app_staff/app_patient) to already be applied, and the
-- `app_worker` role to exist.
--
-- Rollback: re-run with -v phase4_app_worker_narrow_rls_down=1 to restore the pre-patch (enforce
-- mode, no worker branch) policy text for the same two tables.

\set ON_ERROR_STOP on
\pset pager off

\if :{?phase4_app_worker_narrow_rls_down}
BEGIN;

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_files";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_files"
  FOR ALL
  USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()))))
  WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()))));

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs";
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs"
  FOR ALL
  USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) ))))
  WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) ))));

COMMIT;
\echo 'app_worker narrow RLS exception DOWN complete.'
\quit
\endif

SELECT 1 / (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker'))::int AS app_worker_role_exists;

BEGIN;

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_files";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_files"
  FOR ALL
  USING ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()))))
  WITH CHECK ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()))));

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs";
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs"
  FOR ALL
  USING ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) ))))
  WITH CHECK ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) ))));

COMMIT;

\echo 'app_worker narrow RLS exception UP complete (media_files, media_transcode_jobs).'
