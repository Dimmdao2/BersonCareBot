-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure), 'app_integrator_tenant_service') > 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure), 'app_tenant_service') = 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure), 'clinic_transactional_mail_template') > 0
-- Reconcile Track D's narrow integrator principal with the branded-delivery credential set.
-- The runtime overlay intentionally does not own this body; active forward migrations are the
-- single definition source and privilege reconciliation owns EXECUTE.
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text,
  p_organization_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_id uuid;
  v_value jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_integrator_owner'::name,
    ARRAY['app_integrator_tenant_service'::name]::name[]
  );

  v_organization_id := app.current_org_id();
  IF p_organization_id IS NULL OR p_organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'clinic credential organization context denied' USING ERRCODE = '42501';
  END IF;
  IF p_key NOT IN (
    'clinic_smtp_outbound',
    'clinic_smsc_api_key',
    'clinic_telegram_bot_token',
    'clinic_max_bot_api_key',
    'clinic_vk_community_access_token',
    'clinic_transactional_mail_template'
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
END;
$function$;
