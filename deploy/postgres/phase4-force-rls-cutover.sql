-- Phase 4 final RLS cutover.
--
-- UP, default:
--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/phase4-force-rls-cutover.sql
--
-- DOWN / rollback:
--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -v phase4_force_rls_down=1 -f deploy/postgres/phase4-force-rls-cutover.sql
--
-- This file intentionally contains no environment references or database names. Operators provide the
-- connection string from the approved rollout context.

\set ON_ERROR_STOP on

\if :{?phase4_force_rls_down}
\else
\set phase4_force_rls_down 0
\endif

SELECT 1 / (:'phase4_force_rls_down' IN ('0', '1'))::int AS phase4_force_rls_down_is_valid;

\if :phase4_force_rls_down
\else
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

SELECT 1 / (
  length(:'phase4_bootstrap_base_role') > 0
  AND length(:'phase4_staff_role') > 0
  AND length(:'phase4_owner_role') > 0
  AND :'phase4_bootstrap_base_role' <> :'phase4_staff_role'
  AND :'phase4_bootstrap_base_role' <> :'phase4_owner_role'
  AND :'phase4_staff_role' <> :'phase4_owner_role'
)::int AS phase4_bootstrap_role_names_valid;

SELECT 1 / (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'phase4_bootstrap_base_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'phase4_staff_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'phase4_owner_role')
)::int AS phase4_bootstrap_roles_exist;

SELECT 1 / (
  SELECT (NOT base_role.rolbypassrls AND NOT pg_has_role(base_role.rolname, staff_role.rolname, 'member'))::int
  FROM pg_roles base_role
  CROSS JOIN pg_roles staff_role
  WHERE base_role.rolname = :'phase4_bootstrap_base_role'
    AND staff_role.rolname = :'phase4_staff_role'
) AS phase4_bootstrap_base_role_nobypassrls_not_staff_member;

SELECT 1 / has_function_privilege(:'phase4_bootstrap_base_role', 'app.close_active_user_phone_history(uuid)', 'EXECUTE')::int
  AS phase4_bootstrap_base_role_can_close_phone_history;

SELECT 1 / (
  has_table_privilege(:'phase4_bootstrap_base_role', 'public.user_phone_history', 'SELECT')
  AND has_table_privilege(:'phase4_bootstrap_base_role', 'public.user_phone_history', 'INSERT')
  AND has_table_privilege(:'phase4_bootstrap_base_role', 'public.user_phone_history', 'UPDATE')
)::int AS phase4_bootstrap_base_role_user_phone_history_dml;

SELECT 1 / (
  has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'SELECT')
  AND has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'INSERT')
  AND has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'UPDATE')
)::int AS phase4_bootstrap_base_role_platform_user_contacts_dml;

SELECT 1 / (SELECT rolbypassrls::int FROM pg_roles WHERE rolname = :'phase4_owner_role')
  AS phase4_owner_role_bypassrls;

SELECT 1 / has_table_privilege(:'phase4_owner_role', 'public.user_phone_history', 'UPDATE')::int
  AS phase4_owner_role_can_update_user_phone_history;
\endif

BEGIN;

