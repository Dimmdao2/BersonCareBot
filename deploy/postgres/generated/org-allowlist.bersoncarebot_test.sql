-- ============================================================================
-- СГЕНЕРИРОВАННЫЙ ФАЙЛ — НЕ РЕДАКТИРОВАТЬ РУКАМИ.
-- источник:   deploy/postgres/privileges/declaration.ts (tables[*].org === true, SCHEME §A.9)
-- генератор:  deploy/postgres/privileges/generate.mjs (версия 1)
-- база:       bersoncarebot_test
-- применение: psql -1 -v ON_ERROR_STOP=1 -f <файл>  (SCHEME §B шаг 6, ПОЛНОЕ переприменение)
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMP TABLE bcb_allowlist_txn_guard ON COMMIT DROP AS SELECT 1 AS one;
DO $bcb$
BEGIN
  IF pg_catalog.to_regclass('pg_temp.bcb_allowlist_txn_guard') IS NULL THEN
    RAISE EXCEPTION 'allowlist применён НЕ одной транзакцией — нужен psql -1 (SCHEME §B)';
  END IF;
  IF pg_catalog.current_database() <> 'bersoncarebot_test' THEN
    RAISE EXCEPTION 'allowlist базы % применён к базе %', 'bersoncarebot_test', pg_catalog.current_database();
  END IF;
END
$bcb$;

WITH declared(schema_name, table_name) AS (VALUES
  ('integrator', 'user_reminder_delivery_logs'),
  ('integrator', 'user_reminder_occurrences'),
  ('public', 'admin_audit_log'),
  ('public', 'app_runtime_settings'),
  ('public', 'app_runtime_settings_audit'),
  ('public', 'be_appointments'),
  ('public', 'be_availability_rules'),
  ('public', 'be_booking_form_fields'),
  ('public', 'be_branches'),
  ('public', 'be_cancellation_policies'),
  ('public', 'be_clinic_services'),
  ('public', 'be_external_entity_mappings'),
  ('public', 'be_organization_members'),
  ('public', 'be_payment_provider_events'),
  ('public', 'be_prepayment_policies'),
  ('public', 'be_reschedule_policies'),
  ('public', 'be_rooms'),
  ('public', 'be_schedule_blocks'),
  ('public', 'be_schedule_templates'),
  ('public', 'be_service_location_availability'),
  ('public', 'be_specialist_locations'),
  ('public', 'be_specialist_rooms'),
  ('public', 'be_specialist_service_availability'),
  ('public', 'be_specialists'),
  ('public', 'be_subscription_packages'),
  ('public', 'be_working_days'),
  ('public', 'be_working_hours'),
  ('public', 'broadcast_audit'),
  ('public', 'broadcast_audit_recipients'),
  ('public', 'broadcast_drafts'),
  ('public', 'clinic_dedicated_bot_bindings'),
  ('public', 'clinic_public_directory_entries'),
  ('public', 'clinical_anamnesis_illness'),
  ('public', 'clinical_anamnesis_lifestyle'),
  ('public', 'clinical_anamnesis_trauma'),
  ('public', 'clinical_complaint'),
  ('public', 'clinical_complaint_update'),
  ('public', 'clinical_diagnosis'),
  ('public', 'clinical_diagnosis_catalog'),
  ('public', 'clinical_diagnosis_status_history'),
  ('public', 'clinical_diagnosis_update'),
  ('public', 'clinical_test_regions'),
  ('public', 'clinical_visit'),
  ('public', 'comments'),
  ('public', 'content_access_grants_webapp'),
  ('public', 'content_pages'),
  ('public', 'content_section_slug_history'),
  ('public', 'content_sections'),
  ('public', 'courses'),
  ('public', 'doctor_notes'),
  ('public', 'doctor_patient_support'),
  ('public', 'lfk_complex_exercises'),
  ('public', 'lfk_complex_template_exercises'),
  ('public', 'lfk_complex_templates'),
  ('public', 'lfk_complexes'),
  ('public', 'lfk_exercise_media'),
  ('public', 'lfk_exercise_regions'),
  ('public', 'lfk_exercises'),
  ('public', 'lfk_sessions'),
  ('public', 'manual_patient_commands'),
  ('public', 'material_ratings'),
  ('public', 'media_files'),
  ('public', 'media_folders'),
  ('public', 'media_hls_proxy_error_events'),
  ('public', 'media_playback_client_events'),
  ('public', 'media_playback_resolution_events'),
  ('public', 'media_playback_user_video_first_resolve'),
  ('public', 'media_transcode_jobs'),
  ('public', 'media_upload_sessions'),
  ('public', 'message_log'),
  ('public', 'motivational_quotes'),
  ('public', 'notification_delivery_attempts'),
  ('public', 'online_intake_answers'),
  ('public', 'online_intake_attachments'),
  ('public', 'online_intake_requests'),
  ('public', 'online_intake_status_history'),
  ('public', 'operator_health_failure_archive'),
  ('public', 'org_brand_revisions'),
  ('public', 'org_enrollments'),
  ('public', 'organization_member_invites'),
  ('public', 'organization_slug_claims'),
  ('public', 'organization_slug_rename_events'),
  ('public', 'outgoing_delivery_queue'),
  ('public', 'patient_bookings'),
  ('public', 'patient_comorbidity'),
  ('public', 'patient_content_rating_feedback'),
  ('public', 'patient_daily_warmup_presentations'),
  ('public', 'patient_daily_warmup_video_views'),
  ('public', 'patient_diary_day_snapshots'),
  ('public', 'patient_files'),
  ('public', 'patient_home_block_items'),
  ('public', 'patient_home_blocks'),
  ('public', 'patient_invites'),
  ('public', 'patient_lfk_assignments'),
  ('public', 'patient_merge_candidates'),
  ('public', 'patient_payment'),
  ('public', 'patient_practice_completions'),
  ('public', 'patient_specialist_links'),
  ('public', 'platform_user_contacts'),
  ('public', 'product_analytics_events_recent'),
  ('public', 'product_analytics_hourly'),
  ('public', 'product_analytics_user_hourly'),
  ('public', 'product_push_notifications'),
  ('public', 'program_action_log'),
  ('public', 'program_item_discussion_messages'),
  ('public', 'program_item_discussion_reads'),
  ('public', 'recommendation_regions'),
  ('public', 'recommendations'),
  ('public', 'reference_catalog_snapshot_receipts'),
  ('public', 'reference_categories'),
  ('public', 'reference_items'),
  ('public', 'reminder_delivery_events'),
  ('public', 'reminder_journal'),
  ('public', 'reminder_occurrence_history'),
  ('public', 'reminder_rules')
),
inserted AS (
  INSERT INTO app_control.org_table_allowlist (schema_name, table_name)
  SELECT schema_name, table_name FROM declared
  ON CONFLICT (schema_name, table_name) DO NOTHING
  RETURNING 1
)
DELETE FROM app_control.org_table_allowlist a
 WHERE NOT EXISTS (SELECT 1 FROM declared d
                    WHERE d.schema_name = a.schema_name AND d.table_name = a.table_name);

-- конец сгенерированного артефакта.
