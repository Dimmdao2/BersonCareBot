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
--   1. reminder_journal INSERT (rule_id, occurrence_id, action, snooze_until, skip_reason)
--      apps/webapp/src/infra/repos/pgReminderJournal.ts:159-168 (recordDone), :283-303 (recordSnooze),
--      :329-354 (recordSkip). Caller chain: POST /api/patient/reminders/[id]/done|snooze|skip and
--      /api/patient/reminders/occurrences/[id]/snooze|skip -> apps/webapp/src/modules/reminders/
--      service.ts:446/462/492 (doneOccurrence/snoozeOccurrence/skipOccurrence) ->
--      deps.journal.recordDone/recordSnooze/recordSkip. app_patient currently has only
--      ('public','reminder_journal','SELECT') (deploy/postgres/p0-5b-grants.sql:370).
--      IMPORTANT CAVEAT: recordSnooze and recordSkip ALSO UPDATE reminder_occurrence_history in the
--      same transaction, BEFORE the reminder_journal INSERT runs -- see the reminder_occurrence_history
--      exception note below. This overlay's reminder_journal grant alone fully unblocks recordDone
--      (which never touches reminder_occurrence_history), but recordSnooze/recordSkip will still 42501
--      on the reminder_occurrence_history UPDATE and roll back before reaching reminder_journal, until
--      that separate owner-gated decision is resolved.
--
--   2. treatment_program_instances UPDATE (updated_at)
--      apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:212-220 (touchInstanceUpdatedAt),
--      called from setStageItemCompletedAt (:699) and updateInstanceStageMetadata (:673) and several
--      insert-item paths. Caller chain: POST .../progress/complete and .../progress/touch ->
--      apps/webapp/src/modules/treatment-program/progress-service.ts patientCompleteSimpleItem (:260)
--      / patientTouchStageItemInner (:219) -> instances.setStageItemCompletedAt /
--      instances.updateInstanceStage. app_patient currently has only
--      ('public','treatment_program_instances','SELECT') (p0-5b-grants.sql:386).
--
--   3. treatment_program_instance_stages UPDATE (status, skip_reason, started_at)
--      apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:606-634 (updateInstanceStage; the
--      same statement shape also does a cascading UPDATE of the NEXT stage's status to "available" at
--      :632, same three-column surface, different row of the same table/instance). Caller chain:
--      progress-service.ts:233 patientTouchStageItemInner -> instances.updateInstanceStage(...,
--      {status:"in_progress"}), fired on the first patient touch of any item in a stage. app_patient
--      currently has only ('public','treatment_program_instance_stages','SELECT') (p0-5b-grants.sql:385).
--
--   4. treatment_program_instance_stage_items UPDATE (completed_at)
--      apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:694-698 (setStageItemCompletedAt).
--      Caller chain: same as #2, progress-service.ts:290. app_patient currently has only
--      ('public','treatment_program_instance_stage_items','SELECT') (p0-5b-grants.sql:384).
--
--   5. patient_daily_warmup_presentations UPDATE
--      (content_page_id, updated_at, last_rotation_at, skip_next_scheduled_rotation)
--      pgPatientDailyWarmupPresentation.upsertPresentationState uses ON CONFLICT DO UPDATE.
--      Caller chain: POST /api/patient/practice/completion with source=daily_warmup ->
--      advanceDailyWarmupPresentationManually -> upsertPresentationState. TEST runtime proved the
--      missing UPDATE grant as SQLSTATE 42501 on 2026-07-30. The baseline remains SELECT, INSERT;
--      this overlay grants only the four presentation-state columns the upsert actually changes.
--
--   6. patient_practice_completions UPDATE (feeling)
--      pgPatientPracticeCompletions.applyDailyWarmupFeeling updates only `feeling` for the exact
--      completion id + authenticated patient user id. Caller chain: PATCH
--      /api/patient/practice/completion/[id]/feeling -> applyDailyWarmupFeeling. TEST runtime proved
--      the missing UPDATE grant as SQLSTATE 42501 on 2026-07-30. The baseline remains SELECT, INSERT;
--      this overlay grants only the one column changed by that route.
--
-- Why these six are RLS-safe to grant (same reasoning as patient-support-mark-read-grant.sql -- RLS
-- restricts ROWS, a grant never widens rows, only which columns may appear in the SET/INSERT list):
--   - reminder_journal: policy "saas_org_dormant_p0_8_3" (scratchpad/isolation-flagged-rls-policies.txt)
--     WITH CHECK admits a patient-context row only when
--     EXISTS(reminder_rules WHERE id = reminder_journal.rule_id AND platform_user_id =
--     current_patient_user_id()) -- a patient can only ever insert a journal row tied to THEIR OWN
--     reminder rule; cross-patient rule_id values are rejected by WITH CHECK, not merely hidden.
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
--   - reminder_occurrence_history (UPDATE snoozed_at/snoozed_until in recordSnooze; skipped_at/
--     skip_reason in recordSkip, pgReminderJournal.ts:283-289 and :329-339): policy
--     "saas_org_dormant_p0_8_4" WITH CHECK is scoped by integrator_user_id = current_integrator_user_id(),
--     which has NO patient branch at all (scratchpad/isolation-flagged-rls-policies.txt). A patient
--     session's current_integrator_user_id() is not populated the way this policy expects, so even
--     with a grant, WITH CHECK would not admit the patient's own row -- this is a genuine design gap,
--     not a missing grant, and needs an owner call (add a patient-branch policy vs. route this write
--     through a SECURITY DEFINER RPC the way product analytics already does -- see below). See
--     the isolation-42501-fix-prep.md report's "Exceptions design note" section for the full writeup.
--
--     CORRECTION 2026-07-26 (taskdb #1018): this note originally scoped the gap to recordSnooze/
--     recordSkip's UPDATE only. It also broke recordDone -- recordDone's pre-write ownership SELECT
--     (pgReminderJournal.ts:145-151, `reminder_occurrence_history JOIN platform_users ... WHERE
--     pu.id = platformUserId`) hit the SAME RLS policy with no patient branch and came back zero
--     rows (not a 42501 -- app_patient's SELECT-level table grant on reminder_occurrence_history
--     already existed; RLS silently filtered every row), so recordDone 404'd too, upstream of and
--     independent from this overlay's reminder_journal INSERT grant. The "add a patient-branch
--     policy" side of the owner call above is now resolved: deploy/postgres/
--     phase4-locked-helper-rls-policies.sql's saas_org_dormant_p0_8_4 for reminder_occurrence_history
--     now carries a patient branch bridged through platform_users.integrator_user_id (see
--     docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs patientChainOwnedTables). That
--     resolves recordDone fully (it never writes to reminder_occurrence_history) and unblocks the
--     ownership SELECT for recordSnooze/recordSkip too, but recordSnooze/recordSkip still need the
--     UPDATE column grant this overlay excludes here -- until that grant is added, they will pass
--     the ownership check and then 42501 on the UPDATE (caught and surfaced as the same 404), so
--     they remain broken end-to-end even after the RLS fix. That UPDATE-grant decision was NOT part
--     of taskdb #1018's scope and is still open.
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
\echo 'Patient write grants (role_pool_mismatch) DOWN: revoking the six INSERT/UPDATE column grants from app_patient.'

REVOKE INSERT ("rule_id", "occurrence_id", "action", "snooze_until", "skip_reason")
  ON TABLE "public"."reminder_journal" FROM app_patient;

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
\echo 'Patient write grants (role_pool_mismatch) UP: granting reminder_journal INSERT + treatment_program_instance*, warmup presentation and warmup feeling UPDATE column grants to app_patient.'

GRANT INSERT ("rule_id", "occurrence_id", "action", "snooze_until", "skip_reason")
  ON TABLE "public"."reminder_journal" TO app_patient;

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
