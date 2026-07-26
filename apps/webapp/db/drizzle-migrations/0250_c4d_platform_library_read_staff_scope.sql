-- Night plan A-2 (narrowed by research to one item): 0217_platform_lfk_ownership added policy
-- `c4d_platform_library_read` to six mixed tables (lfk_exercises, lfk_exercise_regions,
-- lfk_exercise_media, lfk_complex_templates, lfk_complex_template_exercises, media_files):
--   FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL)
-- with NO `TO <role>` restriction. A permissive RLS policy with no role list applies to every role
-- with table-level SELECT, including app_patient -- the SAME role the anonymous bootstrap
-- connection (DATABASE_URL_NONSTAFF) uses. There is no DB-level distinction between "never logged
-- in" and "logged-in patient with no org/patient context installed"; the difference is only whether
-- a principal was installed. Verified live on bersoncarebot_test:
--   has_table_privilege('app_patient', 'public.media_files', 'SELECT')   -> true
--   has_table_privilege('app_patient', 'public.lfk_exercises', 'SELECT') -> false (four of the six
--     tables were never granted to app_patient at all -- only media_files carries the live risk;
--     the other five get the same policy tightening here purely for consistency/defense-in-depth,
--     with zero privilege change since app_patient never had table access to them).
-- has_table_privilege('app_staff', 'public.lfk_exercises', 'SELECT') -> true: app_staff legitimately
-- browses the platform exercise library (apps/webapp/src/infra/repos/pgLfkExercises.ts,
-- pgLfkTemplates.ts, used only from app/app/doctor/exercises/** and
-- app/api/doctor/treatment-program-templates/**). That ambient read must keep working.
--
-- Fix: scope the policy `TO app_staff`. Staff's ambient platform-row visibility is unchanged
-- (still governed by this same policy). app_patient (and therefore the anonymous bootstrap
-- connection, and any future role never explicitly listed here) loses the OR'd platform-visibility
-- branch entirely -- a plain SELECT against any of these six tables under app_patient is now
-- governed solely by the pre-existing org/patient-scoped "saas_org_dormant_p0_8_3"/"_4" policies,
-- never by an unrestricted platform-wide branch. This is a read narrowing only; no table-level GRANT
-- is touched (app_patient's existing SELECT grant on media_files, needed for its OWN uploaded rows,
-- is untouched and still works -- the RLS predicate boundary that used to leak platform rows through
-- it is what changes).
--
-- The one legitimate non-staff consumer of platform media_files rows -- GET /api/media/[id] (and its
-- playback/preview/hls siblings) serving a platform exercise's media to a doctor OR a patient once
-- apps/webapp/src/app-layer/media/resolvePlatformLfkMediaAccess.ts has already confirmed entitlement
-- -- is redirected in this same commit to a narrow SECURITY DEFINER accessor,
-- app.read_platform_media_row(uuid), mirroring app.resolve_public_organization_by_slug
-- (deploy/postgres/public-clinic-slug-bootstrap-resolver.sql): owned by app_owner, `SET search_path
-- = pg_catalog`, EXECUTE revoked from PUBLIC and granted only to app_staff/app_patient. The function
-- body re-states the `owner_kind = 'platform' AND organization_id IS NULL` bound explicitly -- it
-- does not rely on RLS at all (app_owner is BYPASSRLS), so it cannot be widened by a future policy
-- change on these tables.
--
-- Live platform row count today: 0 (the platform library ships empty). The exposure is armed, not
-- firing -- which is exactly why it is cheap to close now, before any platform content exists.

DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_exercises;
CREATE POLICY c4d_platform_library_read ON public.lfk_exercises
  FOR SELECT TO app_staff USING (owner_kind = 'platform' AND organization_id IS NULL);

DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_exercise_regions;
CREATE POLICY c4d_platform_library_read ON public.lfk_exercise_regions
  FOR SELECT TO app_staff USING (owner_kind = 'platform' AND organization_id IS NULL);

DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_exercise_media;
CREATE POLICY c4d_platform_library_read ON public.lfk_exercise_media
  FOR SELECT TO app_staff USING (owner_kind = 'platform' AND organization_id IS NULL);

DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_complex_templates;
CREATE POLICY c4d_platform_library_read ON public.lfk_complex_templates
  FOR SELECT TO app_staff USING (owner_kind = 'platform' AND organization_id IS NULL);

DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_complex_template_exercises;
CREATE POLICY c4d_platform_library_read ON public.lfk_complex_template_exercises
  FOR SELECT TO app_staff USING (owner_kind = 'platform' AND organization_id IS NULL);

DROP POLICY IF EXISTS c4d_platform_library_read ON public.media_files;
CREATE POLICY c4d_platform_library_read ON public.media_files
  FOR SELECT TO app_staff USING (owner_kind = 'platform' AND organization_id IS NULL);

-- Narrow read bridge for the one legitimate non-staff use: serving a platform exercise's media
-- binary/metadata once resolvePlatformLfkMediaAccess() has already confirmed entitlement. Superset
-- of the columns apps/webapp/src/infra/repos/s3MediaStorage.ts's five allowPlatformBase call sites
-- need (getMediaAccessRow, getMediaRowForPlayback, getMediaS3KeyForRedirect,
-- getMediaPreviewS3KeyForRedirect); each caller selects only the fields it needs from the result.
CREATE OR REPLACE FUNCTION app.read_platform_media_row(p_media_id uuid)
RETURNS TABLE (
  id text,
  mime_type text,
  s3_key text,
  stored_path text,
  status text,
  usage_purpose text,
  uploaded_by text,
  video_processing_status text,
  hls_master_playlist_s3_key text,
  poster_s3_key text,
  video_duration_seconds integer,
  available_qualities_json jsonb,
  video_delivery_override text,
  preview_sm_key text,
  preview_md_key text,
  preview_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    id::text,
    mime_type,
    s3_key,
    stored_path,
    status,
    usage_purpose,
    uploaded_by::text,
    video_processing_status,
    hls_master_playlist_s3_key,
    poster_s3_key,
    video_duration_seconds,
    available_qualities_json,
    video_delivery_override,
    preview_sm_key,
    preview_md_key,
    preview_status
  FROM public.media_files
  WHERE id = p_media_id
    AND owner_kind = 'platform'
    AND organization_id IS NULL
    AND (status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))
$function$;

COMMENT ON FUNCTION app.read_platform_media_row(uuid) IS
  'Narrow C4D platform-library media bridge: returns a media_files row ONLY when owner_kind = platform AND organization_id IS NULL. Never returns organization- or patient-owned rows -- callers must already have confirmed entitlement (resolvePlatformLfkMediaAccess) before calling this.';

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- The definer identity, exactly as 0225/0235/0238/0240/0245/0248 do it. app_owner already holds
    -- SELECT on public.media_files (deploy/postgres/patient-media-playback-telemetry-accessors.sql)
    -- -- no new table grant is required for this accessor.
    ALTER FUNCTION app.read_platform_media_row(uuid) OWNER TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.read_platform_media_row(uuid) FROM PUBLIC;

DO $accessor_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT EXECUTE ON FUNCTION app.read_platform_media_row(uuid) TO app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.read_platform_media_row(uuid) TO app_patient;
  END IF;
END
$accessor_grants$;
