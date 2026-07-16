-- Close the locked-runtime gaps found by the E1 post-runtime gate:
--   * patient program flags are read from the authenticated runtime projection;
--   * Global Admin playback health is exposed only as a redacted operator aggregate.

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'patient_program_discussion_media_submission_enabled',
  'admin',
  setting.organization_id,
  'authenticated_client',
  setting.value_json,
  setting.updated_at,
  setting.updated_by
FROM public.system_settings AS setting
WHERE setting.key = 'patient_program_discussion_media_submission_enabled'
  AND setting.scope = 'admin'
  AND setting.organization_id IS NOT NULL
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'patient_program_discussion_media_submission_enabled',
  'admin',
  NULL,
  'authenticated_client',
  COALESCE(setting.value_json, '{"value":false}'::jsonb),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM (SELECT 1) AS seed
LEFT JOIN public.system_settings AS setting
  ON setting.key = 'patient_program_discussion_media_submission_enabled'
 AND setting.scope = 'admin'
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.read_curated_playback_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
WITH windows(hours) AS (VALUES (24), (1)),
event_totals AS (
  SELECT
    windows.hours,
    count(events.*) AS total,
    count(events.*) FILTER (WHERE events.delivery = 'hls') AS hls,
    count(events.*) FILTER (WHERE events.delivery = 'mp4') AS mp4,
    count(events.*) FILTER (WHERE events.delivery = 'file') AS file,
    count(events.*) FILTER (WHERE events.fallback_used) AS fallback
  FROM windows
  LEFT JOIN public.media_playback_resolution_events AS events
    ON events.resolved_at >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
),
hourly_totals AS (
  SELECT
    windows.hours,
    COALESCE(sum(stats.resolved_count), 0) AS total,
    COALESCE(sum(stats.resolved_count) FILTER (WHERE stats.delivery = 'hls'), 0) AS hls,
    COALESCE(sum(stats.resolved_count) FILTER (WHERE stats.delivery = 'mp4'), 0) AS mp4,
    COALESCE(sum(stats.resolved_count) FILTER (WHERE stats.delivery = 'file'), 0) AS file,
    COALESCE(sum(stats.fallback_count), 0) AS fallback
  FROM windows
  LEFT JOIN public.media_playback_stats_hourly AS stats
    ON stats.bucket_hour >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
),
unique_totals AS (
  SELECT windows.hours, count(first_resolve.*) AS unique_pairs
  FROM windows
  LEFT JOIN public.media_playback_user_video_first_resolve AS first_resolve
    ON first_resolve.first_resolved_at >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
)
SELECT jsonb_object_agg(
  event_totals.hours::text,
  jsonb_build_object(
    'byDelivery', jsonb_build_object(
      'hls', CASE WHEN event_totals.total > 0 THEN event_totals.hls ELSE hourly_totals.hls END,
      'mp4', CASE WHEN event_totals.total > 0 THEN event_totals.mp4 ELSE hourly_totals.mp4 END,
      'file', CASE WHEN event_totals.total > 0 THEN event_totals.file ELSE hourly_totals.file END
    ),
    'fallbackTotal', CASE WHEN event_totals.total > 0 THEN event_totals.fallback ELSE hourly_totals.fallback END,
    'totalResolutions', CASE WHEN event_totals.total > 0 THEN event_totals.total ELSE hourly_totals.total END,
    'uniquePlaybackPairsFirstSeenInWindow', unique_totals.unique_pairs
  )
)
FROM event_totals
JOIN hourly_totals USING (hours)
JOIN unique_totals USING (hours)
$function$;

REVOKE ALL ON FUNCTION app.read_curated_playback_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_playback_health()
  FROM app_owner, app_staff, app_patient, app_worker;
