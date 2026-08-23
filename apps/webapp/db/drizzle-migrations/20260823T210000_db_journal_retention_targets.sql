-- BCB-MIGRATION-OWNER: app_seam_retention_sweep_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('idempotency_keys' in pg_get_functiondef(to_regprocedure('app.prune_retention_target(text,integer,boolean)'))) > 0
-- Track D final cutover (#987), §C: connect the recorded retention windows
-- (docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md, "Правила хранения") to
-- automatic cleanup through the existing chokepoints instead of a parallel prune mechanism.
--
-- `app.prune_retention_target` already prunes 4 closed-list targets for `app_seam_retention_sweep_owner`
-- (owner declared in deploy/postgres/privileges/declaration.ts). This migration widens its closed CASE
-- with 5 more branches for the still-live, still-unpruned journals named in the evidence doc:
--   - public.idempotency_keys / integrator.idempotency_keys: expires_at < now() - 24h, hourly
--   - public.outgoing_delivery_queue: status='sent' 30d by sent_at, status='dead' 180d by dead_at
--     (split into two targets: one column, one caller-supplied window, matches every existing branch)
--   - public.notification_delivery_attempts: 180d by created_at
-- Live statuses on outgoing_delivery_queue (pending/processing/failed_retryable) are never touched —
-- the branch predicate always includes the terminal status, matching the "unfinished outbox rows are
-- never pruned" rule.
--
-- `integrator.delivery_attempt_logs`, `integrator.message_retry_jobs`, `integrator.projection_outbox`
-- from the same evidence doc are already retired by earlier Track D migrations (20260821T003000,
-- 20260820T210709, and the D30 scheduler-reversal cut) — their retention rows are stale and dropped
-- with this migration rather than recreated (no table to prune).
--
-- `app.context_nonce_ledger` cannot join `prune_retention_target`: its ACL grants nothing but its
-- owner (p2-b:356-359 revokes PUBLIC/app_staff/app_patient explicitly), and its window is minutes, not
-- days (`p_retention_days` is bounded to whole days). It gets its own SECURITY DEFINER root owned by
-- the SAME role that already owns the table (`app_object_owner`, mirrors `app.install_signed_context`'s
-- owner-owns-target pattern) — `app.prune_context_nonce_ledger(p_grace_sec, p_limit, p_dry_run)`. Grace
-- defaults to 1 hour (the evidence doc's own recommendation over the formal 300s minimum: room for
-- clock skew and "look at the last hour" incident review); `p_limit` bounds one call so a first
-- catch-up run cannot hold a long DELETE lock on a multi-million-row backlog.
CREATE OR REPLACE FUNCTION app.prune_retention_target(p_target text, p_retention_days integer, p_dry_run boolean) RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  affected_count bigint;
  cutoff_at timestamptz;
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
          FROM public.idempotency_keys AS expiring
         WHERE expiring.expires_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.idempotency_keys AS expiring
           WHERE expiring.expires_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'integrator_idempotency_keys' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM integrator.idempotency_keys AS expiring
         WHERE expiring.expires_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM integrator.idempotency_keys AS expiring
           WHERE expiring.expires_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'outgoing_delivery_queue_sent' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.outgoing_delivery_queue AS expiring
         WHERE expiring.status = 'sent' AND expiring.sent_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.outgoing_delivery_queue AS expiring
           WHERE expiring.status = 'sent' AND expiring.sent_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'outgoing_delivery_queue_dead' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.outgoing_delivery_queue AS expiring
         WHERE expiring.status = 'dead' AND expiring.dead_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.outgoing_delivery_queue AS expiring
           WHERE expiring.status = 'dead' AND expiring.dead_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'notification_delivery_attempts' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.notification_delivery_attempts AS expiring
         WHERE expiring.created_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.notification_delivery_attempts AS expiring
           WHERE expiring.created_at < cutoff_at
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.prune_context_nonce_ledger(integer,integer,boolean)')) IS NOT NULL
CREATE OR REPLACE FUNCTION app.prune_context_nonce_ledger(p_grace_sec integer, p_limit integer, p_dry_run boolean) RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  affected_count bigint;
  cutoff_epoch bigint;
BEGIN
  PERFORM app.require_accepted_context('app_object_owner'::name, 'app_operational_maintenance'::name, 'service'::app.port_context_class, 'retention.context-nonce-ledger.sweep', app.hash_port_typed_args(ARRAY[ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.prune_context_nonce_ledger(integer,integer,boolean)'::regprocedure);

  IF p_grace_sec IS NULL OR p_grace_sec < 0 OR p_grace_sec > 86400 THEN
    RAISE EXCEPTION 'invalid retention grace window'
      USING ERRCODE = '23514';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500000 THEN
    RAISE EXCEPTION 'invalid retention batch limit'
      USING ERRCODE = '23514';
  END IF;
  IF p_dry_run IS NULL THEN
    RAISE EXCEPTION 'retention dry-run flag is required'
      USING ERRCODE = '23514';
  END IF;

  cutoff_epoch := floor(extract(epoch FROM now()))::bigint - p_grace_sec;

  IF p_dry_run THEN
    SELECT count(*) INTO affected_count
      FROM (
        SELECT 1 FROM app.context_nonce_ledger AS expiring
         WHERE expiring.expires_epoch < cutoff_epoch
         LIMIT p_limit
      ) AS capped;
  ELSE
    WITH victims AS (
      SELECT expiring.nonce
        FROM app.context_nonce_ledger AS expiring
       WHERE expiring.expires_epoch < cutoff_epoch
       LIMIT p_limit
    ),
    deleted AS (
      DELETE FROM app.context_nonce_ledger AS ledger
       USING victims
       WHERE ledger.nonce = victims.nonce
      RETURNING 1
    )
    SELECT count(*) INTO affected_count FROM deleted;
  END IF;

  RETURN affected_count;
END
$function$
;
