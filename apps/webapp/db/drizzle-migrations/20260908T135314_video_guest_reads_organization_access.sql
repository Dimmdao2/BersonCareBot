-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_organization_doctor_workspace_composition()') IS NOT NULL AND to_regprocedure('app.resolve_current_organization_mechanic_access(text)') IS NOT NULL
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

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The shared resolver remains attested for staff, patient and both tenant-service roles. This exact
-- entrypoint admits only the guest route's accepted webapp organization principal and delegates the
-- tariff computation instead of copying it.
CREATE FUNCTION app.resolve_current_organization_mechanic_access(p_mechanic text)
RETURNS TABLE(mechanic text, state text, policy_source text, warning jsonb, mutation_allowed boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_org_commerce_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'entitlement.organization-mechanic-access.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_mechanic))::app.port_typed_arg
    ]),
    'app.resolve_current_organization_mechanic_access(text)'::regprocedure
  );

  v_org := app.current_org_id();
  RETURN QUERY
  SELECT access.mechanic, access.state, access.policy_source, access.warning, access.mutation_allowed
  FROM app.resolve_organization_mechanic_access(v_org, p_mechanic) AS access;
END
$function$;
