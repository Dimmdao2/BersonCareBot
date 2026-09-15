-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'telegram_login_widget_bot_username' AND scope = 'admin' AND organization_id IS NULL) AND EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'telegram_login_widget_bot_token' AND scope = 'admin' AND organization_id IS NULL) AND EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'auth_surface_patient_telegram_login_widget_enabled' AND scope = 'admin' AND organization_id IS NULL AND value_json = '{"value":false}'::jsonb)
--
-- Telegram Login Widget — отдельный способ входа, а не «код в боте» (владелец 16.09.2026: «одно дело
-- логин виджет, другое — подтверждение номера в телеграм», «и выключатели у платформы отдельные»).
-- У него свой бот с привязанным доменом в @BotFather, поэтому свой токен, своё имя и свой
-- переключатель поверхности. Три корня заводятся здесь: reader (`required()`) считает отсутствующую
-- строку недоступностью настройки и роняет публичный маршрут, а не подставляет молча дефолт.
--
-- Rights analysis: data-only вставка в существующий корень public.system_settings. Объекты, функции,
-- роли и привилегии не затрагиваются; уже сохранённое значение не перезаписывается.

INSERT INTO public.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
VALUES
  ('telegram_login_widget_bot_username', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('telegram_login_widget_bot_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_telegram_login_widget_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_authenticated_runtime_setting(text,text,uuid,boolean)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, '''telegram_login_widget_bot_username''') > 0 AND pg_catalog.strpos(p.prosrc, 'passkey|telegram_login_widget') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_authenticated_runtime_setting(text,text,uuid,boolean)')
--
-- Публичная проекция настроек — allowlist: ключ, объявленный только в TypeScript, возвращает ноль
-- строк, и `required()` роняет публичный маршрут. Именно это ждало Login Widget: имя его бота и его
-- переключатель поверхности не проходили ни списком ключей, ни регэкспом `auth_surface_*` — способ
-- входа был бы мёртв целиком, сколько его ни включай в админке. Найдено независимым аудитом 16.09.2026.
--
-- Rights analysis: функция заменяется под своим существующим seam-владельцем с той же сигнатурой,
-- volatility, security и search_path. Тело читает те же уже объявленные колонки
-- public.system_settings. Ни ролей, ни политик, ни привилегий, ни сигнатур не меняется.
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
         'appointment_label',
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
         'max_login_bot_nickname', 'vk_web_login_url', 'support_contact_url', 'app_display_timezone',
         'telegram_login_widget_bot_username'
       )
       OR p_key ~ '^auth_surface_(staff|platform_admin|patient)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey|telegram_login_widget)_enabled$'
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id,
         CASE
           WHEN p_key = 'booking_prepayment_wait_minutes' THEN 'server'::text
           WHEN p_key IN (
             'patient_label',
             'appointment_label',
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_integrator_provider_runtime_setting(text)
-- BCB-MIGRATION-VERIFY: SELECT app.read_integrator_provider_runtime_setting('telegram_login_widget_bot_token') IS NOT DISTINCT FROM app.read_integrator_provider_runtime_setting('telegram_login_widget_bot_token')
--
-- Имя бота берётся у Telegram по его токену, и `getMe` зовёт ИНТЕГРАТОР: в мессенджеры ходит только
-- он, а токен через сеть не передаётся. Значит токен виджета должен быть виден интегратору тем же
-- allowlist-путём, что и токены доставки; без этой строки имя виджета нечем получить.
--
-- Rights analysis: функция заменяется под своим существующим seam-владельцем с той же сигнатурой,
-- volatility, security и search_path. Расширяется только перечень ключей внутри тела.
CREATE OR REPLACE FUNCTION app.read_integrator_provider_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql
    STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
AS $function$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_integrator_owner'::name,
    'app_service'::name,
    'service'::app.port_context_class,
    'config.integrator-provider.read',
    app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]),
    'app.read_integrator_provider_runtime_setting(text)'::regprocedure
  );
  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'telegram_bot_token', 'therapygo_telegram_bot_token', 'therapysto_telegram_bot_token',
      'telegram_webhook_secret', 'therapygo_telegram_webhook_secret', 'therapysto_telegram_webhook_secret',
      'therapygo_telegram_mode', 'therapysto_telegram_mode', 'telegram_send_menu_on_button_press',
      'max_bot_api_key', 'therapygo_max_bot_api_key', 'therapysto_max_bot_api_key',
      'max_webhook_secret', 'therapygo_max_webhook_secret', 'therapysto_max_webhook_secret', 'max_api_base_url',
      'therapygo_smtp_outbound', 'therapysto_smtp_outbound',
      'vk_community_access_token', 'vk_callback_secret', 'vk_callback_confirmation_token',
      'smsc_enabled', 'smsc_api_key', 'smsc_base_url',
      'telegram_login_widget_bot_token'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END
$function$;
