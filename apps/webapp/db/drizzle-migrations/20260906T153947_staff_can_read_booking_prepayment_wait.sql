-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_authenticated_runtime_setting(text,text,uuid,boolean)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, '''booking_prepayment_wait_minutes''') > 0 AND pg_catalog.strpos(p.prosrc, 'THEN ''server''::text') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_authenticated_runtime_setting(text,text,uuid,boolean)')
--
-- PAY-APPT-08: staff appointment creation reads the clinic's prepayment wait through the existing
-- authenticated runtime-setting seam. The new server-only key was registered in TypeScript but
-- omitted from this function's closed allowlist, so the seam returned no row and every manual
-- appointment failed before insert.
CREATE OR REPLACE FUNCTION app.read_authenticated_runtime_setting(
  p_key text,
  p_scope text,
  p_organization_id uuid,
  p_allow_global_fallback boolean
) RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER PARALLEL RESTRICTED
SET search_path TO pg_catalog, app, public, pg_temp
AS $function$
DECLARE accepted_org uuid := app.current_org_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_runtime_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );
  IF p_scope NOT IN ('admin', 'doctor')
     OR (p_organization_id IS NOT NULL AND p_organization_id IS DISTINCT FROM accepted_org)
     OR NOT (
       p_key IN (
         'patient_label',
         'doctor_patient_support_comments_without_support_default_enabled',
         'doctor_patient_support_media_without_support_default_enabled',
         'patient_home_daily_practice_target', 'patient_default_promo_treatment_program_template_id',
         'patient_home_daily_warmup_rotation_enabled', 'patient_home_daily_warmup_rotation_times',
         'patient_app_maintenance_enabled', 'patient_app_maintenance_message',
         'patient_program_discussion_doctor_reply_from_log_enabled',
         'patient_program_discussion_ui_enabled',
         'patient_program_discussion_media_submission_enabled',
         'video_playback_api_enabled', 'video_default_delivery', 'patient_booking_url',
         'booking_calendar_show_working_hours', 'booking_calendar_default_window',
         'booking_calendar_default_branch_id', 'booking_calendar_default_service_id',
         'booking_calendar_default_specialist_id', 'booking_payment_enabled',
         'booking_prepayment_wait_minutes',
         'patient_home_daily_warmup_repeat_cooldown_minutes',
         'patient_treatment_plan_item_done_repeat_cooldown_minutes', 'notifications_topics',
         'auth_email_enabled', 'auth_sms_enabled', 'auth_telegram_enabled', 'auth_max_enabled',
         'auth_oauth_google_enabled', 'auth_oauth_yandex_enabled', 'auth_oauth_vk_enabled',
         'auth_oauth_apple_enabled', 'auth_passkey_enabled', 'oauth_yandex_enabled',
         'oauth_google_enabled', 'oauth_apple_enabled', 'oauth_vk_enabled',
         'public_sms_fallback_enabled', 'specialist_signup_enabled',
         'patient_unsupported_client_fallback_enabled', 'telegram_login_bot_username',
         'max_login_bot_nickname', 'vk_web_login_url', 'support_contact_url', 'app_display_timezone'
       )
       OR p_key ~ '^auth_surface_(staff|platform_admin|patient)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled$'
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id,
         CASE
           WHEN p_key = 'booking_prepayment_wait_minutes' THEN 'server'::text
           WHEN p_key IN (
             'patient_label',
             'doctor_patient_support_comments_without_support_default_enabled',
             'doctor_patient_support_media_without_support_default_enabled',
             'patient_home_daily_practice_target', 'patient_default_promo_treatment_program_template_id',
             'patient_home_daily_warmup_rotation_enabled', 'patient_home_daily_warmup_rotation_times',
             'patient_app_maintenance_enabled', 'patient_app_maintenance_message',
             'patient_program_discussion_doctor_reply_from_log_enabled',
             'patient_program_discussion_ui_enabled',
             'patient_program_discussion_media_submission_enabled',
             'video_playback_api_enabled', 'video_default_delivery', 'patient_booking_url',
             'booking_calendar_show_working_hours', 'booking_calendar_default_window',
             'booking_calendar_default_branch_id', 'booking_calendar_default_service_id',
             'booking_calendar_default_specialist_id', 'booking_payment_enabled',
             'patient_home_daily_warmup_repeat_cooldown_minutes',
             'patient_treatment_plan_item_done_repeat_cooldown_minutes', 'notifications_topics'
           ) THEN 'authenticated_client'::text
           ELSE 'public'::text
         END,
         setting.value_json
  FROM public.system_settings setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (
      setting.organization_id = p_organization_id
      OR (p_allow_global_fallback AND setting.organization_id IS NULL)
    )
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
END
$function$;
