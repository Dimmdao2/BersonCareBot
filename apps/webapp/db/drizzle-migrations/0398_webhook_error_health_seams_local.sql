-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Health aggregation and retention stay exact roots; app_worker never receives table ACL.
CREATE OR REPLACE FUNCTION app.list_integration_webhook_burst_signals(
  p_window_minutes integer,
  p_min_count integer
)
RETURNS TABLE(source text, error_class text, event_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_window_minutes IS NULL
    OR p_window_minutes < 1
    OR p_window_minutes > 10080
    OR p_min_count IS NULL
    OR p_min_count < 1
    OR p_min_count > 1000000
  THEN
    RAISE EXCEPTION 'invalid webhook burst window'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT event.source, event.error_class, count(*)
  FROM public.integration_webhook_error_events AS event
  WHERE event.occurred_at >= now() - make_interval(mins => p_window_minutes)
  GROUP BY event.source, event.error_class
  HAVING count(*) >= p_min_count;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.prune_integration_webhook_error_events(
  p_retention_hours integer
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  deleted_count bigint;
BEGIN
  IF p_retention_hours IS NULL
    OR p_retention_hours < 1
    OR p_retention_hours > 87600
  THEN
    RAISE EXCEPTION 'invalid webhook error retention'
      USING ERRCODE = '23514';
  END IF;

  WITH deleted AS (
    DELETE FROM public.integration_webhook_error_events AS event
    WHERE event.occurred_at < now() - make_interval(hours => p_retention_hours)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END
$function$;
