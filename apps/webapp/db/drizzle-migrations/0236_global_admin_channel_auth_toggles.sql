-- Global-admin channel & auth-method toggles (owner 2026-07-24):
-- 1) Independent OAuth login toggles (Google/Yandex), decoupled from credential presence.
--    `oauth_google_enabled` / `oauth_yandex_enabled` (existing, credential-derived via the
--    0193 trigger) stay untouched and become the "configured" signal; the new
--    `auth_oauth_*_enabled` keys are the admin-controlled toggle. Effective visibility is
--    `auth_oauth_*_enabled AND oauth_*_enabled`, computed in app code (authChannelPolicy.ts).
--    No Apple toggle (owner ruling) — Apple OAuth remains purely credential-derived.
-- 2) Global 2FA/TOTP gate (`auth_2fa_enabled`, server-audience only — never sent to the
--    browser). Default false preserves today's per-user opt-in behavior until an admin
--    turns enforcement on.

WITH new_toggle_definitions(key, audience, value_json) AS (
  VALUES
    ('auth_oauth_google_enabled', 'public', '{"value":true}'::jsonb),
    ('auth_oauth_yandex_enabled', 'public', '{"value":true}'::jsonb),
    ('auth_2fa_enabled', 'server', '{"value":false}'::jsonb)
)
INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT key, 'admin', NULL, value_json, now(), NULL
FROM new_toggle_definitions
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT setting.key, setting.scope, NULL,
  CASE setting.key WHEN 'auth_2fa_enabled' THEN 'server' ELSE 'public' END,
  setting.value_json, setting.updated_at, setting.updated_by
FROM public.system_settings AS setting
WHERE setting.key IN ('auth_oauth_google_enabled', 'auth_oauth_yandex_enabled', 'auth_2fa_enabled')
  AND setting.scope = 'admin'
  AND setting.organization_id IS NULL
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
WHERE key IN ('auth_oauth_google_enabled', 'auth_oauth_yandex_enabled', 'auth_2fa_enabled')
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
