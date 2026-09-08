-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_organization_doctor_workspace_composition()') IS NOT NULL
-- A guest invite first resolves its organization under the pre-session capability, then the route
-- installs the accepted organization principal before checking the video entitlement and workspace
-- preference. Tenant-service deliberately has no relation-wide capability, so the latter setting
-- read needs this fixed-key named root instead of direct access to public.system_settings.
CREATE FUNCTION app.read_organization_doctor_workspace_composition()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'workspace.organization-composition.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_organization_doctor_workspace_composition()'::regprocedure
  );

  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT setting.value_json
  INTO v_value
  FROM public.system_settings AS setting
  WHERE setting.key = 'doctor_workspace_composition'
    AND setting.scope = 'doctor'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
  RETURN v_value;
END
$function$;
