-- BCB-MIGRATION-OWNER: app_seam_retention_sweep_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('reminder_occurrence_history' in pg_get_functiondef(to_regprocedure('app.prune_retention_target(text,integer,boolean)'))) > 0 AND position('message_log' in pg_get_functiondef(to_regprocedure('app.prune_retention_target(text,integer,boolean)'))) > 0
-- Systemic residual audit 2026-08-27, §C3 + §E1: the ONE closed-list retention root gains the two
-- stores the policy sweep of 08-08 never named.
--
--   * public.reminder_occurrence_history — the single physical occurrence table created by the Track D
--     consolidation (20260823T220000). It landed in neither `prune_retention_target` nor the window
--     table, so it is simultaneously un-aged and (before this branch's sibling purge fix) able to
--     outlive the account it belongs to. Only TERMINAL occurrences are eligible: 'sent', 'failed',
--     'skipped'. 'planned'/'queued' are unfinished work — deleting them silently cancels a reminder a
--     patient is still waiting for, the same rule that keeps live `outgoing_delivery_queue` statuses
--     out of the sweep. The window column is `planned_at`: NOT NULL for every row (`occurred_at` is
--     only filled at finalize) and already the trailing column of
--     `idx_reminder_occurrence_history_status_planned_at (status, planned_at)`, so the branch reads
--     an index it did not have to invent.
--     The BRANCH is added here; the WINDOW is not chosen here. No owner data policy names a retention
--     period for reminder history — `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md`
--     "Правила хранения" predates the consolidation and does not list this table, and the formal
--     retention matrix of PR-03 is still an open owner checkbox. The caller therefore refuses to run
--     this target until the owner names the number (see
--     `apps/webapp/src/modules/db-retention/journalRetention.ts`, OWNER QUESTION OQ-REMINDER-HISTORY-WINDOW).
--     A window invented by an agent would delete patient adherence history on a made-up schedule.
--
--   * public.message_log — the doctor→patient message journal. It stores `text` (the message actually
--     sent to a person) and `error_message`, is written by a live writer
--     (`apps/webapp/src/infra/repos/pgMessageLog.ts`) and had no window at all (audit §E1). Its class
--     IS named by the existing policy: journals that carry the content of a message sent to a person
--     get 90 days — `integrator.delivery_attempt_logs` ("payload_json — тело отправленного сообщения",
--     90 суток по occurred_at) and `public.support_delivery_events` ("Тот же класс, что
--     delivery_attempt_logs, и то же ограничение: payload_json — содержимое переписки с пациентом").
--     The window column is `sent_at` (indexed by `idx_message_log_sent_at`). No new policy is invented
--     here: the table is placed in the class the policy already defines.
--
-- Both branches cap one call at `batch_limit` rows through a victims CTE, exactly like the five
-- branches added by the Track D cutover (audit F4): a first catch-up run must not hold one long lock.
-- This migration grants and revokes nothing; the seam owner's SELECT/DELETE on the two new relations
-- is declared in deploy/postgres/privileges/declaration.ts and arrives with the generator reconcile.
CREATE OR REPLACE FUNCTION app.prune_retention_target(p_target text, p_retention_days integer, p_dry_run boolean) RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  affected_count bigint;
  cutoff_at timestamptz;
  -- A first catch-up run must not hold one long DELETE lock on a multi-million-row backlog (same
  -- reasoning as app.prune_context_nonce_ledger's p_limit). Every branch added by Track D final
  -- cutover (#987) below caps its DELETE at this many rows per invocation; the hourly tick catches
  -- up over repeated calls instead of issuing one unbounded backlog DELETE.
  batch_limit CONSTANT bigint := 200000;
BEGIN
  PERFORM app.require_accepted_context('app_seam_retention_sweep_owner'::name, 'app_operational_maintenance'::name, 'service'::app.port_context_class, 'retention.locked-tenant-table.sweep', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.prune_retention_target(text,integer,boolean)'::regprocedure);

  IF p_retention_days IS NULL
    OR p_retention_days < 1
    OR p_retention_days > 3650
  THEN
    RAISE EXCEPTION 'invalid retention window'
      USING ERRCODE = '23514';
  END IF;

  IF p_dry_run IS NULL THEN
    RAISE EXCEPTION 'retention dry-run flag is required'
      USING ERRCODE = '23514';
  END IF;

  cutoff_at := now() - make_interval(days => p_retention_days);

  -- ЗАКРЫТЫЙ СПИСОК. Ветка добавляется только вместе с объявленной поверхностью в
  -- deploy/postgres/privileges/declaration.ts; всё остальное отказывает ниже в ELSE.
  CASE p_target
    WHEN 'media_hls_proxy_error_events' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.media_hls_proxy_error_events AS expiring
         WHERE expiring.created_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.media_hls_proxy_error_events AS expiring
           WHERE expiring.created_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'product_analytics_events_recent' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.product_analytics_events_recent AS expiring
         WHERE expiring.occurred_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.product_analytics_events_recent AS expiring
           WHERE expiring.occurred_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'product_analytics_user_hourly' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.product_analytics_user_hourly AS expiring
         WHERE expiring.bucket_hour < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.product_analytics_user_hourly AS expiring
           WHERE expiring.bucket_hour < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'product_push_notifications' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.product_push_notifications AS expiring
         WHERE expiring.created_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.product_push_notifications AS expiring
           WHERE expiring.created_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'public_idempotency_keys' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.idempotency_keys AS expiring
             WHERE expiring.expires_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.key
            FROM public.idempotency_keys AS expiring
           WHERE expiring.expires_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.idempotency_keys AS target
           USING victims
           WHERE target.key = victims.key
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'integrator_idempotency_keys' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM integrator.idempotency_keys AS expiring
             WHERE expiring.expires_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.key
            FROM integrator.idempotency_keys AS expiring
           WHERE expiring.expires_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM integrator.idempotency_keys AS target
           USING victims
           WHERE target.key = victims.key
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'outgoing_delivery_queue_sent' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.outgoing_delivery_queue AS expiring
             WHERE expiring.status = 'sent' AND expiring.sent_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.outgoing_delivery_queue AS expiring
           WHERE expiring.status = 'sent' AND expiring.sent_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.outgoing_delivery_queue AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'outgoing_delivery_queue_dead' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.outgoing_delivery_queue AS expiring
             WHERE expiring.status = 'dead' AND expiring.dead_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.outgoing_delivery_queue AS expiring
           WHERE expiring.status = 'dead' AND expiring.dead_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.outgoing_delivery_queue AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'notification_delivery_attempts' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.notification_delivery_attempts AS expiring
             WHERE expiring.created_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.notification_delivery_attempts AS expiring
           WHERE expiring.created_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.notification_delivery_attempts AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'reminder_occurrence_history_terminal' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.reminder_occurrence_history AS expiring
             WHERE expiring.status IN ('sent', 'failed', 'skipped')
               AND expiring.planned_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.reminder_occurrence_history AS expiring
           WHERE expiring.status IN ('sent', 'failed', 'skipped')
             AND expiring.planned_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.reminder_occurrence_history AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'message_log' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.message_log AS expiring
             WHERE expiring.sent_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.message_log AS expiring
           WHERE expiring.sent_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.message_log AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    ELSE
      RAISE EXCEPTION 'unknown retention target %', p_target
        USING ERRCODE = '22023';
  END CASE;

  RETURN affected_count;
END
$function$
;
