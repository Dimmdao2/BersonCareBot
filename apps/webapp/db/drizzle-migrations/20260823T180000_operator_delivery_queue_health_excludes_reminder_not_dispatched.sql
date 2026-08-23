-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('reminder_not_dispatched' in pg_get_functiondef(to_regprocedure('app.read_operator_delivery_queue_health()'))) > 0
-- Track D final cutover (#987), audit F3: the sibling change in
-- 20260823T170000_retire_duplicate_reminder_delivery_journals.sql excluded 'reminder_not_dispatched'
-- (a reminder_dispatch queue row that reaches a terminal decision without a real provider dispatch
-- -- stale materialization, transactional-mail rate-limit, web-push skip) from
-- app.archive_operator_health_failures and app.read_curated_system_health_pre_0196, but left the
-- actual operator alerting read (app.read_operator_delivery_queue_health -> deadRecent ->
-- countActiveOutgoingDeliveryDead -> critical banner + operator push "Отказ провайдера доставки")
-- unchanged. This is not an operator/provider death: exclude it from is_operator_dead exactly like
-- 'recipient_blocked_bot' already is. Real provider-death alerting (any other failure_class) is
-- unchanged.

CREATE OR REPLACE FUNCTION app.read_operator_delivery_queue_health() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  snapshot jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'health.delivery-queue.aggregate', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_operator_delivery_queue_health()'::regprocedure);

  WITH queue_rows AS (
    SELECT queue.channel AS channel,
           queue.kind AS kind,
           queue.created_at AS created_at,
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
           count(*) FILTER (WHERE is_operator_dead
             AND updated_at >= now() - interval '24 hours') AS dead_recent,
           max(updated_at) FILTER (WHERE is_operator_dead) AS last_operator_dead_at,
           count(*) FILTER (WHERE is_blocked_dead) AS blocked_recipient_total,
           count(*) FILTER (WHERE is_processing) AS processing_count,
           count(*) FILTER (WHERE is_confirmed_24h) AS confirmed_sent_last_24h,
           min(created_at) FILTER (WHERE is_due) AS oldest_due_created_at,
           max(sent_at) AS last_sent_at,
           max(updated_at) AS last_queue_activity_at
    FROM queue_rows
  ),
  due_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, n), '{}'::jsonb) AS m
    FROM (SELECT channel, count(*) AS n FROM queue_rows WHERE is_due GROUP BY channel) AS g
  ),
  due_by_kind AS (
    SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) AS m
    FROM (SELECT kind, count(*) AS n FROM queue_rows WHERE is_due GROUP BY kind) AS g
  ),
  dead_by_kind AS (
    SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) AS m
    FROM (SELECT kind, count(*) AS n FROM queue_rows WHERE is_operator_dead GROUP BY kind) AS g
  )
  SELECT jsonb_build_object(
    'dueBacklog', totals.due_backlog,
    'deadTotal', totals.dead_total,
    'deadRecent', totals.dead_recent,
    'lastOperatorDeadAt', totals.last_operator_dead_at,
    'blockedRecipientTotal', totals.blocked_recipient_total,
    'processingCount', totals.processing_count,
    'confirmedSentLast24h', totals.confirmed_sent_last_24h,
    'oldestDueCreatedAt', totals.oldest_due_created_at,
    'lastSentAt', totals.last_sent_at,
    'lastQueueActivityAt', totals.last_queue_activity_at,
    'dueByChannel', due_by_channel.m,
    'dueByKind', due_by_kind.m,
    'deadByKind', dead_by_kind.m
  ) INTO snapshot
  FROM totals, due_by_channel, due_by_kind, dead_by_kind;

  RETURN snapshot;
END
$function$
;
