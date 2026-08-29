-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.list_configured_custom_domain_hostnames()') IS NOT NULL
-- Rights analysis (AGENTS.md §1): this creates one SECURITY DEFINER function owned by the existing
-- settings-runtime seam. Its body needs SELECT on exactly system_settings(key, scope,
-- organization_id, value_json). The declaration owns that relation surface and gives EXECUTE only
-- to app_worker through one exact service capability. The migration grants and revokes nothing.
CREATE FUNCTION app.list_configured_custom_domain_hostnames()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  hostnames jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.custom-domain.list',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_configured_custom_domain_hostnames()'::regprocedure
  );

  SELECT COALESCE(
    jsonb_agg(
      lower(btrim(setting.value_json ->> 'value'))
      ORDER BY lower(btrim(setting.value_json ->> 'value'))
    ),
    '[]'::jsonb
  )
  INTO hostnames
  FROM public.system_settings AS setting
  WHERE setting.key = 'org_custom_domain_hostname'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NOT NULL
    AND jsonb_typeof(setting.value_json -> 'value') = 'string'
    AND btrim(setting.value_json ->> 'value') <> '';

  RETURN hostnames;
END
$function$;
