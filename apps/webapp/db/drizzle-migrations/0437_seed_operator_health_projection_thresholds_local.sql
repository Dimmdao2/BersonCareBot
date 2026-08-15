-- BCB-MIGRATION-BACKFILL
-- TEMPORARY LOCAL MIGRATION NUMBER 0437
-- Fresh PROD snapshots predate this required scheduler setting. Seed the canonical target default
-- without replacing an operator-configured value, then align its registered runtime projection.

INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
VALUES (
  'operator_health_projection_thresholds',
  'admin',
  NULL,
  '{"value":{"retriesDebounceMinutes":15,"stalePendingDebounceMinutes":15,"oldestPendingStaleMinutes":30}}'::jsonb,
  now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, organization_id, 'server', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'operator_health_projection_thresholds'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
