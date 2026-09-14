-- BCB-MIGRATION-OWNER: saas_system_health_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT position('artifacts' in pg_get_functiondef(to_regprocedure('app.read_curated_system_health()'))) > 0
-- Журнал бэкапов доезжает до панели здоровья по уже существующей двери.
--
-- Владелец просил видеть, какие бэкапы есть и когда сделаны. Файлы лежат на хосте, вебапп их не
-- видит; скрипт бэкапа кладёт снимок своего каталога в meta_json собственной строки
-- operator_job_status. Новой таблицы и новых грантов для этого не нужно.
--
-- Наружу список НЕ пробрасывается целиком: `safeMeta` здесь и есть аллоу-лист, и каждая запись
-- пересобирается по полям с проверкой формы. Имя файла обязано быть нашим сгенерированным именем,
-- размер и время — цифрами заданного вида. Проверка стоит здесь ВТОРОЙ раз (первый — в самом
-- скрипте) намеренно: в meta_json может писать только суперпользователь, но дверь наружу не
-- обязана этому доверять. Длина списка ограничена двадцатью записями, чтобы одна строка журнала
-- не могла раздуть снимок здоровья.
--
-- Грантов не меняет: владельцем доступа остаётся генератор привилегий.
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
),
base AS MATERIALIZED (
  SELECT app.read_curated_system_health_pre_0196()
    || jsonb_build_object(
      'mediaPreview', media_preview.value,
      'videoPlaybackClient', playback_client.value
    ) AS value
  FROM media_preview, playback_client
),
all_safe_jobs AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'jobKey', job.job_key,
      'jobFamily', job.job_family,
      'lastStatus', CASE
        WHEN job.last_status IN ('success', 'failure') THEN job.last_status
        ELSE 'unknown'
      END,
      'lastFinishedAt', job.last_finished_at,
      'lastSuccessAt', job.last_success_at,
      'lastFailureAt', job.last_failure_at,
      'lastDurationMs', job.last_duration_ms,
      'safeMeta', COALESCE((
        SELECT legacy_job->'safeMeta'
        FROM jsonb_array_elements(COALESCE(base.value->'operatorJobs', '[]'::jsonb)) AS legacy_job
        WHERE legacy_job->>'jobFamily' = job.job_family
          AND legacy_job->>'jobKey' = job.job_key
        LIMIT 1
      ), '{}'::jsonb) || CASE
        WHEN job.job_family = 'backup' THEN jsonb_build_object('artifacts', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', kept.name,
            'bytes', kept.bytes::bigint,
            'at', kept.at
          ))
          FROM (
            SELECT
              artifact->>'name' AS name,
              artifact->>'bytes' AS bytes,
              artifact->>'at' AS at
            FROM jsonb_array_elements(COALESCE(job.meta_json->'artifacts', '[]'::jsonb)) AS artifact
            WHERE artifact->>'name' ~ '^[A-Za-z0-9_]+\.dump\.age$'
              AND artifact->>'bytes' ~ '^[0-9]{1,15}$'
              AND artifact->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
            ORDER BY artifact->>'at' DESC
            LIMIT 20
          ) AS kept
        ), '[]'::jsonb))
        ELSE '{}'::jsonb
      END
    ) ORDER BY job.job_family, job.job_key
  ), '[]'::jsonb) AS value
  FROM public.operator_job_status AS job
  CROSS JOIN base
),
channel_diagnostics AS MATERIALIZED (
  SELECT jsonb_object_agg(
    channels.channel,
    (base.value #> ARRAY['notificationDelivery', 'byChannel', channels.channel])
      || jsonb_build_object(
        'lastProviderStatusCode', CASE
          WHEN diagnostic.provider_status_code BETWEEN 100 AND 599
            THEN diagnostic.provider_status_code
          ELSE NULL
        END,
        'lastErrorReason', CASE
          WHEN diagnostic.reason = 'provider_error' THEN diagnostic.reason
          ELSE NULL
        END,
        'lastErrorMessage', CASE
          WHEN diagnostic.error_message IN (
            'BadJwtToken', 'BadCertificate', 'BadCertificateEnvironment',
            'ExpiredProviderToken', 'InvalidProviderToken', 'MissingProviderToken',
            'TopicDisallowed', 'DeviceTokenNotForTopic', 'Unregistered'
          ) THEN diagnostic.error_message
          ELSE NULL
        END
      )
  ) AS value
  FROM base
  CROSS JOIN (VALUES ('telegram'), ('max'), ('web_push'), ('email')) AS channels(channel)
  LEFT JOIN LATERAL (
    SELECT attempt.provider_status_code, attempt.reason, attempt.error_message
    FROM public.notification_delivery_attempts AS attempt
    WHERE attempt.channel = channels.channel
      AND attempt.status IN ('failed', 'skipped')
      AND attempt.created_at >= now() - interval '24 hours'
    ORDER BY attempt.created_at DESC
    LIMIT 1
  ) AS diagnostic ON true
  GROUP BY base.value
),
digest_delivery AS MATERIALIZED (
  SELECT max(sent_at) AS last_sent_at
  FROM public.outgoing_delivery_queue
  WHERE kind = 'operator_health_digest'
    AND status = 'sent'
)
SELECT jsonb_set(
  jsonb_set(
    jsonb_set(
      base.value,
      ARRAY['operatorJobs'],
      all_safe_jobs.value,
      true
    ),
    ARRAY['notificationDelivery', 'byChannel'],
    channel_diagnostics.value,
    false
  ),
  ARRAY['operatorHealthDigestLastSentAt'],
  COALESCE(to_jsonb(digest_delivery.last_sent_at), 'null'::jsonb),
  true
)
FROM base, all_safe_jobs, channel_diagnostics, digest_delivery
$function$;
