-- Patient write-surface grants for role_pool_mismatch:webapp:webapp_db_request (TEST isolation
-- telemetry, 13 occ, taskdb/isolation-42501 defect class).
--
-- Context / defect (same class already fixed once for support mark-read, see
-- deploy/postgres/patient-support-mark-read-grant.sql): several patient-facing webapp routes issue
-- direct INSERT/UPDATE statements under the app_patient DB role (nonstaff pool,
-- apps/webapp/src/infra/db/webappPoolProvider.ts:213-216 routes principal.kind "patient" to the
-- nonstaff pool) against tables where app_patient's baseline grant
-- (deploy/postgres/p0-5b-grants.sql) is SELECT-only. Postgres checks column-level INSERT/UPDATE
-- privilege at parse/rewrite time, independent of row count or RLS -- the statement fails with
-- SQLSTATE 42501 (aclcheck_error) before RLS is ever evaluated. The webapp's isolation reporter
-- (packages/db-principal/src/index.ts classifySaasIsolationFailure) classifies exactly this shape as
-- role_pool_mismatch.
--
-- Confirmed op/column/reachability matrix (current code read 2026-07-24/30, all five repo methods are
-- reached from a patient-authenticated route gated by requirePatientApiBusinessAccess, which sets
-- principal.kind = "patient" -> nonstaff/app_patient pool):
--
--   1. treatment_program_instances UPDATE (updated_at)
--      apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:212-220 (touchInstanceUpdatedAt),
--      called from setStageItemCompletedAt (:699) and updateInstanceStageMetadata (:673) and several
--      insert-item paths. Caller chain: POST .../progress/complete and .../progress/touch ->
--      apps/webapp/src/modules/treatment-program/progress-service.ts patientCompleteSimpleItem (:260)
--      / patientTouchStageItemInner (:219) -> instances.setStageItemCompletedAt /
--      instances.updateInstanceStage. app_patient currently has only
--      ('public','treatment_program_instances','SELECT') (p0-5b-grants.sql:386).
--
--   2. treatment_program_instance_stages UPDATE (status, skip_reason, started_at)
--      apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:606-634 (updateInstanceStage; the
--      same statement shape also does a cascading UPDATE of the NEXT stage's status to "available" at
--      :632, same three-column surface, different row of the same table/instance). Caller chain:
--      progress-service.ts:233 patientTouchStageItemInner -> instances.updateInstanceStage(...,
--      {status:"in_progress"}), fired on the first patient touch of any item in a stage. app_patient
--      currently has only ('public','treatment_program_instance_stages','SELECT') (p0-5b-grants.sql:385).
--
--   3. treatment_program_instance_stage_items UPDATE (completed_at)
--      apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:694-698 (setStageItemCompletedAt).
--      Caller chain: same as #2, progress-service.ts:290. app_patient currently has only
--      ('public','treatment_program_instance_stage_items','SELECT') (p0-5b-grants.sql:384).
--
--   4. patient_daily_warmup_presentations UPDATE
--      (content_page_id, updated_at, last_rotation_at, skip_next_scheduled_rotation)
--      pgPatientDailyWarmupPresentation.upsertPresentationState uses ON CONFLICT DO UPDATE.
--      Caller chain: POST /api/patient/practice/completion with source=daily_warmup ->
--      advanceDailyWarmupPresentationManually -> upsertPresentationState. TEST runtime proved the
--      missing UPDATE grant as SQLSTATE 42501 on 2026-07-30. The baseline remains SELECT, INSERT;
--      this overlay grants only the four presentation-state columns the upsert actually changes.
--
--   5. patient_practice_completions UPDATE (feeling)
--      pgPatientPracticeCompletions.applyDailyWarmupFeeling updates only `feeling` for the exact
--      completion id + authenticated patient user id. Caller chain: PATCH
--      /api/patient/practice/completion/[id]/feeling -> applyDailyWarmupFeeling. TEST runtime proved
--      the missing UPDATE grant as SQLSTATE 42501 on 2026-07-30. The baseline remains SELECT, INSERT;
--      this overlay grants only the one column changed by that route.
--
-- Why these five are RLS-safe to grant (same reasoning as patient-support-mark-read-grant.sql -- RLS
-- restricts ROWS, a grant never widens rows, only which columns may appear in the SET/INSERT list):
--   - treatment_program_instances / _stages / _stage_items: policy "saas_org_dormant_p0_8_3" /
--     "saas_org_dormant_p0_8_4" WITH CHECK admits a patient-context row only when the instance's
--     patient_user_id (directly, or via the stage/instance FK chain) equals current_patient_user_id().
--     A patient can only update rows in their OWN treatment program instance.
--   - patient_daily_warmup_presentations: policy "saas_org_dormant_p0_8_3" admits a patient-context
--     row only when user_id = current_patient_user_id(). The column grant excludes user_id and
--     organization_id, so the patient can only advance state on their own presentation row.
--   - patient_practice_completions: the same policy admits a patient-context row only when
--     user_id = current_patient_user_id(). The column grant excludes user_id, organization_id and
--     every completion identity/source field, so the patient can only attach feeling to their own
--     existing completion.
--
-- EXCLUDED from this overlay (do NOT grant here -- see analysis, owner/orchestrator decision needed
-- or already resolved elsewhere):
--
--   - product_analytics_hourly (org-GUC-scoped policy "c4_web_push_reminder_org", RLS not patient-aware):
--     confirmed NOT reachable by app_patient at all -- see next bullet, the entire patient analytics
--     ingest path bypasses direct table grants.
--
--   - product_analytics_events_recent and product_analytics_user_hourly: these appeared as
--     SAFE-GRANT candidates in the prior diagnostic (scratchpad/isolation-42501-matrix.md), but
--     re-reading the CURRENT code (apps/webapp/src/infra/repos/pgProductAnalytics.ts:145-182,
--     recordEventsBatch/recordPushOpen) shows the patient branch (principal.kind === "patient") no
--     longer does a direct table INSERT/UPSERT at all -- it calls the SECURITY DEFINER RPC functions
--     app.record_current_patient_analytics_event / app.record_current_patient_push_open
--     (apps/webapp/db/drizzle-migrations/0200_current_patient_product_analytics.sql), which already
--     have GRANT EXECUTE ... TO app_patient (deploy/postgres/e1-webapp-runtime-config.sql:195-198,
--     wired into deploy via deploy/host/deploy-test-saas.sh) and write all three product_analytics_*
--     tables as the function owner (app_owner), not as app_patient. The direct-table helper functions
--     insertRecent/upsertHourlyCount/upsertUserHourly in pgProductAnalytics.ts are only reached from
--     the non-patient (staff/org) branch, which runs under app_staff's full-table grant. These three
--     tables are therefore FALSE POSITIVES for this overlay -- confirmed not reachable by app_patient
--     at runtime, granting them would only widen privilege with no defect to fix. Excluded.
--
-- Dormant boundary (same as patient-support-mark-read-grant.sql): this overlay only adds GRANTs to
-- the already-existing app_patient role. It does not change DATABASE_URL, switch any runtime process,
-- alter RLS policies, or touch reminder_occurrence_history / product_analytics_*.
--
-- No psql variables required (role name is fixed) -- invoke directly:
--   psql '<database-url>' -f deploy/postgres/patient-write-grants-role-pool-mismatch.sql
--
-- Rollback:
--   Re-run with -v patient_write_grants_role_pool_mismatch_down=1.

