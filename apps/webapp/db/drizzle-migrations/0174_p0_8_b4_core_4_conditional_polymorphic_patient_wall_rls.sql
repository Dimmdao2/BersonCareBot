-- 0174: B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660).
--
-- Independent audit of the B4-core-3 census (gpt-5.6-sol) found 3 REAL patient-owned SCOPED tables
-- still org-only under the dormant policy family — the "hard" cases (conditional/dual-role owner
-- columns, and polymorphic target resolution) that B4-core/B4-core-3 deliberately excluded from the
-- plain patientOwnedColumns/patientChainOwnedTables registries because a bare column-equality or
-- chain predicate would have either incorrectly walled off legitimate org-wide content, or
-- incorrectly left a patient's own submission open to other patients. This migration closes them
-- with two NEW predicate shapes (rls-descriptor-model.mjs `patientConditionalOwnedColumns` /
-- `patientConditionalChainOwnedTables` / `patientPolymorphicOwnedTables`, rls-sql-renderer.mjs
-- `renderConditionalPatientPredicate` / `renderConditionalChainPatientPredicate` /
-- `renderPolymorphicPatientPredicate`) — same fail-closed staff-or-patient shape as every other
-- B4-core migration: `org AND (staff OR <patient-branch>)`, staff (app.actor='staff') unaffected
-- (org-wide, variant A), unset/empty patient identity denies.
--
-- Targets (3):
--
--   1. public.media_files (P0.8.3, direct_org_column) — dual-role uploaded_by. Verified against
--      apps/webapp/migrations/028_media_files.sql (uploaded_by uuid REFERENCES platform_users(id))
--      and apps/webapp/db/drizzle-migrations/0098_program_item_discussion_stage1.sql (usage_purpose
--      text, CHECK restricts to NULL or 'program_item_submission'). Staff sees everything. A patient
--      sees: (a) every row that is NOT a per-patient submission (usage_purpose IS DISTINCT FROM
--      'program_item_submission' — IS DISTINCT FROM, not <>, so a NULL usage_purpose — which also
--      means "shared" — is not silently excluded by 3-valued NULL logic) OR (b) a submission it
--      uploaded itself (uploaded_by = the requesting patient). Never another patient's submission.
--
--   2. public.media_transcode_jobs (P0.8.4, denorm_org_column) — no ownership column of its own;
--      inherits media_files' conditional ownership via its media_id FK (verified NOT NULL REFERENCES
--      media_files(id) in apps/webapp/db/drizzle-migrations/0019_media_transcode_jobs_queue.sql).
--      Same dual-role EXISTS shape as media_files, one hop away.
--
--   3. public.comments (P0.8.4, polymorphic_resolver) — target_type/target_id. Previously had NO RLS
--      policy at all (P0.8.4's generator hard-blocked it behind P0.12.1). P0.12.1 is now complete
--      (docs/_TODO/SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md: resolver documented, org column
--      materialized in 0154_p0_4_d_polymorphic_denorm_org.sql, all 9 target_type values verified by
--      check-p0-12-polymorphic-references.mjs). Of the 9 target_type values, 5 are org catalog/
--      content rows with no per-patient owner (exercise, test, test_set, recommendation, lesson) —
--      those stay visible to any org member, patients included, unchanged. The other 4 resolve to a
--      patient's own treatment-program/lfk instance: program_instance ->
--      treatment_program_instances.patient_user_id; lfk_complex ->
--      lfk_complexes.platform_user_id; stage_instance -> treatment_program_instance_stages ->
--      treatment_program_instances.patient_user_id (1 extra hop — the stage row itself has no direct
--      patient column, same shape already proven for treatment_program_instance_stages in 0172);
--      stage_item_instance -> treatment_program_instance_stage_items ->
--      treatment_program_instance_stages -> treatment_program_instances.patient_user_id (2 extra
--      hops, same shape as treatment_program_instance_stage_items in 0172). A comment on one of
--      these 4 target types is only visible to the owning patient (or staff) — comments.author_id
--      (the comment's author, staff or patient) is never used for ownership; a doctor's comment on a
--      patient's own instance stays visible only to THAT patient, not to other patients.
--
-- The block below is the EXACT generated output of (same policy names as 0160-0173):
--   node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs --sql   (filtered to media_files)
--   node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs --sql   (filtered to
--     media_transcode_jobs + comments)
--
-- Idempotent: ENABLE/FORCE ROW LEVEL SECURITY are no-ops if already set; DROP POLICY IF EXISTS +
-- CREATE POLICY replaces the prior policy of the same name in place (media_files/
-- media_transcode_jobs had a plain org-only policy before this migration; comments had none at all).
--
-- Rollback (ops): DROP POLICY IF EXISTS + re-CREATE the prior predicate for these 3 tables/policy
-- names (git show <this file's previous commit> for media_files/media_transcode_jobs' pre-0174
-- org-only CREATE POLICY statements; comments simply had no policy before this migration, so its
-- rollback is DROP POLICY IF EXISTS with no replacement). No column/table drop, no data change;
-- safe to revert at any time.
--
-- Dormant in prod today: the app DB role still has BYPASSRLS (P0.5/B5 not flipped), so RLS does not
-- apply to any current traffic regardless of this predicate change. This migration only changes what
-- the policy WOULD do under a NOBYPASSRLS role — proven via the extended real-policy smoke
-- (docs/_TODO/SAAS_FOUNDATION/scripts/smoke-r2-real-policy-isolation.mjs), scratch DB only.

ALTER TABLE "public"."media_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_files" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_files";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_files" FOR ALL USING (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid))))) WITH CHECK (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid)))));
ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."comments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."comments";
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."comments" FOR ALL USING (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR ("target_type" = ANY (ARRAY['exercise', 'test', 'test_set', 'recommendation', 'lesson']::text[]) OR ("target_type" = 'program_instance' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4c4_comment_program" WHERE "b4c4_comment_program"."id" = "target_id" AND "b4c4_comment_program"."patient_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))) OR ("target_type" = 'lfk_complex' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4c4_comment_complex" WHERE "b4c4_comment_complex"."id" = "target_id" AND "b4c4_comment_complex"."platform_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))) OR ("target_type" = 'stage_instance' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4c4_comment_stage" JOIN "public"."treatment_program_instances" AS "b4c4_comment_stage_program" ON "b4c4_comment_stage_program"."id" = "b4c4_comment_stage"."instance_id" WHERE "b4c4_comment_stage"."id" = "target_id" AND "b4c4_comment_stage_program"."patient_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))) OR ("target_type" = 'stage_item_instance' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stage_items" AS "b4c4_comment_stage_item" JOIN "public"."treatment_program_instance_stages" AS "b4c4_comment_item_stage" ON "b4c4_comment_item_stage"."id" = "b4c4_comment_stage_item"."stage_id" JOIN "public"."treatment_program_instances" AS "b4c4_comment_item_program" ON "b4c4_comment_item_program"."id" = "b4c4_comment_item_stage"."instance_id" WHERE "b4c4_comment_stage_item"."id" = "target_id" AND "b4c4_comment_item_program"."patient_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))))))) WITH CHECK (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR ("target_type" = ANY (ARRAY['exercise', 'test', 'test_set', 'recommendation', 'lesson']::text[]) OR ("target_type" = 'program_instance' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4c4_comment_program" WHERE "b4c4_comment_program"."id" = "target_id" AND "b4c4_comment_program"."patient_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))) OR ("target_type" = 'lfk_complex' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4c4_comment_complex" WHERE "b4c4_comment_complex"."id" = "target_id" AND "b4c4_comment_complex"."platform_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))) OR ("target_type" = 'stage_instance' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4c4_comment_stage" JOIN "public"."treatment_program_instances" AS "b4c4_comment_stage_program" ON "b4c4_comment_stage_program"."id" = "b4c4_comment_stage"."instance_id" WHERE "b4c4_comment_stage"."id" = "target_id" AND "b4c4_comment_stage_program"."patient_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid ))) OR ("target_type" = 'stage_item_instance' AND (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stage_items" AS "b4c4_comment_stage_item" JOIN "public"."treatment_program_instance_stages" AS "b4c4_comment_item_stage" ON "b4c4_comment_item_stage"."id" = "b4c4_comment_stage_item"."stage_id" JOIN "public"."treatment_program_instances" AS "b4c4_comment_item_program" ON "b4c4_comment_item_program"."id" = "b4c4_comment_item_stage"."instance_id" WHERE "b4c4_comment_stage_item"."id" = "target_id" AND "b4c4_comment_item_program"."patient_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid )))))));
ALTER TABLE "public"."media_transcode_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_transcode_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs";
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs" FOR ALL USING (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid) ))))) WITH CHECK (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid) )))));
