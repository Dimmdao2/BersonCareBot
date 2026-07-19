-- S5-1 additive runtime-settings storage/audit contract.
--
-- `public.system_settings` remains the compatibility authoring source until S5-3.
-- This migration neither grants runtime/audit access nor changes RLS: those are S5-2.
-- The trigger below is the single audit owner. Future S5-3 writes must not add a
-- second application-level audit insert; PostgreSQL rolls the runtime row and its
-- audit row back together.

CREATE TABLE IF NOT EXISTS public.app_runtime_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  audience text NOT NULL,
  old_value_json jsonb,
  new_value_json jsonb NOT NULL,
  updated_by uuid,
  source text NOT NULL DEFAULT 'runtime_store_write',
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_runtime_settings_audit_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT app_runtime_settings_audit_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL,
  CONSTRAINT app_runtime_settings_audit_scope_check
    CHECK (scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])),
  CONSTRAINT app_runtime_settings_audit_audience_check
    CHECK (audience = ANY (ARRAY['public'::text, 'authenticated_client'::text, 'server'::text]))
);

CREATE INDEX IF NOT EXISTS app_runtime_settings_audit_global_key_history_idx
  ON public.app_runtime_settings_audit (key, scope, changed_at DESC)
  WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS app_runtime_settings_audit_org_key_history_idx
  ON public.app_runtime_settings_audit (organization_id, key, scope, changed_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_app_runtime_settings_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.app_runtime_settings_audit (
    key, scope, organization_id, audience, old_value_json, new_value_json, updated_by, source
  ) VALUES (
    NEW.key,
    NEW.scope,
    NEW.organization_id,
    NEW.audience,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.value_json ELSE NULL END,
    NEW.value_json,
    NEW.updated_by,
    COALESCE(NULLIF(current_setting('app.runtime_settings_audit_source', true), ''), 'runtime_store_write')
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS app_runtime_settings_audit_change ON public.app_runtime_settings;
CREATE TRIGGER app_runtime_settings_audit_change
AFTER INSERT OR UPDATE ON public.app_runtime_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_app_runtime_settings_change();

-- This is session-scoped rather than transaction-local because psql-style migration
-- runners may execute the following statements in individual autocommit transactions.
-- It is reset at the end of this migration before the connection returns to a pool.
SELECT set_config('app.runtime_settings_audit_source', 's5_1_backfill', false);

-- The registry-backed normal rows. This list is intentionally checked by
-- appRuntimeSettings.s5Contract.test.ts against SYSTEM_SETTING_REGISTRY.
-- Existing 0193 behaviour for patient_booking_url (org-only, no global fallback)
-- remains authoritative and is deliberately not rewritten here.
WITH runtime_definitions(key, scope, audience, default_value_json) AS (
  VALUES
    ('platform_user_merge_v2_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('integrator_linked_phone_source', 'admin', 'server', '{"value":"public_then_contacts"}'::jsonb),
    ('patient_label', 'doctor', 'authenticated_client', '{"value":"Пациенты"}'::jsonb),
    ('doctor_patient_support_comments_without_support_default_enabled', 'doctor', 'authenticated_client', '{"value":false}'::jsonb),
    ('doctor_patient_support_media_without_support_default_enabled', 'doctor', 'authenticated_client', '{"value":false}'::jsonb),
    ('doctor_specialist_task_reminder_channels', 'doctor', 'server', '{"value":{"channels":[]}}'::jsonb),
    ('doctor_appointment_reminder_enabled', 'doctor', 'server', '{"value":false}'::jsonb),
    ('doctor_appointment_reminder_offsets_minutes', 'doctor', 'server', '{"value":[]}'::jsonb),
    ('debug_forward_to_admin', 'admin', 'server', '{"value":false}'::jsonb),
    ('important_fallback_delay_minutes', 'admin', 'server', '{"value":null}'::jsonb),
    ('app_base_url', 'admin', 'server', '{"value":""}'::jsonb),
    ('support_contact_url', 'admin', 'public', '{"value":""}'::jsonb),
    ('telegram_login_bot_username', 'admin', 'public', '{"value":""}'::jsonb),
    ('max_login_bot_nickname', 'admin', 'public', '{"value":""}'::jsonb),
    ('vk_web_login_url', 'admin', 'public', '{"value":""}'::jsonb),
    ('app_display_timezone', 'admin', 'public', '{"value":"Europe/Moscow"}'::jsonb),
    ('patient_home_daily_practice_target', 'admin', 'authenticated_client', '{"value":3}'::jsonb),
    ('patient_default_promo_treatment_program_template_id', 'admin', 'authenticated_client', '{"value":null}'::jsonb),
    ('patient_home_daily_warmup_rotation_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_home_daily_warmup_rotation_times', 'admin', 'authenticated_client', '{"value":[]}'::jsonb),
    ('patient_app_maintenance_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_app_maintenance_message', 'admin', 'authenticated_client', '{"value":""}'::jsonb),
    ('specialist_signup_enabled', 'admin', 'public', '{"value":false}'::jsonb),
    ('patient_program_discussion_doctor_reply_from_log_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_program_discussion_ui_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_program_discussion_media_submission_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('video_hls_pipeline_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_hls_new_uploads_auto_transcode', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_hls_reconcile_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_playback_api_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('video_default_delivery', 'admin', 'authenticated_client', '{"value":"auto"}'::jsonb),
    ('video_presign_ttl_seconds', 'admin', 'server', '{"value":3600}'::jsonb),
    ('video_watermark_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('patient_booking_url', 'admin', 'authenticated_client', '{"value":""}'::jsonb),
    ('booking_rubitime_bridge_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('booking_doctor_appointments_read_source', 'admin', 'server', '{"value":"rubitime_legacy"}'::jsonb),
    ('booking_calendar_show_working_hours', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('booking_calendar_default_window', 'doctor', 'authenticated_client', '{"value":null}'::jsonb),
    ('booking_calendar_default_branch_id', 'doctor', 'authenticated_client', '{"value":null}'::jsonb),
    ('booking_calendar_default_service_id', 'doctor', 'authenticated_client', '{"value":null}'::jsonb),
    ('booking_slots_read_source', 'admin', 'server', '{"value":"rubitime"}'::jsonb),
    ('booking_payment_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('booking_lifecycle_notifications', 'admin', 'server', '{"value":false}'::jsonb),
    ('booking_allow_doctor_unlink_past_package_sessions', 'admin', 'server', '{"value":false}'::jsonb),
    ('booking_min_notice_hours', 'admin', 'server', '{"value":0}'::jsonb),
    ('booking_max_consecutive_slot_hours', 'admin', 'server', '{"value":3}'::jsonb),
    ('patient_home_daily_warmup_repeat_cooldown_minutes', 'admin', 'authenticated_client', '{"value":60}'::jsonb),
    ('patient_treatment_plan_item_done_repeat_cooldown_minutes', 'admin', 'authenticated_client', '{"value":60}'::jsonb),
    ('patient_home_warmup_skip_to_next_available_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('patient_home_mood_icons', 'admin', 'authenticated_client', '{"value":[]}'::jsonb),
    ('notifications_topics', 'admin', 'authenticated_client', '{"value":[]}'::jsonb),
    ('operator_health_projection_thresholds', 'admin', 'server', '{"value":null}'::jsonb),
    ('notif_template:created:patient', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:created:doctor', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:cancelled:patient', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:cancelled:doctor', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:rescheduled:patient', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:rescheduled:doctor', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb)
)
,
source_rows AS (
  SELECT definition.key, setting.scope, setting.organization_id, definition.audience,
         setting.value_json, setting.updated_at, setting.updated_by
  FROM runtime_definitions AS definition
  JOIN public.system_settings AS setting
    ON setting.key = definition.key
   AND setting.scope = definition.scope
  WHERE definition.key <> 'patient_booking_url'
),
updated_rows AS (
  UPDATE public.app_runtime_settings AS runtime
  SET audience = source.audience,
      value_json = source.value_json,
      updated_at = source.updated_at,
      updated_by = source.updated_by
  FROM source_rows AS source
  WHERE runtime.key = source.key
    AND runtime.scope = source.scope
    AND runtime.organization_id IS NOT DISTINCT FROM source.organization_id
    AND runtime.updated_at <= source.updated_at
    AND (
      runtime.audience IS DISTINCT FROM source.audience
      OR runtime.value_json IS DISTINCT FROM source.value_json
      OR runtime.updated_by IS DISTINCT FROM source.updated_by
      OR runtime.updated_at IS DISTINCT FROM source.updated_at
    )
  RETURNING runtime.key
)
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT source.key, source.scope, source.organization_id, source.audience,
       source.value_json, source.updated_at, source.updated_by
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_runtime_settings AS runtime
  WHERE runtime.key = source.key
    AND runtime.scope = source.scope
    AND runtime.organization_id IS NOT DISTINCT FROM source.organization_id
)
ON CONFLICT DO NOTHING;

WITH runtime_definitions(key, scope, audience, default_value_json) AS (
  VALUES
    ('platform_user_merge_v2_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('integrator_linked_phone_source', 'admin', 'server', '{"value":"public_then_contacts"}'::jsonb),
    ('patient_label', 'doctor', 'authenticated_client', '{"value":"Пациенты"}'::jsonb),
    ('doctor_patient_support_comments_without_support_default_enabled', 'doctor', 'authenticated_client', '{"value":false}'::jsonb),
    ('doctor_patient_support_media_without_support_default_enabled', 'doctor', 'authenticated_client', '{"value":false}'::jsonb),
    ('doctor_specialist_task_reminder_channels', 'doctor', 'server', '{"value":{"channels":[]}}'::jsonb),
    ('doctor_appointment_reminder_enabled', 'doctor', 'server', '{"value":false}'::jsonb),
    ('doctor_appointment_reminder_offsets_minutes', 'doctor', 'server', '{"value":[]}'::jsonb),
    ('debug_forward_to_admin', 'admin', 'server', '{"value":false}'::jsonb),
    ('important_fallback_delay_minutes', 'admin', 'server', '{"value":null}'::jsonb),
    ('app_base_url', 'admin', 'server', '{"value":""}'::jsonb),
    ('support_contact_url', 'admin', 'public', '{"value":""}'::jsonb),
    ('telegram_login_bot_username', 'admin', 'public', '{"value":""}'::jsonb),
    ('max_login_bot_nickname', 'admin', 'public', '{"value":""}'::jsonb),
    ('vk_web_login_url', 'admin', 'public', '{"value":""}'::jsonb),
    ('app_display_timezone', 'admin', 'public', '{"value":"Europe/Moscow"}'::jsonb),
    ('patient_home_daily_practice_target', 'admin', 'authenticated_client', '{"value":3}'::jsonb),
    ('patient_default_promo_treatment_program_template_id', 'admin', 'authenticated_client', '{"value":null}'::jsonb),
    ('patient_home_daily_warmup_rotation_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_home_daily_warmup_rotation_times', 'admin', 'authenticated_client', '{"value":[]}'::jsonb),
    ('patient_app_maintenance_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_app_maintenance_message', 'admin', 'authenticated_client', '{"value":""}'::jsonb),
    ('specialist_signup_enabled', 'admin', 'public', '{"value":false}'::jsonb),
    ('patient_program_discussion_doctor_reply_from_log_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_program_discussion_ui_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('patient_program_discussion_media_submission_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('video_hls_pipeline_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_hls_new_uploads_auto_transcode', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_hls_reconcile_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_playback_api_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('video_default_delivery', 'admin', 'authenticated_client', '{"value":"auto"}'::jsonb),
    ('video_presign_ttl_seconds', 'admin', 'server', '{"value":3600}'::jsonb),
    ('video_watermark_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('patient_booking_url', 'admin', 'authenticated_client', '{"value":""}'::jsonb),
    ('booking_rubitime_bridge_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('booking_doctor_appointments_read_source', 'admin', 'server', '{"value":"rubitime_legacy"}'::jsonb),
    ('booking_calendar_show_working_hours', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('booking_calendar_default_window', 'doctor', 'authenticated_client', '{"value":null}'::jsonb),
    ('booking_calendar_default_branch_id', 'doctor', 'authenticated_client', '{"value":null}'::jsonb),
    ('booking_calendar_default_service_id', 'doctor', 'authenticated_client', '{"value":null}'::jsonb),
    ('booking_slots_read_source', 'admin', 'server', '{"value":"rubitime"}'::jsonb),
    ('booking_payment_enabled', 'admin', 'authenticated_client', '{"value":false}'::jsonb),
    ('booking_lifecycle_notifications', 'admin', 'server', '{"value":false}'::jsonb),
    ('booking_allow_doctor_unlink_past_package_sessions', 'admin', 'server', '{"value":false}'::jsonb),
    ('booking_min_notice_hours', 'admin', 'server', '{"value":0}'::jsonb),
    ('booking_max_consecutive_slot_hours', 'admin', 'server', '{"value":3}'::jsonb),
    ('patient_home_daily_warmup_repeat_cooldown_minutes', 'admin', 'authenticated_client', '{"value":60}'::jsonb),
    ('patient_treatment_plan_item_done_repeat_cooldown_minutes', 'admin', 'authenticated_client', '{"value":60}'::jsonb),
    ('patient_home_warmup_skip_to_next_available_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('patient_home_mood_icons', 'admin', 'authenticated_client', '{"value":[]}'::jsonb),
    ('notifications_topics', 'admin', 'authenticated_client', '{"value":[]}'::jsonb),
    ('operator_health_projection_thresholds', 'admin', 'server', '{"value":null}'::jsonb),
    ('notif_template:created:patient', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:created:doctor', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:cancelled:patient', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:cancelled:doctor', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:rescheduled:patient', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb),
    ('notif_template:rescheduled:doctor', 'admin', 'server', '{"value":"hardcoded fallback"}'::jsonb)
)
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT definition.key, definition.scope, NULL, definition.audience,
       definition.default_value_json, now(), NULL
FROM runtime_definitions AS definition
WHERE definition.key <> 'patient_booking_url'
  AND NOT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = definition.key
      AND setting.scope = definition.scope
      AND setting.organization_id IS NULL
  )
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

-- Registry-approved derived projections. Every constructed output is an allowlist;
-- credential envelopes are read only to derive booleans or non-secret public fields.
WITH vapid_source AS (
  SELECT value_json, updated_at, updated_by
  FROM public.system_settings
  WHERE key = 'web_push_vapid'
    AND scope = 'admin'
    AND organization_id IS NULL
    AND NULLIF(btrim(value_json #>> '{value,publicKey}'), '') IS NOT NULL
)
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT 'web_push_vapid_public_key', 'admin', NULL, 'public',
       jsonb_build_object('value', jsonb_build_object('publicKey', value_json #>> '{value,publicKey}')),
       updated_at, updated_by
FROM vapid_source
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
              updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
WHERE public.app_runtime_settings.updated_at <= EXCLUDED.updated_at
  AND (
    public.app_runtime_settings.audience IS DISTINCT FROM EXCLUDED.audience
    OR public.app_runtime_settings.value_json IS DISTINCT FROM EXCLUDED.value_json
    OR public.app_runtime_settings.updated_by IS DISTINCT FROM EXCLUDED.updated_by
    OR public.app_runtime_settings.updated_at IS DISTINCT FROM EXCLUDED.updated_at
  );

WITH payment_source AS (
  SELECT organization_id, value_json, updated_at, updated_by
  FROM public.system_settings
  WHERE key = 'booking_payment_providers' AND scope = 'admin'
), payment_projection AS (
  SELECT
    organization_id,
    jsonb_build_object('value', jsonb_build_object(
      'enabled', CASE lower(COALESCE(value_json #>> '{value,enabled}', 'false'))
        WHEN 'true' THEN true WHEN '1' THEN true ELSE false END,
      'defaultProviderId', COALESCE(NULLIF(btrim(value_json #>> '{value,defaultProviderId}'), ''), 'mock'),
      'providers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', provider.value->>'id',
          'label', COALESCE(NULLIF(provider.value->>'label', ''), provider.value->>'id'),
          'enabled', CASE lower(COALESCE(provider.value->>'enabled', 'false'))
            WHEN 'true' THEN true WHEN '1' THEN true ELSE false END
        ) ORDER BY provider.value->>'id')
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(value_json #> '{value,providers}') = 'array'
            THEN value_json #> '{value,providers}' ELSE '[]'::jsonb END
        ) AS provider(value)
        WHERE jsonb_typeof(provider.value) = 'object'
          AND NULLIF(btrim(provider.value->>'id'), '') IS NOT NULL
      ), '[]'::jsonb)
    )) AS value_json,
    updated_at,
    updated_by
  FROM payment_source
)
,
updated_rows AS (
  UPDATE public.app_runtime_settings AS runtime
  SET audience = 'authenticated_client',
      value_json = projection.value_json,
      updated_at = projection.updated_at,
      updated_by = projection.updated_by
  FROM payment_projection AS projection
  WHERE runtime.key = 'booking_payment_public_config'
    AND runtime.scope = 'admin'
    AND runtime.organization_id IS NOT DISTINCT FROM projection.organization_id
    AND runtime.updated_at <= projection.updated_at
    AND (
      runtime.audience IS DISTINCT FROM 'authenticated_client'
      OR runtime.value_json IS DISTINCT FROM projection.value_json
      OR runtime.updated_by IS DISTINCT FROM projection.updated_by
      OR runtime.updated_at IS DISTINCT FROM projection.updated_at
    )
  RETURNING runtime.key
)
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT 'booking_payment_public_config', 'admin', organization_id, 'authenticated_client',
       value_json, updated_at, updated_by
FROM payment_projection AS projection
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_runtime_settings AS runtime
  WHERE runtime.key = 'booking_payment_public_config'
    AND runtime.scope = 'admin'
    AND runtime.organization_id IS NOT DISTINCT FROM projection.organization_id
)
ON CONFLICT DO NOTHING;

WITH oauth_definitions(key, required_keys) AS (
  VALUES
    ('oauth_yandex_enabled', ARRAY['yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri']::text[]),
    ('oauth_google_enabled', ARRAY['google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri']::text[]),
    ('oauth_apple_enabled', ARRAY['apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id', 'apple_oauth_key_id', 'apple_oauth_private_key']::text[])
), oauth_projection AS (
  SELECT definition.key,
         max(setting.updated_at) AS updated_at,
         (array_agg(setting.updated_by ORDER BY setting.updated_at DESC NULLS LAST))[1] AS updated_by
  FROM oauth_definitions AS definition
  JOIN public.system_settings AS setting
    ON setting.key = ANY(definition.required_keys)
   AND setting.scope = 'admin'
   AND setting.organization_id IS NULL
   AND NULLIF(btrim(setting.value_json->>'value'), '') IS NOT NULL
  GROUP BY definition.key, definition.required_keys
  HAVING count(DISTINCT setting.key) = cardinality(definition.required_keys)
)
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, 'admin', NULL, 'public', jsonb_build_object('value', true), updated_at, updated_by
FROM oauth_projection
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
              updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
WHERE public.app_runtime_settings.updated_at <= EXCLUDED.updated_at
  AND (
    public.app_runtime_settings.audience IS DISTINCT FROM EXCLUDED.audience
    OR public.app_runtime_settings.value_json IS DISTINCT FROM EXCLUDED.value_json
    OR public.app_runtime_settings.updated_by IS DISTINCT FROM EXCLUDED.updated_by
    OR public.app_runtime_settings.updated_at IS DISTINCT FROM EXCLUDED.updated_at
  );

WITH sms_source AS (
  SELECT value_json, updated_at, updated_by
  FROM public.system_settings
  WHERE key = 'sms_fallback_enabled'
    AND organization_id IS NULL
    AND scope IN ('doctor', 'admin')
  ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT 'public_sms_fallback_enabled', 'admin', NULL, 'public',
       jsonb_build_object('value', CASE lower(COALESCE(value_json->>'value', 'false'))
         WHEN 'true' THEN true WHEN '1' THEN true ELSE false END),
       updated_at, updated_by
FROM sms_source
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
              updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
WHERE public.app_runtime_settings.updated_at <= EXCLUDED.updated_at
  AND (
    public.app_runtime_settings.audience IS DISTINCT FROM EXCLUDED.audience
    OR public.app_runtime_settings.value_json IS DISTINCT FROM EXCLUDED.value_json
    OR public.app_runtime_settings.updated_by IS DISTINCT FROM EXCLUDED.updated_by
    OR public.app_runtime_settings.updated_at IS DISTINCT FROM EXCLUDED.updated_at
  );

SELECT set_config('app.runtime_settings_audit_source', '', false);
