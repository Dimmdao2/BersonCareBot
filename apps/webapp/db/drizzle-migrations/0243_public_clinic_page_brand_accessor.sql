-- 0243_public_clinic_page_brand_accessor — the public clinic/specialist page (`/<slug>`) and its
-- booking entry (`/book/<slug>`) are ANONYMOUS surfaces: no session, no patient enrollment, no
-- staff membership. Owner ruling 2026-07-26: "лого и брендирование должно быть публичным полностью,
-- как и публичная страница клиники/специалиста" — the published clinic name and logo ARE meant to
-- be world-readable once the clinic is published, same boundary as `/book/{slug}` itself.
--
-- Root cause this migration closes: migration 0238's patient read policy on
-- `org_brand_revisions` requires `app.current_patient_user_id() IS NOT NULL` PLUS an ACTIVE
-- enrollment (`org_brand_revisions_enrolled_patient_published_read`). That is correct for the
-- patient cabinet (§5.5 of BRANDING_DOMAIN_CONTRACT.md — a patient's own enrollments), but an
-- anonymous visitor to the public page has neither a patient principal nor an enrollment, so
-- `resolveEffectiveOrgBranding()` would read zero rows and throw
-- `org_branding_core_context_unavailable` instead of degrading gracefully. Widening the existing
-- patient policy would leak drafts/archived history to every signed-in patient of every
-- organization; granting SELECT on the base tables to the unauthenticated pool role would leak
-- draft/archived revisions and unrelated organization columns. Neither is acceptable.
--
-- Fix — a narrow SECURITY DEFINER accessor, built to the exact same idiom as
-- `app.read_org_brand_core_context()` (0238) and `app.is_smtp_outbound_configured()` (0240): owned
-- by app_owner (NOLOGIN, BYPASSRLS, zero members, not request-reachable), `SET search_path` pinned
-- to pg_catalog, EXECUTE revoked from PUBLIC and granted only to `app_patient` (the stable ambient
-- role for the unauthenticated `/book/{slug}` bootstrap flow — see
-- `deploy/postgres/public-clinic-slug-bootstrap-resolver.sql`).
--
-- The accessor enforces its OWN fail-closed precondition instead of trusting the caller: it returns
-- a row only when the organization is active AND has a PUBLISHED `clinic_public_directory_entries`
-- row — the identical predicate `app.resolve_public_organization_slug` already requires. Draft and
-- archived brand revisions are never visible through this path: only `status = 'published'` is
-- joined, and an organization with no published revision at all still returns its core title (the
-- canonical organization name is not branding, §3.4) with a null logo.
CREATE OR REPLACE FUNCTION app.read_public_org_brand_projection(p_organization_id uuid)
RETURNS TABLE (
  organization_id uuid,
  core_display_name text,
  brand_display_name text,
  logo_media_id uuid,
  logo_media_ready boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    organization.id,
    organization.title,
    revision.display_name,
    revision.logo_media_id,
    (logo.id IS NOT NULL) AS logo_media_ready
  FROM public.be_organizations AS organization
  INNER JOIN public.clinic_public_directory_entries AS directory
    ON directory.organization_id = organization.id
   AND directory.is_published = true
  LEFT JOIN public.org_brand_revisions AS revision
    ON revision.organization_id = organization.id
   AND revision.status = 'published'
  LEFT JOIN public.media_files AS logo
    ON logo.id = revision.logo_media_id
   AND logo.owner_kind = 'organization'
   AND logo.organization_id = revision.organization_id
   AND logo.status = 'ready'
   AND logo.mime_type LIKE 'image/%'
  WHERE organization.id = p_organization_id
    AND organization.is_active = true
  LIMIT 1
$function$;

COMMENT ON FUNCTION app.read_public_org_brand_projection(uuid) IS
  'Anonymous public-page accessor: published clinic name + ready logo only. Fail-closed on inactive/unpublished organizations; drafts and archived revisions are never visible through this path.';

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- The definer identity, exactly as 0225/0235/0238/0240 do it.
    ALTER FUNCTION app.read_public_org_brand_projection(uuid) OWNER TO app_owner;
    -- BYPASSRLS does not imply table privileges. be_organizations is already granted to app_owner
    -- by 0238; org_brand_revisions/media_files/clinic_public_directory_entries were not previously
    -- read by any app_owner definer and are granted here.
    GRANT SELECT ON TABLE public.be_organizations TO app_owner;
    GRANT SELECT ON TABLE public.org_brand_revisions TO app_owner;
    GRANT SELECT ON TABLE public.media_files TO app_owner;
    GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.read_public_org_brand_projection(uuid) FROM PUBLIC;

DO $accessor_grants$
BEGIN
  -- app_patient: the stable ambient role the unauthenticated `/book/{slug}` bootstrap flow already
  -- runs under (see app.resolve_public_organization_by_slug grants). No other role needs EXECUTE:
  -- staff already reads branding through the session-authenticated org-branding service.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.read_public_org_brand_projection(uuid) TO app_patient;
  END IF;
END
$accessor_grants$;

-- Safe rollback/degradation contract:
--   * application rollback leaves this function dormant: nothing calls it unless the public clinic
--     page route renders, and removing the caller leaves the function unused but harmless.
--   * this migration touches no table DDL, no RLS policy and no existing grant; it only adds one
--     read-only SECURITY DEFINER function and the table-level SELECT grants app_owner needs to
--     execute it.
--   * re-widening the underlying tables' RLS policies or granting them directly to app_patient
--     instead of going through this accessor is forbidden — that would also expose draft/archived
--     revisions and unrelated organization columns.
