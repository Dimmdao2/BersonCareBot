-- BCB-MIGRATION-OWNER: saas_system_health_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- The scheduled critical-health job needs one bounded cross-tenant canary snapshot. Keep raw
-- organization/member relations closed to the worker and expose only counts through the existing
-- telemetry capability.

CREATE OR REPLACE FUNCTION app.read_tenant_isolation_canary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
  SELECT app.require_attested_context_for_roles(
    'saas_system_health_owner'::name,
    ARRAY['saas_telemetry_operator'::name]::name[]
  );

  WITH sample AS MATERIALIZED (
    SELECT organization.id AS organization_id,
           organization.is_active,
           count(member.id)::bigint AS member_row_count
      FROM public.be_organizations AS organization
      LEFT JOIN public.be_organization_members AS member
        ON member.organization_id = organization.id
     GROUP BY organization.id, organization.is_active
     ORDER BY organization.id
     LIMIT 4097
  ), numbered AS (
    SELECT sample.*, row_number() OVER (ORDER BY sample.organization_id) AS row_number
      FROM sample
  )
  SELECT jsonb_build_object(
    'organizations', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'organizationId', numbered.organization_id,
          'isActive', numbered.is_active,
          'memberRowCount', numbered.member_row_count
        ) ORDER BY numbered.organization_id
      ) FILTER (WHERE numbered.row_number <= 4096),
      '[]'::jsonb
    ),
    'truncated', count(*) > 4096
  )
  FROM numbered
$function$;

REVOKE ALL ON FUNCTION app.read_tenant_isolation_canary() FROM PUBLIC;
