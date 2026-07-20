-- Narrow pre-principal organization resolver for the canonical public booking link
-- `/book/{publicSlug}` (owner canon: docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md §1).
--
-- Public booking starts under the bootstrap app_patient principal. That role deliberately has no
-- direct SELECT on slug claims, `clinic_public_directory_entries` or `be_organizations`, so it may only derive
-- the tenant through this whitelisted function. All normal catalog/scheduling reads must happen
-- afterwards, under an explicitly installed organization principal. Mirrors the sibling resolver in
-- `deploy/postgres/public-booking-bootstrap-resolver.sql`.

\set ON_ERROR_STOP on
\pset pager off

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_owner' AND rolcanlogin = false AND rolbypassrls = true
  )
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.organization_slug_claims') IS NOT NULL
  AND to_regclass('public.clinic_public_directory_entries') IS NOT NULL
  AND to_regclass('public.be_organizations') IS NOT NULL
)::int AS public_clinic_slug_resolver_preflight_ok \gset

\if :public_clinic_slug_resolver_preflight_ok
\else
\echo 'FATAL: public clinic slug resolver prerequisites are missing.'
SELECT 1 / 0 AS public_clinic_slug_resolver_abort;
\endif

\if :{?public_clinic_slug_bootstrap_resolver_down}

DROP FUNCTION IF EXISTS app.resolve_public_organization_by_slug(text);
DROP FUNCTION IF EXISTS app.resolve_public_organization_slug(text);
REVOKE SELECT ON TABLE public.organization_slug_claims FROM app_owner;
REVOKE SELECT ON TABLE public.clinic_public_directory_entries FROM app_owner;
REVOKE SELECT ON TABLE public.be_organizations FROM app_owner;

\echo 'public-clinic-slug-bootstrap-resolver DOWN complete.'

\else

-- BYPASSRLS does not imply table privileges. app_owner is the existing protected NOLOGIN definer
-- identity; only it receives these reads, never the ambient runtime role.
GRANT SELECT ON TABLE public.organization_slug_claims TO app_owner;
GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_owner;
GRANT SELECT ON TABLE public.be_organizations TO app_owner;

SET ROLE app_owner;

CREATE OR REPLACE FUNCTION app.resolve_public_organization_slug(p_slug text)
RETURNS TABLE (
  organization_id uuid,
  requested_slug text,
  requested_kind text,
  canonical_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    requested.organization_id,
    requested.slug,
    requested.kind,
    current_claim.slug
  FROM public.organization_slug_claims AS requested
  INNER JOIN public.organization_slug_claims AS current_claim
    ON current_claim.organization_id = requested.organization_id
    AND current_claim.kind = 'current'
  INNER JOIN public.clinic_public_directory_entries AS directory
    ON directory.organization_id = requested.organization_id
    AND directory.is_published = true
  INNER JOIN public.be_organizations AS organization
    ON organization.id = requested.organization_id
    AND organization.is_active = true
  WHERE requested.slug = lower(btrim(p_slug))
    AND requested.kind IN ('current', 'alias')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_public_organization_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT resolved.organization_id
  FROM app.resolve_public_organization_slug(p_slug) AS resolved
  LIMIT 1
$$;

COMMENT ON FUNCTION app.resolve_public_organization_slug(text) IS
  'Narrow fail-closed canonical slug resolver. Current and alias slugs resolve directly to the published active organization and its single current slug.';
COMMENT ON FUNCTION app.resolve_public_organization_by_slug(text) IS
  'Compatibility tenant resolver for /book/{publicSlug}; delegates to the canonical current/alias resolver.';

RESET ROLE;

ALTER FUNCTION app.resolve_public_organization_slug(text) OWNER TO app_owner;
ALTER FUNCTION app.resolve_public_organization_by_slug(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_public_organization_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_public_organization_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO app_patient;

SELECT (
  count(*) = 2
  AND bool_and(p.prosecdef)
  AND bool_and(owner.rolname = 'app_owner')
  AND bool_and(has_function_privilege('app_patient', p.oid, 'EXECUTE'))
  AND bool_and(NOT EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ))
)::int AS public_clinic_slug_resolver_function_safe_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner ON owner.oid = p.proowner
WHERE n.nspname = 'app'
  AND p.oid IN (
    'app.resolve_public_organization_slug(text)'::regprocedure,
    'app.resolve_public_organization_by_slug(text)'::regprocedure
  )
\gset

\if :public_clinic_slug_resolver_function_safe_ok
\else
\echo 'FATAL: public clinic slug resolver ownership/SECURITY DEFINER/EXECUTE boundary is invalid.'
SELECT 1 / 0 AS public_clinic_slug_resolver_function_abort;
\endif

SELECT (
  NOT has_table_privilege('app_patient', 'public.organization_slug_claims', 'SELECT')
  AND NOT has_table_privilege('app_patient', 'public.clinic_public_directory_entries', 'SELECT')
  AND NOT has_table_privilege('app_patient', 'public.be_organizations', 'SELECT')
)::int AS public_clinic_slug_resolver_direct_select_denied_ok \gset

\if :public_clinic_slug_resolver_direct_select_denied_ok
\else
\echo 'FATAL: app_patient must not receive direct SELECT on public clinic slug tenant tables.'
SELECT 1 / 0 AS public_clinic_slug_resolver_direct_select_abort;
\endif

\echo 'public-clinic-slug-bootstrap-resolver UP complete.'

\endif
