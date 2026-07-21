-- N1A: independent platform auth-channel policy.
-- Provider credentials/readiness and existing account bindings remain separate.
-- The SMS default follows the effective public SMS projection; the other defaults
-- preserve the currently available auth paths.

WITH sms_policy AS (
  SELECT CASE
    WHEN value_json->'value' = 'true'::jsonb THEN true
    WHEN value_json->'value' = 'false'::jsonb THEN false
    ELSE false
  END AS enabled
  FROM public.app_runtime_settings
  WHERE key = 'public_sms_fallback_enabled'
    AND scope = 'admin'
    AND organization_id IS NULL
    AND audience = 'public'
  LIMIT 1
), auth_channel_definitions(key, value_json) AS (
  VALUES
    ('auth_email_enabled', '{"value":true}'::jsonb),
    ('auth_sms_enabled', jsonb_build_object('value', COALESCE((SELECT enabled FROM sms_policy), false))),
    ('auth_telegram_enabled', '{"value":true}'::jsonb),
    ('auth_max_enabled', '{"value":true}'::jsonb)
)
INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT key, 'admin', NULL, value_json, now(), NULL
FROM auth_channel_definitions
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

-- Register the four keys in the canonical public runtime projection. Existing
-- explicit policy values win over migration defaults and become the aligned source.
INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, NULL, 'public', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key IN (
  'auth_email_enabled',
  'auth_sms_enabled',
  'auth_telegram_enabled',
  'auth_max_enabled'
)
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

-- Direct migration writes must establish the same global identity in the
-- integrator mirror. Later application writes continue through updateSetting.
INSERT INTO integrator.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT key, scope, NULL, value_json, updated_at, updated_by::text
FROM public.system_settings
WHERE key IN (
  'auth_email_enabled',
  'auth_sms_enabled',
  'auth_telegram_enabled',
  'auth_max_enabled'
)
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
