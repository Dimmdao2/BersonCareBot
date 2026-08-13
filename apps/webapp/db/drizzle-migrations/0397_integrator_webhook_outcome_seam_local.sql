-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- One exact operational seam records both the current webhook status and the optional error event.
-- Runtime code never receives direct access to either public health table.
CREATE OR REPLACE FUNCTION app.record_integrator_webhook_outcome(
  p_source text,
  p_processed_ok boolean,
  p_http_status_returned integer,
  p_error_class text,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_source IS NULL
    OR p_source NOT IN ('telegram', 'max')
    OR p_processed_ok IS NULL
    OR p_http_status_returned IS NULL
    OR p_http_status_returned < 100
    OR p_http_status_returned > 599
    OR length(COALESCE(p_detail, '')) > 900
    OR (
      p_error_class IS NOT NULL
      AND p_error_class NOT IN (
        'webhook_auth_failed', 'webhook_parse_failed',
        'webhook_dispatch_failed', 'webhook_internal_error'
      )
    )
    OR (p_processed_ok AND p_error_class IS NOT NULL)
    OR (NOT p_processed_ok AND p_error_class IS NULL)
  THEN
    RAISE EXCEPTION 'invalid integrator webhook outcome'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.integration_webhook_last_status AS status (
    source, received_at, processed_ok, error_class, http_status_returned, detail
  ) VALUES (
    p_source, now(), CASE WHEN p_processed_ok THEN 1 ELSE 0 END,
    p_error_class, p_http_status_returned, NULLIF(p_detail, '')
  )
  ON CONFLICT (source) DO UPDATE SET
    received_at = EXCLUDED.received_at,
    processed_ok = EXCLUDED.processed_ok,
    error_class = EXCLUDED.error_class,
    http_status_returned = EXCLUDED.http_status_returned,
    detail = EXCLUDED.detail;

  IF NOT p_processed_ok THEN
    INSERT INTO public.integration_webhook_error_events (source, error_class)
    VALUES (p_source, p_error_class);
  END IF;
END
$function$;
--> statement-breakpoint
