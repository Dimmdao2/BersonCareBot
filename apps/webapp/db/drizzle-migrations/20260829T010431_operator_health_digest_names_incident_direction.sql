-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('''direction''' in pg_get_functiondef(to_regprocedure('app.read_operator_health_digest_window(timestamp with time zone,timestamp with time zone)'))) > 0
-- Generic critical-cadence incidents deliberately share one internal integration name. The digest
-- previously printed that implementation name for every row, hiding which health signal failed.
-- Carry the already-stored direction through the bounded window so operator mail names the fault.
CREATE OR REPLACE FUNCTION app.read_operator_health_digest_window(
  p_window_start timestamp with time zone,
  p_window_end timestamp with time zone
) RETURNS jsonb
    LANGUAGE plpgsql
    STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  snapshot jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.digest.window.read',
    app.hash_port_typed_args(ARRAY[
      ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg
    ]),
    'app.read_operator_health_digest_window(timestamp with time zone,timestamp with time zone)'::regprocedure
  );

  IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'operator health digest window is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'auditErrorCount', (
      SELECT count(*)
      FROM public.admin_audit_log AS audit
      WHERE audit.created_at >= p_window_start
        AND audit.created_at < p_window_end
        AND audit.status = 'error'
    ),
    'hadResolveAll', EXISTS (
      SELECT 1
      FROM public.admin_audit_log AS audit
      WHERE audit.created_at >= p_window_start
        AND audit.created_at < p_window_end
        AND audit.action = 'operator_incidents_resolve_all'
    ),
    'incidentsOpened', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'direction', incident.direction,
          'integration', incident.integration,
          'errorClass', incident.error_class
        ) ORDER BY incident.opened_at
      )
      FROM public.operator_incidents AS incident
      WHERE incident.opened_at >= p_window_start
        AND incident.opened_at < p_window_end
    ), '[]'::jsonb),
    'incidentsResolved', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'direction', incident.direction,
          'integration', incident.integration,
          'errorClass', incident.error_class
        ) ORDER BY incident.resolved_at
      )
      FROM public.operator_incidents AS incident
      WHERE incident.resolved_at >= p_window_start
        AND incident.resolved_at < p_window_end
    ), '[]'::jsonb),
    'jobFailures', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'jobFamily', job.job_family,
          'jobKey', job.job_key,
          'lastFailureAt', job.last_failure_at
        ) ORDER BY job.last_failure_at
      )
      FROM public.operator_job_status AS job
      WHERE job.last_failure_at >= p_window_start
        AND job.last_failure_at < p_window_end
    ), '[]'::jsonb)
  ) INTO snapshot;

  RETURN snapshot;
END
$function$
;
