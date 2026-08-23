-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure) LIKE '%app_integrator_tenant_service%'
-- D17: the integrator login no longer carries the webapp's broad `app_tenant_service` role. These
-- two setting doors are called inside the integrator organization principal, whose target role is
-- now `app_integrator_tenant_service`; retaining an old-role-only body gate made EXECUTE alone
-- insufficient and caused 42501 on booking confirmation/delivery.
--
-- The old role is removed because the caller census found no webapp path to either settings root.
-- Grants and revokes remain exclusively in deploy/postgres/privileges/declaration.ts and generated reconcile.
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
END;
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.read_integrator_google_calendar_setting(text,uuid)'::regprocedure) LIKE '%app_integrator_tenant_service%'
CREATE OR REPLACE FUNCTION app.read_integrator_google_calendar_setting(
  p_key text,
  p_organization_id uuid DEFAULT NULL::uuid
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
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'google calendar organization context denied' USING ERRCODE = '42501';
  END IF;

  SELECT setting.value_json
    INTO v_value
    FROM public.system_settings AS setting
   WHERE (
       (p_organization_id IS NULL
         AND p_key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri')
         AND setting.organization_id IS NULL)
       OR
       (p_organization_id IS NOT NULL
         AND p_key IN ('google_calendar_enabled', 'google_calendar_id', 'google_refresh_token')
         AND setting.organization_id = v_organization_id)
     )
     AND setting.key = p_key
     AND setting.scope = 'admin'
   LIMIT 1;
  RETURN v_value;
END;
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 2 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('resolve_organization_mechanic_access', 'saas_billing_effective_tariff') AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%app_integrator_tenant_service%'
-- The integrator calls the shared mechanic-access calculation before clinic delivery mutations.
-- Patient, staff and webapp tenant roles remain accepted; the narrow integrator tenant role is
-- added to the same exact-organization gate instead of receiving any underlying medical access.
DO $migration$
DECLARE
  v_identity regprocedure := 'app.resolve_organization_mechanic_access(uuid,text)'::regprocedure;
  v_definition text;
  v_gate_statement text;
  v_old_gate text := 'ARRAY[''app_patient''::name, ''app_staff''::name, ''app_tenant_service''::name]::name[]';
  v_new_gate text := 'ARRAY[''app_patient''::name, ''app_staff''::name, ''app_tenant_service''::name, ''app_integrator_tenant_service''::name]::name[]';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_new_gate) = 0 THEN
    IF pg_catalog.strpos(v_definition, v_old_gate) = 0 THEN
      RAISE EXCEPTION 'integrator mechanic gate anchor not found for %', v_identity;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old_gate, v_new_gate);
  END IF;
  IF pg_catalog.strpos(v_definition, 'v_current_organization_id uuid := app.current_org_id();') > 0 THEN
    v_definition := pg_catalog.replace(
      v_definition,
      'v_current_organization_id uuid := app.current_org_id();',
      'v_current_organization_id uuid;'
    );
  ELSIF pg_catalog.strpos(v_definition, 'v_current_organization_id uuid;') = 0 THEN
    RAISE EXCEPTION 'integrator mechanic organization initializer anchor not found for %', v_identity;
  END IF;
  IF pg_catalog.strpos(v_definition, 'v_now timestamptz := statement_timestamp();') > 0 THEN
    v_definition := pg_catalog.replace(
      v_definition,
      'v_now timestamptz := statement_timestamp();',
      'v_now timestamptz;'
    );
  ELSIF pg_catalog.strpos(v_definition, 'v_now timestamptz;') = 0 THEN
    RAISE EXCEPTION 'integrator mechanic timestamp initializer anchor not found for %', v_identity;
  END IF;
  IF pg_catalog.strpos(v_definition, 'v_current_organization_id := app.current_org_id();') = 0 THEN
    v_gate_statement := 'PERFORM app.require_attested_context_for_roles(''app_seam_org_commerce_owner''::name, '
      || v_new_gate || ');';
    IF pg_catalog.strpos(v_definition, v_gate_statement) = 0 THEN
      RAISE EXCEPTION 'integrator mechanic first gate statement not found for %', v_identity;
    END IF;
    v_definition := pg_catalog.replace(
      v_definition,
      v_gate_statement,
      v_gate_statement || E'\n\n  v_current_organization_id := app.current_org_id();\n  v_now := statement_timestamp();'
    );
  END IF;
  EXECUTE v_definition;

  -- The mechanic root delegates to this same-owner helper. It remains non-executable by the
  -- integrator role; only the accepted context propagates through the declared delegatesTo edge.
  v_identity := 'app.saas_billing_effective_tariff(uuid,uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;
  v_old_gate := 'ARRAY[''app_clinic_billing''::name, ''app_patient''::name, ''app_platform_settings''::name, ''app_staff''::name]::name[]';
  v_new_gate := 'ARRAY[''app_clinic_billing''::name, ''app_integrator_tenant_service''::name, ''app_patient''::name, ''app_platform_settings''::name, ''app_staff''::name, ''app_tenant_service''::name]::name[]';
  IF pg_catalog.strpos(v_definition, v_new_gate) = 0 THEN
    IF pg_catalog.strpos(v_definition, v_old_gate) = 0 THEN
      v_old_gate := 'ARRAY[''app_clinic_billing''::name, ''app_patient''::name, ''app_platform_settings''::name, ''app_staff''::name, ''app_tenant_service''::name]::name[]';
    END IF;
    IF pg_catalog.strpos(v_definition, v_old_gate) = 0 THEN
      RAISE EXCEPTION 'integrator delegated tariff gate anchor not found for %', v_identity;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old_gate, v_new_gate);
  END IF;
  IF pg_catalog.strpos(v_definition, 'v_now timestamptz := statement_timestamp();') > 0 THEN
    v_definition := pg_catalog.replace(
      v_definition,
      'v_now timestamptz := statement_timestamp();',
      'v_now timestamptz;'
    );
  ELSIF pg_catalog.strpos(v_definition, 'v_now timestamptz;') = 0 THEN
    RAISE EXCEPTION 'integrator delegated tariff timestamp initializer anchor not found for %', v_identity;
  END IF;
  IF pg_catalog.strpos(v_definition, 'v_now := statement_timestamp();') = 0 THEN
    v_gate_statement := 'PERFORM app.require_attested_context_for_roles(''app_seam_org_commerce_owner''::name, '
      || v_new_gate || ');';
    IF pg_catalog.strpos(v_definition, v_gate_statement) = 0 THEN
      RAISE EXCEPTION 'integrator delegated tariff first gate statement not found for %', v_identity;
    END IF;
    v_definition := pg_catalog.replace(
      v_definition,
      v_gate_statement,
      v_gate_statement || E'\n\n  v_now := statement_timestamp();'
    );
  END IF;
  EXECUTE v_definition;
END
$migration$;
