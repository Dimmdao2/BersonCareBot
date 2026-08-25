-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'material_ratings_enabled' AND scope = 'admin' AND organization_id IS NULL AND value_json ? 'value')
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
VALUES ('material_ratings_enabled', 'admin', NULL, '{"value":true}'::jsonb, now(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app_ext
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app_ext.read_default_auth_otp_channel(uuid)') IS NOT NULL
CREATE FUNCTION app_ext.read_default_auth_otp_channel(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT COALESCE(
    (
      SELECT history.confirming_channel
      FROM public.user_phone_history AS history
      WHERE history.platform_user_id = p_user_id
        AND history.valid_to IS NULL
        AND history.confirming_channel IN ('telegram', 'max', 'email')
      LIMIT 1
    ),
    (
      SELECT first_verified.code
      FROM (
        SELECT binding.channel_code AS code, binding.created_at AS verified_at
        FROM public.user_channel_bindings AS binding
        WHERE binding.user_id = p_user_id
          AND binding.channel_code IN ('telegram', 'max')
        UNION ALL
        SELECT 'email' AS code, contact.confirmed_at AS verified_at
        FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = p_user_id
          AND contact.contact_kind = 'email'
          AND contact.is_primary = true
          AND contact.confirmed_at IS NOT NULL
      ) AS first_verified
      ORDER BY first_verified.verified_at ASC
      LIMIT 1
    )
  )
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.pre_session_get_default_auth_otp_channel(uuid)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'app_ext.read_default_auth_otp_channel') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.pre_session_get_default_auth_otp_channel(uuid)')
CREATE OR REPLACE FUNCTION app.pre_session_get_default_auth_otp_channel(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-login.default-channel', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.pre_session_get_default_auth_otp_channel(uuid)'::regprocedure);

  RETURN app_ext.read_default_auth_otp_channel(p_user_id);
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'patient.default-auth-channel.read') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.get_current_patient_default_auth_otp_channel()')
CREATE FUNCTION app.get_current_patient_default_auth_otp_channel()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.default-auth-channel.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.get_current_patient_default_auth_otp_channel()'::regprocedure);

  RETURN app_ext.read_default_auth_otp_channel(app.current_patient_user_id());
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_authenticated_runtime_setting(text,text,uuid,boolean)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, '''app_staff''::name') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_authenticated_runtime_setting(text,text,uuid,boolean)')
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
         CASE WHEN p_key IN (
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
         ) THEN 'authenticated_client'::text ELSE 'public'::text END,
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
