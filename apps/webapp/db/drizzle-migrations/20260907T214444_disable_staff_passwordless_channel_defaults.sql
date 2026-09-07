-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM (VALUES ('auth_surface_staff_email_enabled'), ('auth_surface_staff_sms_enabled'), ('auth_surface_staff_telegram_enabled'), ('auth_surface_staff_max_enabled')) AS expected(key) LEFT JOIN public.system_settings canonical ON canonical.key = expected.key AND canonical.scope = 'admin' AND canonical.organization_id IS NULL LEFT JOIN public.app_runtime_settings runtime ON runtime.key = expected.key AND runtime.scope = 'admin' AND runtime.organization_id IS NULL AND runtime.audience = 'public' WHERE canonical.value_json IS DISTINCT FROM '{"value":false}'::jsonb OR runtime.value_json IS DISTINCT FROM '{"value":false}'::jsonb);
--
-- Staff always starts with email + password. Passwordless email-code login and phone/messenger
-- login stay implemented but start disabled; this does not affect the independently configured
-- clinic-wide email second factor after a correct password.
UPDATE public.system_settings
SET value_json = '{"value":false}'::jsonb,
    updated_at = now()
WHERE key IN (
    'auth_surface_staff_email_enabled',
    'auth_surface_staff_sms_enabled',
    'auth_surface_staff_telegram_enabled',
    'auth_surface_staff_max_enabled'
  )
  AND scope = 'admin'
  AND organization_id IS NULL;
