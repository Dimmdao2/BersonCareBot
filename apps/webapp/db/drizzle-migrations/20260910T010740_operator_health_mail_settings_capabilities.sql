-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_operator_health_imap_setting()') IS NOT NULL AND to_regprocedure('app.read_operator_health_smtp_outbound_setting(text)') IS NOT NULL
-- P5 scheduler-only capabilities. The generic scheduler relation context is the accepted caller
-- contract of the already-shipped integrator consumer; the fixed keys keep restricted values out
-- of the route-visible probe-config accessor and out of direct system_settings access.
CREATE FUNCTION app.read_operator_health_imap_setting()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
  SELECT app.require_attested_context_for_roles(
    'app_seam_settings_integrator_owner'::name,
    ARRAY['app_operational_scheduler'::name]::name[]
  );

  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'operator_health_imap'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE FUNCTION app.read_operator_health_smtp_outbound_setting(p_audience text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
  SELECT app.require_attested_context_for_roles(
    'app_seam_settings_integrator_owner'::name,
    ARRAY['app_operational_scheduler'::name]::name[]
  );

  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_audience IN ('patient', 'staff')
    AND setting.key = CASE p_audience
      WHEN 'patient' THEN 'therapygo_smtp_outbound'
      WHEN 'staff' THEN 'therapysto_smtp_outbound'
    END
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
