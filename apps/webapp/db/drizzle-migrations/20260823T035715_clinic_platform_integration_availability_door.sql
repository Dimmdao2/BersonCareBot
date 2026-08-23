-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.read_clinic_platform_integration_availability()') IS NOT NULL
--
-- A clinic manager needs one global fact before offering or accepting clinic-owned delivery
-- credentials: whether the platform exposes that integration at all. The ordinary staff wall
-- correctly hides global settings rows, while the existing server-runtime root intentionally
-- allowlists unrelated pre-session keys. This fixed-key root returns only the integration registry;
-- it does not accept a caller-controlled key and grants no relation or platform-settings access.
--
-- Rights analysis (AGENTS.md §1): this migration creates one SECURITY DEFINER function owned by
-- app_seam_settings_runtime_owner. Its body needs SELECT on the five named columns of
-- public.app_runtime_settings and EXECUTE on the existing context gate/hash helpers. The same
-- branch declares the relation surface, the app_staff EXECUTE capability, and the exact staff
-- context gate. No GRANT, REVOKE, role, policy, table, column, index, or data mutation appears here.
CREATE FUNCTION app.read_clinic_platform_integration_availability()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'config.clinic-platform-integration-availability.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_clinic_platform_integration_availability()'::regprocedure
  );

  RETURN (
    SELECT setting.value_json
      FROM public.app_runtime_settings AS setting
     WHERE setting.key = 'platform_integration_availability'
       AND setting.scope = 'admin'
       AND setting.organization_id IS NULL
       AND setting.audience = 'server'
     LIMIT 1
  );
END
$function$;
