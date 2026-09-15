-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.manage_operator_health_alert_dedup(text,text,integer,text)') IS NOT NULL
-- M-2: the application principal has no direct privileges on operator_health_alert_sent. All
-- three lifecycle operations therefore share this one declared root; app_worker receives only
-- EXECUTE through the privilege declaration and no relation grant.
CREATE OR REPLACE FUNCTION app.manage_operator_health_alert_dedup(
  p_action text,
  p_key text,
  p_hours integer,
  p_severity text
) RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE SECURITY DEFINER PARALLEL UNSAFE
  SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_latest timestamptz;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.operator-alert-dedup.manage',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg
    ]),
    'app.manage_operator_health_alert_dedup(text,text,integer,text)'::regprocedure
  );

  IF p_key IS NULL OR btrim(p_key) = '' OR length(p_key) > 120 THEN
    RAISE EXCEPTION 'operator alert dedup key is invalid' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'was_sent' THEN
    IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
      RAISE EXCEPTION 'operator alert dedup window is invalid' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'wasSent',
      EXISTS (
        SELECT 1
          FROM public.operator_health_alert_sent AS sent
         WHERE sent.dedup_key = p_key
           AND sent.sent_at >= pg_catalog.clock_timestamp() - pg_catalog.make_interval(hours => p_hours)
      )
    );
  END IF;

  IF p_action = 'record_sent' THEN
    IF p_severity NOT IN ('critical', 'digest', 'account_conflicts', 'support') THEN
      RAISE EXCEPTION 'operator alert severity is invalid' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.operator_health_alert_sent (dedup_key, severity, sent_at)
    VALUES (p_key, p_severity, pg_catalog.clock_timestamp());
    RETURN pg_catalog.jsonb_build_object('recorded', true);
  END IF;

  IF p_action = 'latest_for_prefix' THEN
    SELECT max(sent.sent_at)
      INTO v_latest
      FROM public.operator_health_alert_sent AS sent
     WHERE sent.dedup_key LIKE p_key || '%';
    RETURN pg_catalog.jsonb_build_object('latestSentAt', v_latest);
  END IF;

  RAISE EXCEPTION 'operator alert dedup action is invalid' USING ERRCODE = '22023';
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_operator_delivery_queue_health()
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, $$NOT IN ('recipient_blocked_bot', 'reminder_not_dispatched')$$) > 0 AND pg_catalog.strpos(p.prosrc, $$'blockedRecipientTotal'$$) > 0 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.read_operator_delivery_queue_health()')
-- M-3: reassert the projection of the delivery classifier's persisted failure_class in a fresh
-- forward migration. The critical tick and health UI share this one root: blocked recipients
-- remain visible in blockedRecipientTotal but never enter deadRecent.
CREATE OR REPLACE FUNCTION app.read_operator_delivery_queue_health() RETURNS jsonb
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER PARALLEL UNSAFE
  SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  snapshot jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.delivery-queue.aggregate',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_operator_delivery_queue_health()'::regprocedure
  );

  WITH queue_rows AS (
    SELECT queue.channel AS channel,
           queue.kind AS kind,
           queue.next_retry_at AS next_retry_at,
           queue.sent_at AS sent_at,
           queue.updated_at AS updated_at,
           (queue.status IN ('pending', 'failed_retryable') AND queue.next_retry_at <= now()) AS is_due,
           (queue.status = 'dead'
             AND (queue.failure_class IS NULL OR queue.failure_class NOT IN ('recipient_blocked_bot', 'reminder_not_dispatched'))) AS is_operator_dead,
           (queue.status = 'dead' AND queue.failure_class = 'recipient_blocked_bot') AS is_blocked_dead,
           (queue.status = 'processing') AS is_processing,
           (queue.status = 'sent' AND queue.sent_at >= now() - interval '24 hours') AS is_confirmed_24h
      FROM public.outgoing_delivery_queue AS queue
  ),
  totals AS (
    SELECT count(*) FILTER (WHERE is_due) AS due_backlog,
           count(*) FILTER (WHERE is_operator_dead) AS dead_total,
           count(*) FILTER (WHERE is_operator_dead AND updated_at >= now() - interval '24 hours') AS dead_recent,
           max(updated_at) FILTER (WHERE is_operator_dead) AS last_operator_dead_at,
           count(*) FILTER (WHERE is_blocked_dead) AS blocked_recipient_total,
           count(*) FILTER (WHERE is_processing) AS processing_count,
           count(*) FILTER (WHERE is_confirmed_24h) AS confirmed_sent_last_24h,
           min(next_retry_at) FILTER (WHERE is_due) AS oldest_due_at,
           max(sent_at) AS last_sent_at,
           max(updated_at) AS last_queue_activity_at
      FROM queue_rows
  ),
  due_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, n), '{}'::jsonb) AS m
      FROM (SELECT channel, count(*) AS n FROM queue_rows WHERE is_due GROUP BY channel) AS grouped
  ),
  due_by_kind AS (
    SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) AS m
      FROM (SELECT kind, count(*) AS n FROM queue_rows WHERE is_due GROUP BY kind) AS grouped
  ),
  dead_by_kind AS (
    SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) AS m
      FROM (SELECT kind, count(*) AS n FROM queue_rows WHERE is_operator_dead GROUP BY kind) AS grouped
  ),
  sent_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, n), '{}'::jsonb) AS m
      FROM (SELECT channel, count(*) AS n FROM queue_rows WHERE is_confirmed_24h GROUP BY channel) AS grouped
  ),
  last_sent_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, last_at), '{}'::jsonb) AS m
      FROM (
        SELECT channel, max(sent_at) AS last_at
          FROM queue_rows
         WHERE is_confirmed_24h
         GROUP BY channel
      ) AS grouped
  )
  SELECT jsonb_build_object(
    'dueBacklog', totals.due_backlog,
    'deadTotal', totals.dead_total,
    'deadRecent', totals.dead_recent,
    'lastOperatorDeadAt', totals.last_operator_dead_at,
    'blockedRecipientTotal', totals.blocked_recipient_total,
    'processingCount', totals.processing_count,
    'confirmedSentLast24h', totals.confirmed_sent_last_24h,
    'oldestDueCreatedAt', totals.oldest_due_at,
    'lastSentAt', totals.last_sent_at,
    'lastQueueActivityAt', totals.last_queue_activity_at,
    'dueByChannel', due_by_channel.m,
    'dueByKind', due_by_kind.m,
    'deadByKind', dead_by_kind.m,
    'sentByChannel', sent_by_channel.m,
    'lastSentAtByChannel', last_sent_by_channel.m
  ) INTO snapshot
    FROM totals, due_by_channel, due_by_kind, dead_by_kind, sent_by_channel, last_sent_by_channel;

  RETURN snapshot;
END
$function$;
