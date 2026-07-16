-- Forward-only refresh for databases that already recorded migrations 0190 and 0192.
-- Fresh installs still receive the complete canonical definitions from those migrations.

ALTER FUNCTION app.read_curated_system_health()
  RENAME TO read_curated_system_health_pre_0196;
ALTER FUNCTION app.read_curated_playback_health()
  RENAME TO read_curated_playback_health_pre_0196;

REVOKE ALL ON FUNCTION app.read_curated_system_health_pre_0196()
  FROM PUBLIC, app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator;
REVOKE ALL ON FUNCTION app.read_curated_playback_health_pre_0196()
  FROM PUBLIC, app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator;

CREATE OR REPLACE FUNCTION app.read_curated_system_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
WITH media_preview AS MATERIALIZED (
  SELECT jsonb_build_object(
    'stalePendingCount', count(*) FILTER (
      WHERE mime_type IN ('video/quicktime', 'image/heic', 'image/heif')
        AND preview_status = 'pending'
        AND created_at < now() - interval '30 minutes'
    ),
    'byMimeAndStatus', jsonb_build_object(
      'video/quicktime', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'skipped')
      ),
      'image/heic', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'skipped')
      ),
      'image/heif', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'skipped')
      )
    )
  ) AS value
  FROM public.media_files
),
playback_client AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'totalErrors', count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
    'totalErrorsLast1h', count(*) FILTER (WHERE created_at >= now() - interval '1 hour'),
    'byEvent', jsonb_build_object(
      'hls_fatal', count(*) FILTER (WHERE event_class = 'hls_fatal' AND created_at >= now() - interval '24 hours'),
      'video_error', count(*) FILTER (WHERE event_class = 'video_error' AND created_at >= now() - interval '24 hours'),
      'hls_import_failed', count(*) FILTER (WHERE event_class = 'hls_import_failed' AND created_at >= now() - interval '24 hours'),
      'playback_refetch_failed', count(*) FILTER (WHERE event_class = 'playback_refetch_failed' AND created_at >= now() - interval '24 hours'),
      'playback_refetch_exception', count(*) FILTER (WHERE event_class = 'playback_refetch_exception' AND created_at >= now() - interval '24 hours'),
      'hls_js_unsupported', count(*) FILTER (WHERE event_class = 'hls_js_unsupported' AND created_at >= now() - interval '24 hours')
    ),
    'byEventLast1h', jsonb_build_object(
      'hls_fatal', count(*) FILTER (WHERE event_class = 'hls_fatal' AND created_at >= now() - interval '1 hour'),
      'video_error', count(*) FILTER (WHERE event_class = 'video_error' AND created_at >= now() - interval '1 hour'),
      'hls_import_failed', count(*) FILTER (WHERE event_class = 'hls_import_failed' AND created_at >= now() - interval '1 hour'),
      'playback_refetch_failed', count(*) FILTER (WHERE event_class = 'playback_refetch_failed' AND created_at >= now() - interval '1 hour'),
      'playback_refetch_exception', count(*) FILTER (WHERE event_class = 'playback_refetch_exception' AND created_at >= now() - interval '1 hour'),
      'hls_js_unsupported', count(*) FILTER (WHERE event_class = 'hls_js_unsupported' AND created_at >= now() - interval '1 hour')
    ),
    'byDelivery', jsonb_build_object(
      'hls', count(*) FILTER (WHERE delivery = 'hls' AND created_at >= now() - interval '24 hours'),
      'mp4', count(*) FILTER (WHERE delivery = 'mp4' AND created_at >= now() - interval '24 hours'),
      'file', count(*) FILTER (WHERE delivery = 'file' AND created_at >= now() - interval '24 hours')
    ),
    'likelyLooping', EXISTS (
      SELECT 1
      FROM public.media_playback_client_events looping
      WHERE looping.event_class = 'hls_fatal'
        AND looping.created_at >= date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      GROUP BY looping.media_id
      HAVING count(*) >= 3
    ),
    'recent', '[]'::jsonb
  ) AS value
  FROM public.media_playback_client_events
)
SELECT app.read_curated_system_health_pre_0196()
  || jsonb_build_object(
    'mediaPreview', media_preview.value,
    'videoPlaybackClient', playback_client.value
  )
FROM media_preview, playback_client
$function$;

CREATE OR REPLACE FUNCTION app.read_curated_playback_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
WITH hls_proxy AS (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'errorsTotal24h', count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
    'errorsTotal1h', count(*) FILTER (WHERE created_at >= now() - interval '1 hour'),
    'byReason', jsonb_build_object(
      'session_unauthorized', 0, 'feature_disabled', 0, 'media_not_readable', 0,
      'forbidden_path', 0, 'missing_object', 0, 'upstream_403', 0,
      's3_read_failed', 0, 'upstream_timeout', 0, 'range_not_satisfiable', 0,
      'playlist_read_failed', 0, 'playlist_rewrite_failed', 0, 'internal_error', 0
    ) || COALESCE((
      SELECT jsonb_object_agg(reason_code, reason_count)
      FROM (
        SELECT reason_code, count(*) AS reason_count
        FROM public.media_hls_proxy_error_events
        WHERE created_at >= now() - interval '24 hours'
        GROUP BY reason_code
      ) counts
    ), '{}'::jsonb),
    'byReasonLast1h', jsonb_build_object(
      'session_unauthorized', 0, 'feature_disabled', 0, 'media_not_readable', 0,
      'forbidden_path', 0, 'missing_object', 0, 'upstream_403', 0,
      's3_read_failed', 0, 'upstream_timeout', 0, 'range_not_satisfiable', 0,
      'playlist_read_failed', 0, 'playlist_rewrite_failed', 0, 'internal_error', 0
    ) || COALESCE((
      SELECT jsonb_object_agg(reason_code, reason_count)
      FROM (
        SELECT reason_code, count(*) AS reason_count
        FROM public.media_hls_proxy_error_events
        WHERE created_at >= now() - interval '1 hour'
        GROUP BY reason_code
      ) counts
    ), '{}'::jsonb),
    'degraded', CASE
      WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') >= 20 THEN true
      WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') >= 15 THEN
        count(*) FILTER (
          WHERE created_at >= now() - interval '1 hour'
            AND reason_code IN ('upstream_403', 'missing_object')
        )::numeric / count(*) FILTER (WHERE created_at >= now() - interval '1 hour') >= 0.35
      ELSE false
    END,
    'recent', '[]'::jsonb
  ) AS value
  FROM public.media_hls_proxy_error_events
)
SELECT app.read_curated_playback_health_pre_0196()
  || jsonb_build_object('hlsProxy', hls_proxy.value)
FROM hls_proxy
$function$;

REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_system_health()
  FROM app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator;
REVOKE ALL ON FUNCTION app.read_curated_playback_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_playback_health()
  FROM app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator;
