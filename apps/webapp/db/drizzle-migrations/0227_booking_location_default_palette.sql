-- U9/#932: global defaults for NEW booking locations only.
-- Existing be_branches.color values are intentionally not rewritten.

INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
VALUES (
  'booking_location_default_palette',
  'admin',
  NULL,
  '{"value":{"physicalPalette":["#2563EB","#16A34A","#F59E0B","#DC2626","#7C3AED"],"online":"#7C3AED"}}'::jsonb,
  now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, NULL, 'server', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'booking_location_default_palette'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

INSERT INTO integrator.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT key, scope, NULL, value_json, updated_at, updated_by::text
FROM public.system_settings
WHERE key = 'booking_location_default_palette'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
