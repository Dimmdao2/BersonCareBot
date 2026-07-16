\set ON_ERROR_STOP on
\pset pager off

-- Run as PostgreSQL superuser against DEV or an explicitly disposable SaaS scratch DB.
-- All fixture writes and principal-context rows are rolled back; output is aggregate-only.
SELECT 1 / (
  current_database() = 'bcb_webapp_dev'
  OR current_database() ~ '^bcb_saas_[a-z0-9_]*scratch[a-z0-9_]*$'
)::int AS scratch_database_guard;

BEGIN;

-- DEV may not have the strict overlay's schema-USAGE grant yet; keep this scratch-only and rolled back.
GRANT USAGE ON SCHEMA app TO app_patient;

SELECT
  enrollment.organization_id AS own_org,
  enrollment.platform_user_id AS patient_user,
  media.id AS own_media,
  (
    SELECT organization.id
    FROM public.be_organizations AS organization
    WHERE organization.id <> enrollment.organization_id
    ORDER BY organization.id
    LIMIT 1
  ) AS cross_org
FROM public.org_enrollments AS enrollment
JOIN public.media_files AS media
  ON media.organization_id = enrollment.organization_id
WHERE enrollment.status = 'active'
  AND media.organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.be_organizations AS organization
    WHERE organization.id <> enrollment.organization_id
  )
ORDER BY enrollment.organization_id, enrollment.platform_user_id, media.id
LIMIT 1
\gset

INSERT INTO public.media_files
  (organization_id, original_name, stored_path, mime_type, size_bytes, status, preview_status)
VALUES
  (:'cross_org'::uuid, 'scratch-cross-org', 'scratch/cross-org', 'video/mp4', 1, 'ready', 'skipped')
RETURNING id AS cross_media
\gset

SELECT count(*)::integer AS event_count_before
FROM public.media_playback_resolution_events
WHERE organization_id = :'own_org'::uuid
  AND user_id = :'patient_user'::uuid
  AND media_id = :'own_media'::uuid
  AND delivery = 'file'
\gset

SELECT COALESCE(sum(resolved_count), 0)::integer AS stat_count_before
FROM public.media_playback_stats_hourly
WHERE bucket_hour = date_trunc('hour', clock_timestamp())
  AND delivery = 'file'
\gset

DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid();
INSERT INTO app.principal_context
  (backend_pid, org_id, patient_user_id, integrator_user_id, nonce, expires_epoch)
VALUES
  (
    pg_backend_pid(),
    :'own_org'::uuid,
    :'patient_user'::uuid,
    NULL,
    'scratch-patient-playback-' || pg_backend_pid()::text,
    floor(extract(epoch FROM clock_timestamp()))::bigint + 300
  );

SET LOCAL ROLE app_patient;
SELECT app.increment_media_playback_resolution_stat(
  :'patient_user'::uuid,
  :'own_media'::uuid,
  'file',
  false
);
SELECT app.record_media_playback_resolution_event(
  :'patient_user'::uuid,
  :'own_media'::uuid,
  'file',
  false
);

SELECT format(
  $sql$
DO $cross_org_denial$
BEGIN
  PERFORM app.record_media_playback_resolution_event(%L::uuid, %L::uuid, 'file', false);
  RAISE EXCEPTION 'scratch_cross_org_media_unexpectedly_allowed';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END
$cross_org_denial$;
$sql$,
  :'patient_user',
  :'cross_media'
) \gexec

RESET ROLE;

SELECT 1 / (
  (
    SELECT count(*)::integer
    FROM public.media_playback_resolution_events
    WHERE organization_id = :'own_org'::uuid
      AND user_id = :'patient_user'::uuid
      AND media_id = :'own_media'::uuid
      AND delivery = 'file'
  ) = :event_count_before::integer + 1
)::int AS own_event_recorded_once;

SELECT 1 / (
  (
    SELECT COALESCE(sum(resolved_count), 0)::integer
    FROM public.media_playback_stats_hourly
    WHERE bucket_hour = date_trunc('hour', clock_timestamp())
      AND delivery = 'file'
  ) = :stat_count_before::integer + 1
)::int AS own_stat_incremented_once;

SELECT 1 / (
  NOT EXISTS (
    SELECT 1
    FROM public.media_playback_resolution_events
    WHERE organization_id = :'cross_org'::uuid
      AND user_id = :'patient_user'::uuid
      AND media_id = :'cross_media'::uuid
  )
)::int AS cross_org_event_denied;

ROLLBACK;
