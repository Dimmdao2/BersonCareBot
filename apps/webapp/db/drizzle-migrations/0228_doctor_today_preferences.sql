-- UI6-963: register the organization-owned Today view preferences in the S5 runtime store.
-- No default rows are materialized: absence keeps the code default and avoids per-organization row fan-out.
-- This backfills only a pre-existing sanctioned legacy row, if one was written before this deploy.

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, organization_id, 'server', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'doctor_today_preferences'
  AND scope = 'doctor'
  AND organization_id IS NOT NULL
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by
WHERE public.app_runtime_settings.updated_at <= EXCLUDED.updated_at;
