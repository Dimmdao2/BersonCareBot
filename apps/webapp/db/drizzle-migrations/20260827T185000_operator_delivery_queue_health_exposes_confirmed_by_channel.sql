-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('sentByChannel' in pg_get_functiondef(to_regprocedure('app.read_operator_delivery_queue_health()'))) > 0
-- Systemic residual audit 2026-08-27 §C2, second reader. The operator delivery-queue health root
-- already classifies every queue row as `is_confirmed_24h` (`status = 'sent'` inside the window) and
-- already groups the same rows by channel for `dueByChannel`; it simply never exposed the confirmed
-- side per channel. Without it, the only per-channel "did anything get delivered" number available to
-- a webapp reader is `notification_delivery_attempts.status = 'success'` -- a row that cannot exist
-- since 20260826T170000 made that journal failure-only.
--
-- Adding it here rather than letting the reader SELECT `outgoing_delivery_queue` directly is the
-- point: no runtime webapp role holds a grant on that table (see the generated privileges artifact),
-- so a direct read would be a 42501 waiting for its first live call. This root already declares
-- `channel`, `status` and `sent_at` as its surface, so no grant changes and this migration, like
-- every other, grants and revokes nothing.
CREATE OR REPLACE FUNCTION app.read_operator_delivery_queue_health() RETURNS jsonb
    LANGUAGE plpgsql
    STABLE SECURITY DEFINER
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
  ),
  -- Audit §C2: per-channel CONFIRMED delivery. The attempt journal is failure-only, so this is the
  -- only place a per-channel success can be counted; the health card reads it from here instead of
  -- asking a failure journal for successes it can never hold.
  sent_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, n), '{}'::jsonb) AS m
    FROM (SELECT channel, count(*) AS n FROM queue_rows WHERE is_confirmed_24h GROUP BY channel) AS g
  ),
  last_sent_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, last_at), '{}'::jsonb) AS m
    FROM (
      SELECT channel, max(sent_at) AS last_at
      FROM queue_rows
      WHERE is_confirmed_24h
      GROUP BY channel
    ) AS g
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
    'deadByKind', dead_by_kind.m,
    'sentByChannel', sent_by_channel.m,
    'lastSentAtByChannel', last_sent_by_channel.m
  ) INTO snapshot
  FROM totals, due_by_channel, due_by_kind, dead_by_kind, sent_by_channel, last_sent_by_channel;

  RETURN snapshot;
END
$function$
;
