-- 0231_admin_email_role_runtime_config: email OTP may resolve global admin only through
-- the same closed, server-only DB-backed policy projection as the existing staff allowlists.

WITH definitions(key, default_value) AS (VALUES
  ('admin_emails', '{"value":""}'::jsonb)
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  definitions.key,
  'admin',
  NULL,
  'server',
  COALESCE(setting.value_json, definitions.default_value),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM definitions
LEFT JOIN public.system_settings AS setting
  ON setting.key = definitions.key
 AND setting.scope = 'admin'
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
RETURNS TABLE (
  key text,
  scope text,
  organization_id uuid,
  audience text,
  value_json jsonb
)
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
      'debug_forward_to_admin', 'video_presign_ttl_seconds',
      'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails',
      'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones'
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;
