-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'platform_integration_availability' AND scope = 'admin' AND organization_id IS NULL AND jsonb_typeof(value_json #> '{value,integrations}') = 'object' AND NOT (value_json #> '{value,integrations}' ? 'vk'))
--
-- Pre-D31 persisted registries predate the VK channel and carry only the original seven
-- PLATFORM_INTEGRATION_IDS keys. Both the integrator and webapp parsers require every key to be
-- a valid boolean before trusting any of them, so a registry missing only `vk` denied every
-- requested channel, including a valid `email` (proven live on TEST: an existing-owner email OTP
-- request exhausted retries and dead-lettered with PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE).
-- Add the missing key without touching any existing switch. Default it to false: VK is a newly
-- added outbound channel, so an installation that never explicitly turned it on stays off.
-- `public.system_settings` is the single write; the `system_settings_sync_registered_runtime`
-- trigger mirrors the corrected value into `public.app_runtime_settings` on its own.

UPDATE public.system_settings
SET value_json = jsonb_set(value_json, '{value,integrations,vk}', 'false'::jsonb, true),
    updated_at = now()
WHERE key = 'platform_integration_availability'
  AND scope = 'admin'
  AND organization_id IS NULL
  AND jsonb_typeof(value_json #> '{value}') = 'object'
  AND (value_json #> '{value,version}') = '1'::jsonb
  AND jsonb_typeof(value_json #> '{value,integrations}') = 'object'
  AND NOT (value_json #> '{value,integrations}' ? 'vk');