\set ON_ERROR_STOP on
\pset pager off

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')::int AS patient_write_grants_role_exists \gset

\if :patient_write_grants_role_exists
\else
\echo 'FATAL: app_patient must already exist -- run p0-5b-role-split-staff-patient.sql first.'
SELECT 1 / 0 AS patient_write_grants_role_pool_mismatch_abort;
\endif

\if :{?patient_write_grants_role_pool_mismatch_down}
\echo 'Patient write grants (role_pool_mismatch) DOWN: revoking the five UPDATE column grants from app_patient.'

REVOKE UPDATE ("updated_at")
  ON TABLE "public"."treatment_program_instances" FROM app_patient;

REVOKE UPDATE ("status", "skip_reason", "started_at")
  ON TABLE "public"."treatment_program_instance_stages" FROM app_patient;

REVOKE UPDATE ("completed_at")
  ON TABLE "public"."treatment_program_instance_stage_items" FROM app_patient;

REVOKE UPDATE ("content_page_id", "updated_at", "last_rotation_at", "skip_next_scheduled_rotation")
  ON TABLE "public"."patient_daily_warmup_presentations" FROM app_patient;

REVOKE UPDATE ("feeling")
  ON TABLE "public"."patient_practice_completions" FROM app_patient;

\echo 'Patient write grants (role_pool_mismatch) DOWN complete.'
\else
\echo 'Patient write grants (role_pool_mismatch) UP: granting treatment_program_instance*, warmup presentation and warmup feeling UPDATE column grants to app_patient.'

GRANT UPDATE ("updated_at")
  ON TABLE "public"."treatment_program_instances" TO app_patient;

GRANT UPDATE ("status", "skip_reason", "started_at")
  ON TABLE "public"."treatment_program_instance_stages" TO app_patient;

GRANT UPDATE ("completed_at")
  ON TABLE "public"."treatment_program_instance_stage_items" TO app_patient;

GRANT UPDATE ("content_page_id", "updated_at", "last_rotation_at", "skip_next_scheduled_rotation")
  ON TABLE "public"."patient_daily_warmup_presentations" TO app_patient;

GRANT UPDATE ("feeling")
  ON TABLE "public"."patient_practice_completions" TO app_patient;

\echo 'Patient write grants (role_pool_mismatch) UP complete.'
\endif
