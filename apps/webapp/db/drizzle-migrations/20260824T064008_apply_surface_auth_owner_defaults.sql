-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM (VALUES ('auth_surface_staff_oauth_google_enabled', '{"value":false}'::jsonb), ('auth_surface_staff_oauth_yandex_enabled', '{"value":false}'::jsonb), ('auth_surface_staff_oauth_vk_enabled', '{"value":false}'::jsonb), ('auth_surface_staff_oauth_apple_enabled', '{"value":false}'::jsonb), ('auth_surface_staff_passkey_enabled', '{"value":false}'::jsonb), ('auth_surface_platform_admin_oauth_google_enabled', '{"value":false}'::jsonb), ('auth_surface_platform_admin_oauth_yandex_enabled', '{"value":false}'::jsonb), ('auth_surface_platform_admin_oauth_vk_enabled', '{"value":false}'::jsonb), ('auth_surface_platform_admin_oauth_apple_enabled', '{"value":false}'::jsonb), ('auth_surface_patient_email_enabled', '{"value":true}'::jsonb), ('auth_surface_patient_sms_enabled', '{"value":false}'::jsonb), ('auth_surface_patient_telegram_enabled', '{"value":true}'::jsonb), ('auth_surface_patient_oauth_google_enabled', '{"value":false}'::jsonb), ('auth_surface_patient_oauth_yandex_enabled', '{"value":true}'::jsonb), ('auth_surface_patient_passkey_enabled', '{"value":false}'::jsonb)) AS expected(key, value_json) LEFT JOIN public.system_settings canonical ON canonical.key = expected.key AND canonical.scope = 'admin' AND canonical.organization_id IS NULL LEFT JOIN public.app_runtime_settings runtime ON runtime.key = expected.key AND runtime.scope = 'admin' AND runtime.organization_id IS NULL AND runtime.audience = 'public' WHERE canonical.value_json IS DISTINCT FROM expected.value_json OR runtime.value_json IS DISTINCT FROM expected.value_json);
--
-- F2/F2b/F3/F5 apply the owner defaults to the F4 split cells. Mechanics remain implemented and
-- each cell can still be changed independently by the existing settings surface.
WITH desired(key, value_json) AS (
  VALUES
    ('auth_surface_staff_oauth_google_enabled', '{"value":false}'::jsonb),
    ('auth_surface_staff_oauth_yandex_enabled', '{"value":false}'::jsonb),
    ('auth_surface_staff_oauth_vk_enabled', '{"value":false}'::jsonb),
    ('auth_surface_staff_oauth_apple_enabled', '{"value":false}'::jsonb),
    ('auth_surface_staff_passkey_enabled', '{"value":false}'::jsonb),
    ('auth_surface_platform_admin_oauth_google_enabled', '{"value":false}'::jsonb),
    ('auth_surface_platform_admin_oauth_yandex_enabled', '{"value":false}'::jsonb),
    ('auth_surface_platform_admin_oauth_vk_enabled', '{"value":false}'::jsonb),
    ('auth_surface_platform_admin_oauth_apple_enabled', '{"value":false}'::jsonb),
    ('auth_surface_patient_email_enabled', '{"value":true}'::jsonb),
    ('auth_surface_patient_sms_enabled', '{"value":false}'::jsonb),
    ('auth_surface_patient_telegram_enabled', '{"value":true}'::jsonb),
    ('auth_surface_patient_oauth_google_enabled', '{"value":false}'::jsonb),
    ('auth_surface_patient_oauth_yandex_enabled', '{"value":true}'::jsonb),
    ('auth_surface_patient_passkey_enabled', '{"value":false}'::jsonb)
)
UPDATE public.system_settings AS target
SET value_json = desired.value_json,
    updated_at = now()
FROM desired
WHERE target.key = desired.key
  AND target.scope = 'admin'
  AND target.organization_id IS NULL;
