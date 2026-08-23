-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.integrator_push_outbox') IS NULL
-- Remove the retired M2M queue from the two durable health roots before dropping the relation.

CREATE OR REPLACE FUNCTION app.archive_operator_health_failures(p_probe text, p_limit integer, p_archived_by_user_id uuid)
 RETURNS TABLE(inserted_count bigint, deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.health-archive.clear', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg]), 'app.archive_operator_health_failures(text,integer,uuid)'::regprocedure);

  IF p_probe IS NULL
    OR p_probe NOT IN (
      'outgoing_delivery',
      'outgoing_reminder_dispatch'
    )
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 500
    OR p_archived_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid operator health archive input'
      USING ERRCODE = '23514';
  END IF;

  IF p_probe IN ('outgoing_delivery', 'outgoing_reminder_dispatch') THEN
    RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT
        queue.id,
        queue.organization_id,
        queue.kind,
        queue.channel,
        queue.payload_json,
        queue.last_error,
        queue.created_at,
        audit.organization_id AS broadcast_organization_id,
        audit.actor_id AS broadcast_actor_id,
        audit.message_title AS broadcast_message_title,
        recipient.display_name AS recipient_display_name,
        recipient.first_name AS recipient_first_name,
        recipient.last_name AS recipient_last_name,
        recipient_phone.value_normalized AS recipient_phone_normalized
      FROM public.outgoing_delivery_queue AS queue
      LEFT JOIN public.broadcast_audit AS audit
        ON queue.kind = 'doctor_broadcast_intent'
       AND (queue.payload_json ->> 'broadcastAuditId')
           ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       AND audit.id = (queue.payload_json ->> 'broadcastAuditId')::uuid
      LEFT JOIN public.platform_users AS recipient
        ON queue.kind = 'doctor_broadcast_intent'
       AND (queue.payload_json ->> 'clientUserId')
           ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       AND recipient.id = (queue.payload_json ->> 'clientUserId')::uuid
      LEFT JOIN public.user_contacts AS recipient_phone
        ON recipient_phone.platform_user_id = recipient.id
       AND recipient_phone.contact_kind = 'phone'
       AND recipient_phone.is_primary = true
      WHERE queue.status = 'dead'
        AND (queue.failure_class IS NULL OR queue.failure_class <> 'recipient_blocked_bot')
        AND CASE
          WHEN p_probe = 'outgoing_reminder_dispatch' THEN queue.kind = 'reminder_dispatch'
          ELSE queue.kind <> 'reminder_dispatch'
        END
      ORDER BY queue.created_at, queue.id
      LIMIT p_limit
      FOR UPDATE OF queue SKIP LOCKED
    ), archived AS (
      INSERT INTO public.operator_health_failure_archive (
        organization_id,
        archived_by_user_id,
        health_probe,
        source_kind,
        source_id,
        severity_at_archive,
        doctor_user_id,
        summary_json,
        raw_error_truncated
      )
      SELECT
        COALESCE(candidate.organization_id, candidate.broadcast_organization_id),
        p_archived_by_user_id,
        p_probe,
        'outgoing_delivery_queue_row',
        candidate.id::text,
        'dead',
        CASE
          WHEN candidate.broadcast_actor_id
               ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          THEN candidate.broadcast_actor_id::uuid
          ELSE NULL
        END,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'reason_code', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'unknown_delivery_error'
            WHEN pg_catalog.upper(candidate.last_error) = 'BAD_PAYLOAD' THEN 'BAD_PAYLOAD'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_BROADCAST_AUDIT_ID%' THEN 'MISSING_BROADCAST_AUDIT_ID'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_INCIDENT_ID%' THEN 'MISSING_INCIDENT_ID'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_REMINDER_FIELDS%' THEN 'MISSING_REMINDER_FIELDS'
            WHEN pg_catalog.upper(candidate.last_error) LIKE 'UNKNOWN_KIND:%' THEN 'UNKNOWN_KIND'
            WHEN candidate.last_error LIKE '%broadcast_delivery_cap_exceeded%' THEN 'broadcast_delivery_cap_exceeded'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT|DEADLINE)' THEN 'timeout'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND|EAI_AGAIN)' THEN 'network'
            ELSE 'unknown_delivery_error'
          END,
          'reason_ru', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'Причина не указана'
            WHEN pg_catalog.upper(candidate.last_error) = 'BAD_PAYLOAD' THEN 'Некорректные данные задачи (payload)'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_BROADCAST_AUDIT_ID%' THEN 'В задаче нет идентификатора журнала рассылки'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_INCIDENT_ID%' THEN 'В задаче операторского алерта нет incident_id'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_REMINDER_FIELDS%' THEN 'Не хватает полей для доставки напоминания'
            WHEN pg_catalog.upper(candidate.last_error) LIKE 'UNKNOWN_KIND:%' THEN 'Неизвестный тип задачи в очереди'
            WHEN candidate.last_error LIKE '%broadcast_delivery_cap_exceeded%' THEN 'Превышен лимит строк доставки на одну рассылку'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT|DEADLINE)' THEN 'Таймаут при обращении к внешнему API'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND|EAI_AGAIN)' THEN 'Сетевая ошибка / недоступен узел'
            ELSE 'Ошибка доставки (см. усечённый текст)'
          END,
          'channel', candidate.channel,
          'queue_kind', candidate.kind,
          'broadcast_audit_id', candidate.payload_json ->> 'broadcastAuditId',
          'client_user_id', candidate.payload_json ->> 'clientUserId',
          'doctor_user_id', candidate.broadcast_actor_id,
          'broadcast_title_short', CASE
            WHEN candidate.broadcast_message_title IS NULL THEN NULL
            WHEN pg_catalog.length(pg_catalog.btrim(candidate.broadcast_message_title)) <= 100
              THEN pg_catalog.btrim(candidate.broadcast_message_title)
            ELSE pg_catalog.left(pg_catalog.btrim(candidate.broadcast_message_title), 100) || '…'
          END,
          'recipient_short_name', CASE
            WHEN pg_catalog.btrim(COALESCE(candidate.recipient_display_name, '')) <> ''
              THEN pg_catalog.left(pg_catalog.btrim(candidate.recipient_display_name), 80)
            WHEN pg_catalog.btrim(pg_catalog.concat_ws(' ', candidate.recipient_first_name, candidate.recipient_last_name)) <> ''
              THEN pg_catalog.left(pg_catalog.btrim(pg_catalog.concat_ws(' ', candidate.recipient_first_name, candidate.recipient_last_name)), 80)
            ELSE NULL
          END,
          'recipient_phone_masked', CASE
            WHEN candidate.recipient_phone_normalized IS NULL THEN NULL
            WHEN pg_catalog.length(candidate.recipient_phone_normalized) <= 4 THEN '***'
            ELSE pg_catalog.left(candidate.recipient_phone_normalized, 2)
              || pg_catalog.repeat('*', GREATEST(pg_catalog.length(candidate.recipient_phone_normalized) - 4, 3))
              || pg_catalog.right(candidate.recipient_phone_normalized, 2)
          END,
          'health_scope', 'platform'
        )),
        pg_catalog.left(candidate.last_error, 512)
      FROM candidates AS candidate
      RETURNING source_id
    ), deleted AS (
      DELETE FROM public.outgoing_delivery_queue AS queue
      USING archived
      WHERE queue.id::text = archived.source_id
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM archived),
      (SELECT count(*) FROM deleted);
    RETURN;
  END IF;

  RETURN;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: saas_system_health_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql

CREATE OR REPLACE FUNCTION app.read_curated_system_health_pre_0196() RETURNS jsonb
    LANGUAGE sql
    STABLE SECURITY DEFINER PARALLEL UNSAFE
    SET search_path TO 'pg_catalog'
    AS $_$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
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
  incident_summary, outgoing, reminders, web_push, notification_delivery,
  webhook_status, digest
$_$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner

DROP FUNCTION IF EXISTS app.enqueue_current_reminder_rule_push(text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner

DROP FUNCTION IF EXISTS app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

DROP TABLE IF EXISTS public.integrator_push_outbox;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE integrator.direct_public_write_retries
  DROP CONSTRAINT IF EXISTS direct_public_write_retries_operation_check;
ALTER TABLE integrator.direct_public_write_retries
  ADD CONSTRAINT direct_public_write_retries_operation_check CHECK (
    operation IN (
      'support_delivery_attempt_append',
      'reminder_occurrence_sent_record',
      'reminder_occurrence_failed_record',
      'reminder_occurrence_expired_record',
      'reminder_delivery_log_append',
      'content_access_grant_upsert'
    )
  );
