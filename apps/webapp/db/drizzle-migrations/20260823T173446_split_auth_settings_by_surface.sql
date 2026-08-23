-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 27 FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL AND key LIKE 'auth_surface_%_enabled') AND (SELECT count(*) = 27 FROM public.app_runtime_settings WHERE scope = 'admin' AND organization_id IS NULL AND audience = 'public' AND key LIKE 'auth_surface_%_enabled') AND NOT EXISTS (SELECT 1 FROM public.system_settings surface_setting JOIN public.system_settings legacy_setting ON legacy_setting.key = regexp_replace(surface_setting.key, '^auth_surface_(staff|platform_admin|patient)_', 'auth_') AND legacy_setting.scope = 'admin' AND legacy_setting.organization_id IS NULL WHERE surface_setting.scope = 'admin' AND surface_setting.organization_id IS NULL AND surface_setting.key LIKE 'auth_surface_%_enabled' AND surface_setting.value_json IS DISTINCT FROM legacy_setting.value_json)
--
-- F4 is a value-preserving split: every existing global auth toggle becomes one cell on each of
-- the staff, platform-admin and patient rows. No value is changed here. Subsequent operator writes
-- target one cell; the legacy rows remain untouched for non-login compatibility consumers.
WITH legacy(control, key) AS (
  VALUES
    ('email', 'auth_email_enabled'),
    ('sms', 'auth_sms_enabled'),
    ('telegram', 'auth_telegram_enabled'),
    ('max', 'auth_max_enabled'),
    ('oauth_google', 'auth_oauth_google_enabled'),
    ('oauth_yandex', 'auth_oauth_yandex_enabled'),
    ('oauth_vk', 'auth_oauth_vk_enabled'),
    ('oauth_apple', 'auth_oauth_apple_enabled'),
    ('passkey', 'auth_passkey_enabled')
), surfaces(surface) AS (
  VALUES ('staff'), ('platform_admin'), ('patient')
)
INSERT INTO public.system_settings
  (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT
  'auth_surface_' || surfaces.surface || '_' || legacy.control || '_enabled',
  'admin',
  NULL,
  source.value_json,
  now(),
  source.updated_by
FROM legacy
JOIN public.system_settings AS source
  ON source.key = legacy.key
 AND source.scope = 'admin'
 AND source.organization_id IS NULL
CROSS JOIN surfaces
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- The S5 runtime table is authoritative. Seed it explicitly: the compatibility trigger can only
-- mirror a new key after a runtime row has established its audience.
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT key, scope, NULL, 'public', value_json, updated_at, updated_by
FROM public.system_settings
WHERE scope = 'admin'
  AND organization_id IS NULL
  AND key LIKE 'auth_surface_%_enabled'
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
