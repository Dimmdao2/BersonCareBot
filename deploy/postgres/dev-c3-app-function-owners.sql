-- DEV-only C3: align schema `app` function owners with what deploy/postgres/*.sql declares.
--
-- Why this exists (2026-08-01, see docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md §3a):
--   TEST runs deploy/postgres/*.sql on every rollout, and those scripts `ALTER FUNCTION ... OWNER
--   TO app_owner` (or one of a few other fixed NOLOGIN definer roles) for every reviewed schema
--   `app` accessor. Dev has no equivalent automation, so a `pg_restore`/manual-seed dev database
--   drifts: functions stay owned by whichever role created them (`bcb_webapp_dev_user`). Because
--   these functions are SECURITY DEFINER and their tables are FORCE RLS, the wrong owner does not
--   raise a permission error -- `bcb_webapp_dev_user` is a normal login role bound by RLS same as
--   any caller, so the accessor silently returns zero rows. Measured 2026-08-01: of 191 functions
--   in schema `app`, 152 belonged to `bcb_webapp_dev_user` and 39 to `app_owner`.
--
--   This script is the second half of that fix (dev-c1 already gave the two runtime logins schema
--   access; this one moves function ownership itself). Source of truth is exclusively the
--   `ALTER FUNCTION ... OWNER TO <fixed-role>` declarations already committed in deploy/postgres/*.sql
--   -- nothing here is guessed. Two categories of schema-`app` function were deliberately excluded
--   from this script because "required owner" cannot be read off as a fixed literal:
--     (a) ~48 functions whose owning script computes the target from a psql variable resolved at
--         deploy time from another object's CURRENT owner (e.g. organization-member-invites-rls.sql's
--         `:organization_member_invites_owner_ident`, specialist-signup-public-bootstrap-rls.sql's
--         `:specialist_signup_*_owner_ident`, reference-catalog-rls.sql's `:"provisioning_owner"`).
--         Their correct value depends on multi-file deploy order and on what already owns specific
--         tables/functions on THIS database -- reassigning them here would be guessing, not reading.
--     (b) ~64 functions no deploy/postgres/*.sql overlay declares an owner for at all (they were
--         apparently created directly under `SET ROLE app_owner`/similar and never needed an
--         explicit ALTER). These stay on `bcb_webapp_dev_user` untouched; see the accompanying report
--         for the full list. Reassigning them without a script declaration would be inventing scope.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database, after
-- dev-c0-runtime-logins.sql, dev-c1-bootstrap-schema-app-grants.sql, and the earlier p0-5b/p2-b/
-- specialist-owner-provisioning/saas-isolation-telemetry/saas-system-health-diagnostics/
-- c5a-platform-operations-runtime overlays that create the target
-- roles (app_owner, saas_telemetry_owner, saas_system_health_owner, app_platform_settings,
-- app_clinic_billing) and the functions themselves.
--
-- Table/EXECUTE grants below are the narrow, per-function closure a static read of each function's
-- body requires (same failure mode dev-c1 hit with app.is_staff() -- a correctly-owned SECURITY
-- DEFINER function still returns nothing if its owner cannot read its own tables). No schema-wide
-- or ALL-privilege grant is issued; every GRANT line names the one function that needs it.
--
-- Rollback: `ALTER FUNCTION <signature> OWNER TO bcb_webapp_dev_user;` for each row in the VALUES
-- list below, then `REVOKE` the grants listed in the two GRANT sections.
--
-- Idempotent: safe to re-run. The owner realignment only emits ALTER statements for functions whose
-- current owner does not already match; the GRANT statements are natively idempotent in Postgres.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C3 app-function-owner alignment requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C3 app-function-owner alignment requires the exact postgres superuser operator';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_telemetry_owner')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_system_health_owner')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_settings')
  ) THEN
    RAISE EXCEPTION 'DEV C3: one of the four target owner roles is missing -- run the overlay that creates it first (see header comment)';
  END IF;
END
$guard$;

-- 1. Ownership realignment. `required_owner` values below are copied verbatim from the literal
--    `ALTER FUNCTION ... OWNER TO <role>` lines in deploy/postgres/*.sql (dev-c3 report has the
--    per-file breakdown). Only rows whose CURRENT owner differs are touched.
WITH targets(signature, required_owner) AS (
  VALUES
    ('app.get_web_push_vapid_public_key()', 'app_owner'),
    ('app.increment_media_playback_resolution_stat(uuid,uuid,text,boolean)', 'app_owner'),
    ('app.is_current_patient_test_account()', 'app_owner'),
    ('app.list_scheduler_reminder_organization_ids()', 'app_owner'),
    ('app.mark_operator_incident_alert_sent(uuid)', 'app_owner'),
    ('app.operator_incident_alert_already_sent(uuid)', 'app_owner'),
    ('app.read_curated_playback_health()', 'saas_system_health_owner'),
    ('app.read_curated_playback_health_pre_0196()', 'saas_system_health_owner'),
    ('app.read_curated_system_health()', 'saas_system_health_owner'),
    ('app.read_curated_system_health_pre_0196()', 'saas_system_health_owner'),
    ('app.read_current_patient_active_organizations()', 'app_owner'),
    ('app.read_current_patient_appointment_history()', 'app_owner'),
    ('app.read_current_patient_booking_rows(text,timestamptz)', 'app_owner'),
    ('app.read_current_patient_ui_setting(text,text)', 'app_owner'),
    ('app.read_current_org_tariff_transition_usage()', 'app_owner'),
    ('app.read_global_server_runtime_setting(text)', 'app_owner'),
    ('app.read_integrator_smtp_outbound_setting()', 'app_owner'),
    ('app.read_last_saas_isolation_coverage()', 'saas_telemetry_owner'),
    ('app.read_media_worker_runtime_setting(text)', 'app_owner'),
    ('app.read_org_enforced_quota_usage(uuid)', 'app_owner'),
    ('app.read_saas_isolation_events()', 'saas_telemetry_owner'),
    ('app.read_saas_isolation_trend()', 'saas_telemetry_owner'),
    ('app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)', 'app_owner'),
    ('app.record_current_patient_push_open(timestamptz,text,uuid)', 'app_owner'),
    ('app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)', 'app_owner'),
    ('app.record_media_playback_resolution_event(uuid,uuid,text,boolean)', 'app_owner'),
    ('app.record_operator_delivery_attempt(text,text,text,integer,text)', 'app_owner'),
    ('app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer)', 'saas_telemetry_owner'),
    ('app.report_saas_isolation_event(text,text,text,text)', 'saas_telemetry_owner'),
    ('app.resolve_current_patient_treatment_program_organization(uuid)', 'app_owner'),
    ('app.resolve_payment_webhook_organization(text,text,text)', 'app_owner'),
    ('app.resolve_public_booking_organization(uuid,uuid,uuid)', 'app_owner'),
    ('app.resolve_public_organization_by_slug(text)', 'app_owner'),
    ('app.resolve_public_organization_slug(text)', 'app_owner'),
    ('app.set_current_patient_calendar_timezone(text,boolean)', 'app_owner'),
    ('app.start_provisioned_organization_trial()', 'app_platform_settings'),
    ('app.touch_current_patient_plan_last_opened(uuid)', 'app_owner'),
    ('app.touch_current_patient_support_conversation_activity(uuid)', 'app_owner')
)
SELECT count(*) AS dev_c3_owner_realignment_needed
FROM targets AS target
JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
WHERE pg_get_userbyid(procedure.proowner) <> target.required_owner
\gset

\echo 'DEV C3: functions whose owner will change this run:' :dev_c3_owner_realignment_needed

WITH targets(signature, required_owner) AS (
  VALUES
    ('app.get_web_push_vapid_public_key()', 'app_owner'),
    ('app.increment_media_playback_resolution_stat(uuid,uuid,text,boolean)', 'app_owner'),
    ('app.is_current_patient_test_account()', 'app_owner'),
    ('app.list_scheduler_reminder_organization_ids()', 'app_owner'),
    ('app.mark_operator_incident_alert_sent(uuid)', 'app_owner'),
    ('app.operator_incident_alert_already_sent(uuid)', 'app_owner'),
    ('app.read_curated_playback_health()', 'saas_system_health_owner'),
    ('app.read_curated_playback_health_pre_0196()', 'saas_system_health_owner'),
    ('app.read_curated_system_health()', 'saas_system_health_owner'),
    ('app.read_curated_system_health_pre_0196()', 'saas_system_health_owner'),
    ('app.read_current_patient_active_organizations()', 'app_owner'),
    ('app.read_current_patient_appointment_history()', 'app_owner'),
    ('app.read_current_patient_booking_rows(text,timestamptz)', 'app_owner'),
    ('app.read_current_patient_ui_setting(text,text)', 'app_owner'),
    ('app.read_current_org_tariff_transition_usage()', 'app_owner'),
    ('app.read_global_server_runtime_setting(text)', 'app_owner'),
    ('app.read_integrator_smtp_outbound_setting()', 'app_owner'),
    ('app.read_last_saas_isolation_coverage()', 'saas_telemetry_owner'),
    ('app.read_media_worker_runtime_setting(text)', 'app_owner'),
    ('app.read_org_enforced_quota_usage(uuid)', 'app_owner'),
    ('app.read_saas_isolation_events()', 'saas_telemetry_owner'),
    ('app.read_saas_isolation_trend()', 'saas_telemetry_owner'),
    ('app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)', 'app_owner'),
    ('app.record_current_patient_push_open(timestamptz,text,uuid)', 'app_owner'),
    ('app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)', 'app_owner'),
    ('app.record_media_playback_resolution_event(uuid,uuid,text,boolean)', 'app_owner'),
    ('app.record_operator_delivery_attempt(text,text,text,integer,text)', 'app_owner'),
    ('app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer)', 'saas_telemetry_owner'),
    ('app.report_saas_isolation_event(text,text,text,text)', 'saas_telemetry_owner'),
    ('app.resolve_current_patient_treatment_program_organization(uuid)', 'app_owner'),
    ('app.resolve_payment_webhook_organization(text,text,text)', 'app_owner'),
    ('app.resolve_public_booking_organization(uuid,uuid,uuid)', 'app_owner'),
    ('app.resolve_public_organization_by_slug(text)', 'app_owner'),
    ('app.resolve_public_organization_slug(text)', 'app_owner'),
    ('app.set_current_patient_calendar_timezone(text,boolean)', 'app_owner'),
    ('app.start_provisioned_organization_trial()', 'app_platform_settings'),
    ('app.touch_current_patient_plan_last_opened(uuid)', 'app_owner'),
    ('app.touch_current_patient_support_conversation_activity(uuid)', 'app_owner')
)
SELECT format('ALTER FUNCTION %s OWNER TO %I', to_regprocedure(target.signature), target.required_owner)
FROM targets AS target
JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
WHERE pg_get_userbyid(procedure.proowner) <> target.required_owner
ORDER BY target.signature
\gexec

-- 2. Table grants the 38 realigned functions need to actually read/write once they stop being
--    BYPASSRLS-blind and start running as their real (mostly non-BYPASSRLS) definer role. Each line
--    names the function(s) it exists for; derived by reading that function's body, not guessed.

-- app_owner (BYPASSRLS) -- patient/booking/payment/media accessors:
GRANT SELECT ON TABLE public.be_appointments TO app_owner; -- read_current_patient_appointment_history, read_current_patient_booking_rows
GRANT SELECT ON TABLE public.be_branches TO app_owner; -- read_current_patient_appointment_history, read_current_patient_booking_rows, resolve_public_booking_organization
GRANT SELECT ON TABLE public.be_clinic_services TO app_owner; -- read_current_patient_appointment_history, read_current_patient_booking_rows, resolve_public_booking_organization
GRANT SELECT ON TABLE public.be_external_entity_mappings TO app_owner; -- resolve_public_booking_organization
GRANT SELECT ON TABLE public.be_payment_intents TO app_owner; -- resolve_payment_webhook_organization
GRANT SELECT ON TABLE public.be_payment_provider_events TO app_owner; -- resolve_payment_webhook_organization
GRANT SELECT ON TABLE public.be_rooms TO app_owner; -- read_current_patient_appointment_history
GRANT SELECT ON TABLE public.be_specialist_service_availability TO app_owner; -- read_current_patient_booking_rows, resolve_public_booking_organization
GRANT SELECT ON TABLE public.be_specialists TO app_owner; -- read_current_patient_appointment_history, read_current_patient_booking_rows (already has INSERT)
GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_owner; -- resolve_public_organization_slug (already has INSERT)
GRANT SELECT ON TABLE public.media_files TO app_owner; -- increment_media_playback_resolution_stat, record_media_playback_resolution_event
GRANT INSERT ON TABLE public.media_playback_resolution_events TO app_owner; -- record_media_playback_resolution_event
GRANT INSERT ON TABLE public.media_playback_stats_hourly TO app_owner; -- increment_media_playback_resolution_stat
GRANT SELECT, UPDATE ON TABLE public.operator_incidents TO app_owner; -- mark_operator_incident_alert_sent, operator_incident_alert_already_sent
GRANT SELECT ON TABLE public.outgoing_delivery_queue TO app_owner; -- record_operator_delivery_attempt
GRANT SELECT ON TABLE public.patient_bookings TO app_owner; -- read_current_patient_booking_rows
GRANT INSERT ON TABLE public.product_analytics_events_recent TO app_owner; -- record_current_patient_analytics_event, record_current_patient_push_open
GRANT INSERT ON TABLE public.product_analytics_hourly TO app_owner; -- record_current_patient_analytics_event, record_current_patient_push_open
GRANT INSERT ON TABLE public.product_analytics_user_hourly TO app_owner; -- record_current_patient_analytics_event, record_current_patient_push_open
GRANT SELECT ON TABLE public.product_push_notifications TO app_owner; -- record_current_patient_push_open
GRANT SELECT ON TABLE public.support_conversation_messages TO app_owner; -- touch_current_patient_support_conversation_activity
GRANT UPDATE ON TABLE public.support_conversations TO app_owner; -- touch_current_patient_support_conversation_activity
GRANT SELECT ON TABLE public.system_settings TO app_owner; -- get_web_push_vapid_public_key, is_current_patient_test_account, read_current_patient_ui_setting, read_integrator_smtp_outbound_setting
GRANT SELECT, UPDATE ON TABLE public.treatment_program_instances TO app_owner; -- resolve_current_patient_treatment_program_organization, touch_current_patient_plan_last_opened
GRANT SELECT ON TABLE public.user_channel_bindings TO app_owner; -- is_current_patient_test_account

-- saas_system_health_owner (curated ops/health dashboard accessors, NOT BYPASSRLS):
GRANT SELECT ON TABLE public.idempotency_keys TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.integration_webhook_last_status TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.integrator_push_outbox TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.media_files TO saas_system_health_owner; -- read_curated_system_health, read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.media_hls_proxy_error_events TO saas_system_health_owner; -- read_curated_playback_health
GRANT SELECT ON TABLE public.media_playback_client_events TO saas_system_health_owner; -- read_curated_system_health
GRANT SELECT ON TABLE public.media_playback_resolution_events TO saas_system_health_owner; -- read_curated_playback_health_pre_0196
GRANT SELECT ON TABLE public.media_playback_stats_hourly TO saas_system_health_owner; -- read_curated_playback_health_pre_0196
GRANT SELECT ON TABLE public.media_playback_user_video_first_resolve TO saas_system_health_owner; -- read_curated_playback_health_pre_0196
GRANT SELECT ON TABLE public.media_transcode_jobs TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.notification_delivery_attempts TO saas_system_health_owner; -- read_curated_system_health, read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.operator_health_alert_sent TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.operator_incidents TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.operator_job_status TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.outgoing_delivery_queue TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.reminder_delivery_events TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.reminder_occurrence_history TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.system_settings TO saas_system_health_owner; -- read_curated_system_health_pre_0196
GRANT SELECT ON TABLE public.user_web_push_subscriptions TO saas_system_health_owner; -- read_curated_system_health_pre_0196

-- saas_telemetry_owner (SaaS isolation telemetry accessors, NOT BYPASSRLS):
GRANT SELECT, INSERT, DELETE ON TABLE public.saas_isolation_coverage_runs TO saas_telemetry_owner; -- read_last_saas_isolation_coverage, record_saas_isolation_coverage
GRANT SELECT, INSERT, DELETE ON TABLE public.saas_isolation_event_hourly TO saas_telemetry_owner; -- read_saas_isolation_trend, report_saas_isolation_event
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_isolation_events TO saas_telemetry_owner; -- read_saas_isolation_events, record_saas_isolation_coverage, report_saas_isolation_event

-- app_platform_settings (organization trial provisioning):
GRANT INSERT ON TABLE public.admin_audit_log TO app_platform_settings; -- start_provisioned_organization_trial
GRANT INSERT ON TABLE public.saas_organization_trials TO app_platform_settings; -- start_provisioned_organization_trial
GRANT SELECT ON TABLE public.saas_trial_policy TO app_platform_settings; -- start_provisioned_organization_trial
GRANT SELECT ON TABLE public.saas_registration_tariff_policy TO app_platform_settings; -- start_provisioned_organization_trial

-- 3. EXECUTE grants for cross-function calls inside the realigned bodies: a SECURITY DEFINER
--    function calling another app.* function needs EXECUTE on that callee under its OWN (new)
--    owner, independent of table grants.
GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO app_owner; -- called by resolve_public_organization_by_slug
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_platform_settings; -- called by start_provisioned_organization_trial
GRANT EXECUTE ON FUNCTION app.current_provisioned_owner_organization() TO app_platform_settings; -- called by start_provisioned_organization_trial

DO $assertions$
DECLARE
  v_bad_owner text;
BEGIN
  SELECT string_agg(target.signature, ', ')
    INTO v_bad_owner
  FROM (
    VALUES
      ('app.get_web_push_vapid_public_key()', 'app_owner'),
      ('app.increment_media_playback_resolution_stat(uuid,uuid,text,boolean)', 'app_owner'),
      ('app.is_current_patient_test_account()', 'app_owner'),
      ('app.list_scheduler_reminder_organization_ids()', 'app_owner'),
      ('app.mark_operator_incident_alert_sent(uuid)', 'app_owner'),
      ('app.operator_incident_alert_already_sent(uuid)', 'app_owner'),
      ('app.read_curated_playback_health()', 'saas_system_health_owner'),
      ('app.read_curated_playback_health_pre_0196()', 'saas_system_health_owner'),
      ('app.read_curated_system_health()', 'saas_system_health_owner'),
      ('app.read_curated_system_health_pre_0196()', 'saas_system_health_owner'),
      ('app.read_current_patient_active_organizations()', 'app_owner'),
      ('app.read_current_patient_appointment_history()', 'app_owner'),
      ('app.read_current_patient_booking_rows(text,timestamptz)', 'app_owner'),
      ('app.read_current_patient_ui_setting(text,text)', 'app_owner'),
      ('app.read_current_org_tariff_transition_usage()', 'app_owner'),
      ('app.read_global_server_runtime_setting(text)', 'app_owner'),
      ('app.read_integrator_smtp_outbound_setting()', 'app_owner'),
      ('app.read_last_saas_isolation_coverage()', 'saas_telemetry_owner'),
      ('app.read_media_worker_runtime_setting(text)', 'app_owner'),
      ('app.read_org_enforced_quota_usage(uuid)', 'app_owner'),
      ('app.read_saas_isolation_events()', 'saas_telemetry_owner'),
      ('app.read_saas_isolation_trend()', 'saas_telemetry_owner'),
      ('app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)', 'app_owner'),
      ('app.record_current_patient_push_open(timestamptz,text,uuid)', 'app_owner'),
      ('app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)', 'app_owner'),
      ('app.record_media_playback_resolution_event(uuid,uuid,text,boolean)', 'app_owner'),
      ('app.record_operator_delivery_attempt(text,text,text,integer,text)', 'app_owner'),
      ('app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer)', 'saas_telemetry_owner'),
      ('app.report_saas_isolation_event(text,text,text,text)', 'saas_telemetry_owner'),
      ('app.resolve_current_patient_treatment_program_organization(uuid)', 'app_owner'),
      ('app.resolve_payment_webhook_organization(text,text,text)', 'app_owner'),
      ('app.resolve_public_booking_organization(uuid,uuid,uuid)', 'app_owner'),
      ('app.resolve_public_organization_by_slug(text)', 'app_owner'),
      ('app.resolve_public_organization_slug(text)', 'app_owner'),
      ('app.set_current_patient_calendar_timezone(text,boolean)', 'app_owner'),
      ('app.start_provisioned_organization_trial()', 'app_platform_settings'),
      ('app.touch_current_patient_plan_last_opened(uuid)', 'app_owner'),
      ('app.touch_current_patient_support_conversation_activity(uuid)', 'app_owner')
  ) AS target(signature, required_owner)
  JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
  WHERE pg_get_userbyid(procedure.proowner) <> target.required_owner;

  IF v_bad_owner IS NOT NULL THEN
    RAISE EXCEPTION 'DEV C3: owner realignment did not take effect for: %', v_bad_owner;
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C3: schema app function-owner realignment complete (38 targets checked, only mismatches altered).'
