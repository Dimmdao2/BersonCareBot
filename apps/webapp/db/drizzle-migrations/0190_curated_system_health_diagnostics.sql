-- Curated cross-tenant System Health diagnostics.
--
-- The HTTP surface is guarded by global-admin + admin mode. Database access is additionally
-- isolated behind the protected SaaS diagnostics credential and this aggregate-only function.
-- No tenant rows, identifiers, payloads, error text, recipient references or secrets leave SQL.

-- Safe non-secret feature flags used by System Health. The existing generic sync trigger keeps
-- later admin writes mirrored after the registry rows exist.
WITH definitions(key, scope, audience, default_value) AS (
  VALUES
    ('video_hls_reconcile_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_playback_api_enabled', 'admin', 'server', '{"value":false}'::jsonb)
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  definition.key,
  definition.scope,
  NULL,
  definition.audience,
  COALESCE(setting.value_json, definition.default_value),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM definitions AS definition
LEFT JOIN public.system_settings AS setting
  ON setting.key = definition.key
 AND setting.scope = definition.scope
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.read_curated_system_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
WITH
runtime_config AS MATERIALIZED (
  SELECT
    COALESCE(bool_or(
      key = 'video_hls_pipeline_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS pipeline_enabled,
    COALESCE(bool_or(
      key = 'video_hls_reconcile_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS reconcile_enabled,
    COALESCE(bool_or(
      key = 'video_playback_api_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS playback_enabled
  FROM public.app_runtime_settings
  WHERE organization_id IS NULL
    AND scope = 'admin'
    AND key IN (
      'video_hls_pipeline_enabled',
      'video_hls_reconcile_enabled',
      'video_playback_api_enabled'
    )
),
restricted_config AS MATERIALIZED (
  SELECT
    COALESCE(bool_or(
      key = 'web_push_vapid'
      AND jsonb_typeof(value_json->'value') = 'object'
      AND length(trim(COALESCE(value_json#>>'{value,publicKey}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,privateKey}', ''))) > 0
    ), false) AS vapid_configured,
    COALESCE(bool_or(
      key = 'smtp_outbound'
      AND jsonb_typeof(value_json->'value') = 'object'
      AND length(trim(COALESCE(value_json#>>'{value,host}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,user}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,password}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,from}', ''))) > 0
      AND CASE
        WHEN COALESCE(value_json#>>'{value,port}', '') ~ '^[0-9]{1,5}$'
        THEN (value_json#>>'{value,port}')::integer BETWEEN 1 AND 65535
        ELSE false
      END
    ), false) AS smtp_configured
  FROM public.system_settings
  WHERE organization_id IS NULL
    AND scope = 'admin'
    AND key IN ('web_push_vapid', 'smtp_outbound')
),
transcode AS MATERIALIZED (
  SELECT jsonb_build_object(
    'pendingCount', count(*) FILTER (WHERE status = 'pending'),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'doneLastHour', count(*) FILTER (
      WHERE status = 'done' AND finished_at >= now() - interval '1 hour'
    ),
    'failedLastHour', count(*) FILTER (
      WHERE status = 'failed' AND finished_at >= now() - interval '1 hour'
    ),
    'doneLast24h', count(*) FILTER (
      WHERE status = 'done' AND finished_at >= now() - interval '24 hours'
    ),
    'failedLast24h', count(*) FILTER (
      WHERE status = 'failed' AND finished_at >= now() - interval '24 hours'
    ),
    'doneLifetime', count(*) FILTER (WHERE status = 'done' AND finished_at IS NOT NULL),
    'failedLifetime', count(*) FILTER (WHERE status = 'failed' AND finished_at IS NOT NULL),
    'avgProcessingMsDoneLastHour', round(avg(
      extract(epoch FROM (finished_at - processing_started_at)) * 1000
    ) FILTER (
      WHERE status = 'done'
        AND finished_at >= now() - interval '1 hour'
        AND processing_started_at IS NOT NULL
    )),
    'oldestPendingAgeSeconds', floor(extract(epoch FROM (
      now() - min(created_at) FILTER (WHERE status = 'pending')
    )))
  ) AS value
  FROM public.media_transcode_jobs
),
media_readiness AS MATERIALIZED (
  SELECT jsonb_build_object(
    'legacyReconcileCandidateCountWithinSizeCap', count(*) FILTER (
      WHERE m.mime_type ILIKE 'video/%'
        AND (m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))
        AND m.s3_key IS NOT NULL AND trim(m.s3_key) <> ''
        AND (m.size_bytes IS NULL OR m.size_bytes <= 3221225472::bigint)
        AND (m.video_processing_status IS NULL OR m.video_processing_status = 'none')
        AND (m.hls_master_playlist_s3_key IS NULL OR trim(m.hls_master_playlist_s3_key) = '')
        AND NOT EXISTS (
          SELECT 1
          FROM public.media_transcode_jobs active_job
          WHERE active_job.media_id = m.id
            AND active_job.status IN ('pending', 'processing')
        )
    ),
    'readableVideoReadyWithHlsCount', count(*) FILTER (
      WHERE m.mime_type ILIKE 'video/%'
        AND (m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))
        AND m.video_processing_status = 'ready'
        AND m.hls_master_playlist_s3_key IS NOT NULL
        AND trim(m.hls_master_playlist_s3_key) <> ''
    )
  ) AS value
  FROM public.media_files m
),
safe_jobs AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'jobKey', job_key,
      'jobFamily', job_family,
      'lastStatus', CASE WHEN last_status IN ('success', 'failure') THEN last_status ELSE 'unknown' END,
      'lastFinishedAt', last_finished_at,
      'lastSuccessAt', last_success_at,
      'lastFailureAt', last_failure_at,
      'lastDurationMs', last_duration_ms,
      'safeMeta', CASE
        WHEN job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick' THEN
          jsonb_build_object(
            'failed', CASE WHEN COALESCE(meta_json->>'failed', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'failed')::integer ELSE 0 END,
            'consecutiveCronFailures', CASE
              WHEN COALESCE(meta_json->>'consecutiveCronFailures', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'consecutiveCronFailures')::integer ELSE 0 END
          )
        WHEN job_family = 'health' AND job_key = 'health.outbound_probe.run' THEN
          jsonb_build_object(
            'consecutiveFailRuns', CASE
              WHEN COALESCE(meta_json->>'consecutiveFailRuns', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'consecutiveFailRuns')::integer ELSE 0 END,
            'rubitime', CASE WHEN meta_json->>'rubitime' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'rubitime' ELSE 'no_data' END,
            'telegram', CASE WHEN meta_json->>'telegram' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'telegram' ELSE 'no_data' END,
            'max', CASE WHEN meta_json->>'max' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'max' ELSE 'no_data' END,
            'google_calendar', CASE
              WHEN meta_json->>'google_calendar' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'google_calendar' ELSE 'no_data' END
          )
        ELSE '{}'::jsonb
      END
    ) ORDER BY job_family, job_key
  ), '[]'::jsonb) AS value
  FROM public.operator_job_status
  WHERE (job_family, job_key) IN (
    ('reminders', 'reminders.web_push_only.tick'),
    ('media', 'media.pending_delete.purge'),
    ('media', 'media.multipart.cleanup'),
    ('media', 'media.preview.process'),
    ('media', 'media_transcode.reconcile'),
    ('health', 'health.system_health_guard.tick'),
    ('health', 'health.operator_health_critical.tick'),
    ('health', 'health.operator_health_digest.tick'),
    ('health', 'health.outbound_probe.run'),
    ('media', 'media.playback_stats.retention'),
    ('media', 'media.hls_proxy_errors.retention'),
    ('analytics', 'analytics.product_analytics.retention'),
    ('specialist_tasks', 'specialist_task_reminders.tick'),
    ('backup', 'backup.hourly'),
    ('backup', 'backup.daily'),
    ('backup', 'backup.weekly'),
    ('backup', 'backup.prune')
  )
),
incident_summary AS MATERIALIZED (
  SELECT jsonb_build_object(
    'openCount', count(*),
    'occurrenceCount', COALESCE(sum(occurrence_count), 0),
    'lastSeenAt', max(last_seen_at)
  ) AS value
  FROM public.operator_incidents
  WHERE resolved_at IS NULL
),
outgoing AS MATERIALIZED (
  SELECT jsonb_build_object(
    'dueBacklog', count(*) FILTER (
      WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now()
    ),
    'deadTotal', count(*) FILTER (
      WHERE status = 'dead' AND (failure_class IS NULL OR failure_class <> 'recipient_blocked_bot')
    ),
    'blockedRecipientTotal', count(*) FILTER (
      WHERE status = 'dead' AND failure_class = 'recipient_blocked_bot'
    ),
    'oldestDueAgeSeconds', floor(extract(epoch FROM (
      now() - min(created_at) FILTER (
        WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now()
      )
    ))),
    'dueByChannel', jsonb_build_object(
      'telegram', count(*) FILTER (WHERE channel = 'telegram' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'max', count(*) FILTER (WHERE channel = 'max' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'web_push', count(*) FILTER (WHERE channel = 'web_push' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'email', count(*) FILTER (WHERE channel = 'email' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'sms', count(*) FILTER (WHERE channel = 'sms' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'bot_message', count(*) FILTER (WHERE channel = 'bot_message' AND status IN ('pending','failed_retryable') AND next_retry_at <= now())
    ),
    'dueByKind', jsonb_build_object(
      'reminder_dispatch', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status IN ('pending','failed_retryable') AND next_retry_at <= now())
    ),
    'deadByKind', jsonb_build_object(
      'reminder_dispatch', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status = 'dead' AND (failure_class IS NULL OR failure_class <> 'recipient_blocked_bot'))
    ),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'reminderProcessingCount', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status = 'processing'),
    'lastSentAt', max(sent_at),
    'lastQueueActivityAt', max(updated_at)
  ) AS value
  FROM public.outgoing_delivery_queue
),
push_outbox AS MATERIALIZED (
  SELECT jsonb_build_object(
    'dueBacklog', count(*) FILTER (WHERE status = 'pending' AND next_try_at <= now()),
    'deadTotal', count(*) FILTER (WHERE status = 'dead'),
    'oldestDueAgeSeconds', floor(extract(epoch FROM (
      now() - min(next_try_at) FILTER (WHERE status = 'pending' AND next_try_at <= now())
    ))),
    'dueByKind', jsonb_build_object(
      'system_settings_sync', count(*) FILTER (WHERE kind = 'system_settings_sync' AND status = 'pending' AND next_try_at <= now()),
      'reminder_rule_upsert', count(*) FILTER (WHERE kind = 'reminder_rule_upsert' AND status = 'pending' AND next_try_at <= now())
    ),
    'deadByKind', jsonb_build_object(
      'system_settings_sync', count(*) FILTER (WHERE kind = 'system_settings_sync' AND status = 'dead'),
      'reminder_rule_upsert', count(*) FILTER (WHERE kind = 'reminder_rule_upsert' AND status = 'dead')
    ),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'oldestProcessingAgeSeconds', floor(extract(epoch FROM (
      now() - min(updated_at) FILTER (WHERE status = 'processing')
    ))),
    'lastQueueActivityAt', max(updated_at)
  ) AS value
  FROM public.integrator_push_outbox
),
reminders AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'occurrenceHistory', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.reminder_occurrence_history WHERE status = 'sent' AND occurred_at >= now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM public.reminder_occurrence_history WHERE status = 'failed' AND occurred_at >= now() - interval '24 hours')
    ),
    'deliveryEvents', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.reminder_delivery_events WHERE status = 'sent' AND created_at >= now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM public.reminder_delivery_events WHERE status = 'failed' AND created_at >= now() - interval '24 hours')
    ),
    'patientReminderM2mIdempotencyKeysActive', (
      SELECT count(*) FROM public.idempotency_keys
      WHERE key LIKE 'prn:%:channels' AND expires_at > now()
    )
  ) AS value
),
web_push AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'activeSubscriptionsCount', count(*),
    'usersWithSubscriptionCount', count(DISTINCT user_id),
    'subscriptionsTouchedLast24h', count(*) FILTER (WHERE updated_at >= now() - interval '24 hours')
  ) AS value
  FROM public.user_web_push_subscriptions
),
notification_counts AS MATERIALIZED (
  SELECT channel, status, count(*) AS count
  FROM public.notification_delivery_attempts
  WHERE created_at >= now() - interval '24 hours'
    AND channel IN ('telegram','max','web_push','email')
    AND status IN ('success','failed','skipped')
  GROUP BY channel, status
),
notification_delivery AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'totalAttempts24h', COALESCE((SELECT sum(count) FROM notification_counts), 0),
    'byChannel', (
      SELECT jsonb_object_agg(channel, jsonb_build_object(
        'successCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'success'), 0),
        'failedCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'failed'), 0),
        'skippedCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'skipped'), 0),
        'lastAttemptAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.created_at >= now() - interval '24 hours'),
        'lastSuccessAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.status = 'success' AND a.created_at >= now() - interval '24 hours'),
        'lastErrorAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.status IN ('failed','skipped') AND a.created_at >= now() - interval '24 hours'),
        'lastErrorReason', NULL,
        'lastErrorMessage', NULL
      ))
      FROM (VALUES ('telegram'),('max'),('web_push'),('email')) AS channels(channel)
    ),
    'recentIssues', '[]'::jsonb
  ) AS value
),
webhook_status AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source', source,
    'receivedAt', received_at,
    'processedOk', processed_ok = 1,
    'httpStatusReturned', http_status_returned
  ) ORDER BY source), '[]'::jsonb) AS value
  FROM public.integration_webhook_last_status
  WHERE source IN ('rubitime','telegram','max')
),
digest AS MATERIALIZED (
  SELECT max(sent_at) FILTER (WHERE dedup_key LIKE 'digest:%') AS last_sent_at
  FROM public.operator_health_alert_sent
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'config', jsonb_build_object(
    'pipelineEnabled', runtime_config.pipeline_enabled,
    'reconcileEnabled', runtime_config.reconcile_enabled,
    'playbackEnabled', runtime_config.playback_enabled,
    'vapidConfigured', restricted_config.vapid_configured,
    'smtpConfigured', restricted_config.smtp_configured
  ),
  'videoTranscode', transcode.value || media_readiness.value,
  'operatorJobs', safe_jobs.value,
  'operatorIncidents', incident_summary.value,
  'outgoingDelivery', outgoing.value,
  'integratorPushOutbox', push_outbox.value,
  'remindersPipeline', reminders.value || jsonb_build_object(
    'outgoingReminderDispatch', jsonb_build_object(
      'due', outgoing.value#>'{dueByKind,reminder_dispatch}',
      'dead', outgoing.value#>'{deadByKind,reminder_dispatch}',
      'processing', outgoing.value->'reminderProcessingCount'
    )
  ),
  'webPush', web_push.value,
  'notificationDelivery', notification_delivery.value,
  'integrationWebhookStatus', webhook_status.value,
  'operatorHealthDigestLastSentAt', digest.last_sent_at
)
FROM runtime_config, restricted_config, transcode, media_readiness, safe_jobs,
  incident_summary, outgoing, push_outbox, reminders, web_push, notification_delivery,
  webhook_status, digest
$function$;

REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM app_owner, app_staff, app_patient, app_worker;
