-- BCB-MIGRATION-VERIFY: SELECT app.read_integrator_provider_runtime_setting('vk_callback_secret');
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_integrator_clinic_delivery_credential(text,uuid)');

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
CREATE OR REPLACE FUNCTION app.read_integrator_provider_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
AS $_$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_integrator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'config.integrator-provider.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_integrator_provider_runtime_setting(text)'::regprocedure);
  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE p_key IN ('telegram_bot_token','telegram_webhook_secret','telegram_send_menu_on_button_press',
                  'max_bot_api_key','max_webhook_secret','max_api_base_url',
                  'vk_community_access_token','vk_callback_secret','vk_callback_confirmation_token',
                  'smsc_enabled','smsc_api_key','smsc_base_url')
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END $_$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(p_key text, p_organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_value jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_tenant_service'::name]::name[]);
  IF p_organization_id IS NULL OR p_organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'clinic credential organization context denied' USING ERRCODE = '42501';
  END IF;
  IF p_key NOT IN (
    'clinic_smtp_outbound', 'clinic_smsc_api_key',
    'clinic_telegram_bot_token', 'clinic_max_bot_api_key', 'clinic_vk_community_access_token'
  ) THEN
    RAISE EXCEPTION 'clinic credential key denied' USING ERRCODE = '42501';
  END IF;
  SELECT setting.value_json
    INTO v_value
    FROM public.system_settings AS setting
   WHERE setting.key = p_key
     AND setting.scope = 'admin'
     AND setting.organization_id = v_organization_id
   LIMIT 1;
  RETURN v_value;
END
$$;
