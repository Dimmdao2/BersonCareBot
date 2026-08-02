-- TEMPORARY LOCAL MIGRATION NUMBER 0319
-- #987 D38: the integrator needs the canonical Telegram/MAX/SMSC provider settings at startup,
-- but its NOINHERIT runtime login must never receive SELECT on the credential-bearing table.
-- The caller chooses only within this fixed provider-key allowlist.

CREATE OR REPLACE FUNCTION app.read_integrator_provider_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'telegram_bot_token',
      'telegram_webhook_secret',
      'telegram_send_menu_on_button_press',
      'max_bot_api_key',
      'max_webhook_secret',
      'max_api_base_url',
      'smsc_enabled',
      'smsc_api_key',
      'smsc_base_url'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.read_integrator_provider_runtime_setting(text) IS
  'Fixed allowlist capability for global Telegram, MAX, and SMSC runtime configuration; callers receive no system_settings table access.';
--> statement-breakpoint

DO $provider_runtime_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.read_integrator_provider_runtime_setting(text) OWNER TO app_owner;
  END IF;
END
$provider_runtime_owner$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.read_integrator_provider_runtime_setting(text) FROM PUBLIC;
