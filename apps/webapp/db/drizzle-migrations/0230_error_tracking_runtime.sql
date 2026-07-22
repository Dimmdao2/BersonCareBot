-- C1 error tracking dark-launch defaults and bounded server-runtime readers only.
-- Canonical system_settings rows are intentionally created by the settings service/UI, not here.

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
VALUES
  ('error_tracking_enabled', 'admin', NULL, 'server', '{"value":false}'::jsonb, now(), NULL),
  ('error_tracking_dsn', 'admin', NULL, 'server', '{"value":""}'::jsonb, now(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
RETURNS TABLE (key text, scope text, organization_id uuid, audience text, value_json jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND setting.organization_id IS NULL
    AND setting.audience = 'server'
    AND setting.key IN (
      'error_tracking_enabled', 'error_tracking_dsn',
      'debug_forward_to_admin', 'video_presign_ttl_seconds',
      'admin_telegram_ids', 'admin_max_ids', 'admin_phones',
      'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones'
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.read_global_server_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN ('app_base_url', 'error_tracking_enabled', 'error_tracking_dsn')
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.read_media_worker_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN (
      'video_hls_pipeline_enabled', 'video_watermark_enabled',
      'error_tracking_enabled', 'error_tracking_dsn'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_media_worker_runtime_setting(text) FROM PUBLIC;
