-- Narrow pre-principal organization resolver for public in-person booking.
--
-- Public booking starts under the bootstrap app_patient principal. That role deliberately has no
-- direct SELECT on the tenant-owned booking catalog tables below, so it may only derive the tenant
-- through this whitelisted function. All normal catalog/scheduling reads must happen afterwards,
-- under an explicitly installed organization principal.
--
-- The resolver used to accept a third argument, a legacy Rubitime branch-service id, and translate
-- it through public.be_external_entity_mappings. Rubitime was retired 2026-07-27 and that table is
-- dropped, so the canonical branch+service pair is the only accepted input.

\set ON_ERROR_STOP on
\pset pager off

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_owner' AND rolcanlogin = false AND rolbypassrls = true
  )
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.be_branches') IS NOT NULL
  AND to_regclass('public.be_clinic_services') IS NOT NULL
  AND to_regclass('public.be_specialist_service_availability') IS NOT NULL
)::int AS public_booking_resolver_preflight_ok \gset

\if :public_booking_resolver_preflight_ok
\else
\echo 'FATAL: public booking resolver prerequisites are missing.'
SELECT 1 / 0 AS public_booking_resolver_abort;
\endif

\if :{?public_booking_bootstrap_resolver_down}

DROP FUNCTION IF EXISTS app.resolve_public_booking_organization(uuid, uuid);
REVOKE SELECT ON TABLE public.be_branches FROM app_owner;
REVOKE SELECT ON TABLE public.be_clinic_services FROM app_owner;
REVOKE SELECT ON TABLE public.be_specialist_service_availability FROM app_owner;

\echo 'public-booking-bootstrap-resolver DOWN complete.'

\else

-- BYPASSRLS does not imply table privileges. app_owner is the existing protected NOLOGIN definer
-- identity; only it receives these reads, never the ambient runtime role.
GRANT SELECT ON TABLE public.be_branches TO app_owner;
GRANT SELECT ON TABLE public.be_clinic_services TO app_owner;
GRANT SELECT ON TABLE public.be_specialist_service_availability TO app_owner;

SET ROLE app_owner;

CREATE OR REPLACE FUNCTION app.resolve_public_booking_organization(
  p_branch_id uuid,
  p_service_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_ids uuid[];
BEGIN
  -- Both halves of the canonical pair are required: a half-supplied pair resolves no tenant.
  IF p_branch_id IS NULL OR p_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT b.organization_id)
  INTO v_organization_ids
  FROM public.be_branches AS b
  INNER JOIN public.be_clinic_services AS s
    ON s.organization_id = b.organization_id
  INNER JOIN public.be_specialist_service_availability AS availability
    ON availability.organization_id = b.organization_id
   AND availability.branch_id = b.id
   AND availability.service_id = s.id
  WHERE b.id = p_branch_id
    AND s.id = p_service_id
    AND b.is_active = true
    AND s.is_active = true
    AND s.public_widget_visible = true
    AND s.admin_manual_only = false
    AND availability.is_active = true;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.resolve_public_booking_organization(uuid, uuid) IS
  'Narrow fail-closed tenant resolver for public in-person booking bootstrap. Returns an org only for one active same-org canonical branch+service availability context.';

RESET ROLE;

ALTER FUNCTION app.resolve_public_booking_organization(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_public_booking_organization(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid) TO app_patient;

SELECT (
  p.prosecdef
  AND owner.rolname = 'app_owner'
  AND has_function_privilege('app_patient', p.oid, 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
)::int AS public_booking_resolver_function_safe_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner ON owner.oid = p.proowner
WHERE n.nspname = 'app'
  AND p.oid = 'app.resolve_public_booking_organization(uuid,uuid)'::regprocedure
\gset

\if :public_booking_resolver_function_safe_ok
\else
\echo 'FATAL: public booking resolver ownership/SECURITY DEFINER/EXECUTE boundary is invalid.'
SELECT 1 / 0 AS public_booking_resolver_function_abort;
\endif

SELECT (
  NOT has_table_privilege('app_patient', 'public.be_branches', 'SELECT')
  AND NOT has_table_privilege('app_patient', 'public.be_clinic_services', 'SELECT')
  AND NOT has_table_privilege('app_patient', 'public.be_specialist_service_availability', 'SELECT')
)::int AS public_booking_resolver_direct_select_denied_ok \gset

\if :public_booking_resolver_direct_select_denied_ok
\else
\echo 'FATAL: app_patient must not receive direct SELECT on public booking tenant tables.'
SELECT 1 / 0 AS public_booking_resolver_direct_select_abort;
\endif

\echo 'public-booking-bootstrap-resolver UP complete.'

\endif
