-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT * FROM app.list_platform_organization_brand_domain_status() LIMIT 1;
CREATE FUNCTION app.list_platform_organization_brand_domain_status()
RETURNS TABLE(
  organization_id uuid,
  has_published_brand boolean,
  custom_domain_hostname text,
  custom_domain_status text,
  custom_domain_status_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $$
SELECT app.require_accepted_context(
  'app_seam_custom_domain_owner'::name,
  'app_platform_settings'::name,
  'platform'::app.port_context_class,
  'platform.organization.brand-domain-status.read',
  app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
  'app.list_platform_organization_brand_domain_status()'::regprocedure
);

SELECT organization.id,
  EXISTS (
    SELECT 1
    FROM public.org_brand_revisions AS revision
    WHERE revision.organization_id = organization.id
      AND revision.status = 'published'
  ),
  domain.hostname,
  domain.status,
  domain.status_reason
FROM public.be_organizations AS organization
LEFT JOIN LATERAL (
  SELECT binding.hostname, binding.status, binding.status_reason
  FROM public.org_custom_domain_bindings AS binding
  WHERE binding.organization_id = organization.id
  ORDER BY binding.updated_at DESC
  LIMIT 1
) AS domain ON true
ORDER BY organization.id;
$$;
