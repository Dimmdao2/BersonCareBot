-- F0 unsupported-client fallback: dormant global public rollout flag.
-- The repository ships fail-closed; TEST/PROD activation remains an owner gate.

-- Supports bounded ordered cleanup of the short-lived F0 rate-limit scope without
-- scanning the existing (scope, key, occurred_at) index across every key.
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_events_scope_time
  ON public.auth_rate_limit_events (scope, occurred_at);

INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
VALUES (
  'patient_unsupported_client_fallback_enabled',
  'admin',
  NULL,
  '{"value":false}'::jsonb,
  now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, NULL, 'public', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'patient_unsupported_client_fallback_enabled'
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
WHERE key = 'patient_unsupported_client_fallback_enabled'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
