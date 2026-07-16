-- Register the integrator's public webapp origin in the generic server-runtime store.
-- Restricted system_settings remains the authoring source during S5 compatibility.
-- Runtime callers use one generic accessor and receive no table privileges.

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  setting.key,
  setting.scope,
  NULL,
  'server',
  setting.value_json,
  setting.updated_at,
  setting.updated_by
FROM public.system_settings AS setting
WHERE setting.key = 'app_base_url'
  AND setting.scope = 'admin'
  AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.read_global_server_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;