CREATE TEMP TABLE phase4_force_rls_targets (
  target text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO phase4_force_rls_targets (target)
VALUES
  ('"public"."admin_audit_log"'),
  ('"public"."app_runtime_settings"'),
  ('"public"."app_runtime_settings_audit"'),
  ('"public"."be_appointment_cancellations"'),
  ('"public"."be_appointment_history_events"'),
  ('"public"."be_appointment_no_shows"'),
  ('"public"."be_appointment_reschedules"'),
  ('"public"."be_appointment_staff_comments"'),
  ('"public"."be_appointments"'),
  ('"public"."be_availability_rules"'),
  ('"public"."be_booking_form_fields"'),
  ('"public"."be_booking_form_submissions"'),
  ('"public"."be_branches"'),
  ('"public"."be_cancellation_policies"'),
  ('"public"."be_clinic_services"'),
  ('"public"."be_external_entity_mappings"'),
  ('"public"."be_package_history_events"'),
  ('"public"."be_package_usages"'),
  ('"public"."be_patient_booking_profiles"'),
  ('"public"."be_patient_packages"'),
  ('"public"."be_patient_timeline_events"'),
  ('"public"."be_payment_history_events"'),
  ('"public"."be_payment_intents"'),
  ('"public"."be_payment_provider_events"'),
  ('"public"."be_payments"'),
  ('"public"."be_prepayment_policies"'),
  ('"public"."be_refunds"'),
  ('"public"."be_reschedule_policies"'),
  ('"public"."be_rooms"'),
  ('"public"."be_schedule_blocks"'),
  ('"public"."be_schedule_templates"'),
  ('"public"."be_service_location_availability"'),
  ('"public"."be_specialist_locations"'),
  ('"public"."be_specialist_rooms"'),
  ('"public"."be_specialist_service_availability"'),
  ('"public"."be_specialists"'),
  ('"public"."be_subscription_packages"'),
  ('"public"."be_working_days"'),
  ('"public"."be_working_hours"'),
  ('"public"."broadcast_audit"'),
  ('"public"."clinical_anamnesis_illness"'),
  ('"public"."clinical_anamnesis_lifestyle"'),
  ('"public"."clinical_anamnesis_trauma"'),
  ('"public"."clinical_complaint"'),
  ('"public"."clinical_diagnosis"'),
  ('"public"."clinical_diagnosis_catalog"'),
  ('"public"."clinical_test_regions"'),
  ('"public"."clinical_visit"'),
  ('"public"."clinic_public_directory_entries"'),
  ('"public"."content_access_grants_webapp"'),
  ('"public"."content_pages"'),
  ('"public"."content_sections"'),
  ('"public"."courses"'),
  ('"public"."doctor_notes"'),
  ('"public"."doctor_patient_support"'),
  ('"public"."lfk_complex_templates"'),
  ('"public"."lfk_complexes"'),
  ('"public"."lfk_exercise_regions"'),
  ('"public"."lfk_exercises"'),
  ('"public"."lfk_sessions"'),
  ('"public"."material_ratings"'),
  ('"public"."media_files"'),
  ('"public"."media_folders"'),
  ('"public"."media_hls_proxy_error_events"'),
  ('"public"."media_playback_client_events"'),
  ('"public"."media_playback_resolution_events"'),
  ('"public"."media_playback_user_video_first_resolve"'),
  ('"public"."media_upload_sessions"'),
  ('"public"."message_log"'),
  ('"public"."motivational_quotes"'),
  ('"public"."online_intake_requests"'),
  ('"public"."operator_health_failure_archive"'),
  ('"public"."organization_member_invites"'),
  ('"public"."patient_comorbidity"'),
  ('"public"."patient_content_rating_feedback"'),
  ('"public"."patient_daily_warmup_presentations"'),
  ('"public"."patient_diary_day_snapshots"'),
  ('"public"."patient_files"'),
  ('"public"."patient_home_blocks"'),
  ('"public"."patient_invites"'),
  ('"public"."patient_lfk_assignments"'),
  ('"public"."patient_merge_candidates"'),
  ('"public"."patient_payment"'),
  ('"public"."patient_practice_completions"'),
  ('"public"."patient_specialist_links"'),
  ('"public"."product_analytics_events_recent"'),
  ('"public"."product_analytics_user_hourly"'),
  ('"public"."product_push_notifications"'),
  ('"public"."recommendation_regions"'),
  ('"public"."recommendations"'),
  ('"public"."reference_categories"'),
  ('"public"."reminder_journal"'),
  ('"public"."reminder_rules"'),
  ('"public"."saas_org_entitlement_overrides"'),
  ('"public"."saas_organization_trials"'),
  ('"public"."specialist_tasks"'),
  ('"public"."support_conversations"'),
  ('"public"."support_questions"'),
  ('"public"."symptom_trackings"'),
  ('"public"."test_attempts"'),
  ('"public"."test_sets"'),
  ('"public"."tests"'),
  ('"public"."treatment_program_instances"'),
  ('"public"."treatment_program_templates"'),
  ('"public"."be_package_items"'),
  ('"public"."be_patient_package_items"'),
  ('"public"."broadcast_audit_recipients"'),
  ('"public"."clinical_complaint_update"'),
  ('"public"."clinical_diagnosis_status_history"'),
  ('"public"."clinical_diagnosis_update"'),
  ('"public"."content_section_slug_history"'),
  ('"public"."lfk_complex_exercises"'),
  ('"public"."lfk_complex_template_exercises"'),
  ('"public"."lfk_exercise_media"'),
  ('"public"."media_transcode_jobs"'),
  ('"public"."notification_delivery_attempts"'),
  ('"public"."online_intake_answers"'),
  ('"public"."online_intake_attachments"'),
  ('"public"."online_intake_status_history"'),
  ('"public"."patient_daily_warmup_video_views"'),
  ('"public"."patient_home_block_items"'),
  ('"public"."program_action_log"'),
  ('"public"."program_item_discussion_messages"'),
  ('"public"."program_item_discussion_reads"'),
  ('"public"."reference_items"'),
  ('"public"."reminder_delivery_events"'),
  ('"public"."reminder_occurrence_history"'),
  ('"public"."support_conversation_messages"'),
  ('"public"."support_delivery_events"'),
  ('"public"."support_question_messages"'),
  ('"public"."symptom_entries"'),
  ('"public"."test_results"'),
  ('"public"."test_set_items"'),
  ('"public"."treatment_program_events"'),
  ('"public"."treatment_program_instance_stage_groups"'),
  ('"public"."treatment_program_instance_stage_items"'),
  ('"public"."treatment_program_instance_stages"'),
  ('"public"."treatment_program_template_stage_groups"'),
  ('"public"."treatment_program_template_stage_items"'),
  ('"public"."treatment_program_template_stages"'),
  ('"integrator"."user_reminder_delivery_logs"'),
  ('"integrator"."user_reminder_occurrences"'),
  ('"public"."platform_user_contacts"'),
  ('"public"."system_settings"'),
  ('"public"."user_phone_history"'),
  ('"public"."org_enrollments"'),
  ('"public"."broadcast_drafts"'),
  ('"public"."system_settings_audit"'),
  ('"public"."comments"');

\if :phase4_force_rls_down
SELECT format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY;', target)
FROM phase4_force_rls_targets
ORDER BY target
\gexec
\else
SELECT format('ALTER TABLE %s FORCE ROW LEVEL SECURITY;', target)
FROM phase4_force_rls_targets
ORDER BY target
\gexec
\endif

CREATE TEMP TABLE phase4_force_expected_state (
  force_enabled boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO phase4_force_expected_state (force_enabled)
VALUES (:'phase4_force_rls_down' = '0');

DO $phase4_force_post_assert$
DECLARE
  v_expected_count integer;
  v_resolved_count integer;
  v_invalid_count integer;
BEGIN
  SELECT count(*) INTO v_expected_count FROM phase4_force_rls_targets;

  SELECT count(*)
  INTO v_resolved_count
  FROM phase4_force_rls_targets targets
  JOIN pg_class relation ON relation.oid = targets.target::regclass
  WHERE relation.relkind IN ('r', 'p');

  IF v_resolved_count <> v_expected_count THEN
    RAISE EXCEPTION 'phase4_force_target_resolution_mismatch: expected %, resolved %',
      v_expected_count, v_resolved_count;
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM phase4_force_rls_targets targets
  JOIN pg_class relation ON relation.oid = targets.target::regclass
  WHERE NOT relation.relrowsecurity
     OR relation.relforcerowsecurity <> (SELECT force_enabled FROM phase4_force_expected_state);

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'phase4_force_post_assert_failed: % of % targets have unexpected ENABLE/FORCE state',
      v_invalid_count, v_expected_count;
  END IF;
END
$phase4_force_post_assert$;

COMMIT;
