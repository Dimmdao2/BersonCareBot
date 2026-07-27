-- One global-admin availability registry for clinic-facing integrations.
--
-- Existing wired adapters default to available so this additive setting cannot
-- silently disable current behavior (especially Google Calendar). Yandex
-- Calendar is declared but has no sync adapter yet, so its initial switch is
-- unavailable. The owner can change every position later from the platform UI.
--
-- No credential is stored in this value. Clinic credentials belong to a future
-- organization-scoped, tariff-gated slice.

INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
VALUES (
  'platform_integration_availability',
  'admin',
  NULL,
  '{"value":{"version":1,"integrations":{"telegram":true,"max":true,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}}'::jsonb,
  now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
--> statement-breakpoint
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT
  setting.key,
  setting.scope,
  NULL,
  'server',
  setting.value_json,
  setting.updated_at,
  setting.updated_by
FROM public.system_settings AS setting
WHERE setting.key = 'platform_integration_availability'
  AND setting.scope = 'admin'
  AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
--> statement-breakpoint
INSERT INTO integrator.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT
  setting.key,
  setting.scope,
  NULL,
  setting.value_json,
  setting.updated_at,
  setting.updated_by::text
FROM public.system_settings AS setting
WHERE setting.key = 'platform_integration_availability'
  AND setting.scope = 'admin'
  AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

-- This migration adds no function and no GRANT. The deploy's exact
-- expected_secdef_count therefore remains 106.
