-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_integrator_provider_runtime_setting(text)
-- BCB-MIGRATION-VERIFY: SELECT app.read_integrator_provider_runtime_setting('therapygo_smtp_outbound');
-- BCB-MIGRATION-VERIFY: SELECT app.read_integrator_provider_runtime_setting('therapysto_telegram_bot_token');
CREATE OR REPLACE FUNCTION app.read_integrator_provider_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql
    STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
AS $function$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_integrator_owner'::name,
    'app_service'::name,
    'service'::app.port_context_class,
    'config.integrator-provider.read',
    app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]),
    'app.read_integrator_provider_runtime_setting(text)'::regprocedure
  );
  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'telegram_bot_token', 'therapygo_telegram_bot_token', 'therapysto_telegram_bot_token',
      'telegram_webhook_secret', 'therapygo_telegram_webhook_secret', 'therapysto_telegram_webhook_secret',
      'therapygo_telegram_mode', 'therapysto_telegram_mode', 'telegram_send_menu_on_button_press',
      'max_bot_api_key', 'therapygo_max_bot_api_key', 'therapysto_max_bot_api_key',
      'max_webhook_secret', 'therapygo_max_webhook_secret', 'therapysto_max_webhook_secret', 'max_api_base_url',
      'therapygo_smtp_outbound', 'therapysto_smtp_outbound',
      'vk_community_access_token', 'vk_callback_secret', 'vk_callback_confirmation_token',
      'smsc_enabled', 'smsc_api_key', 'smsc_base_url'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END
$function$;
