-- BCB-MIGRATION-OWNER: app_object_owner
-- Ordinary DEV/TEST deploys must accept every cron operation already emitted by the typed job manifest.
-- BCB-MIGRATION-VERIFY: SELECT position('cron_maintenance' in pg_get_constraintdef(oid)) > 0 AND position('cron_saas_billing' in pg_get_constraintdef(oid)) > 0 FROM pg_constraint WHERE conname = 'saas_isolation_events_source_operation_check'
ALTER TABLE public.saas_isolation_events
  DROP CONSTRAINT saas_isolation_events_source_operation_check,
  ADD CONSTRAINT saas_isolation_events_source_operation_check CHECK (
    (source_service, source_operation) IN (
      ('webapp', 'webapp_db_request'), ('webapp', 'webapp_admin_system_health'),
      ('webapp', 'public_auth_config'), ('webapp', 'auth_role_config'),
      ('webapp', 'patient_runtime_config'), ('webapp', 'public_booking_config'),
      ('webapp', 'patient_identity_exception_check'), ('webapp', 'patient_booking_history'),
      ('webapp', 'patient_product_analytics'), ('webapp', 'patient_ui_config'),
      ('webapp', 'patient_calendar_timezone'), ('webapp', 'patient_content_catalog'),
      ('webapp', 'patient_diary'),
      ('integrator', 'integrator_http_request'), ('integrator', 'integrator_projection'),
      ('worker', 'worker_queue_drain'), ('worker', 'worker_projection_delivery'),
      ('worker', 'worker_outgoing_delivery'), ('scheduler', 'scheduler_lock'),
      ('scheduler', 'scheduler_dispatch_tick'), ('media_worker', 'media_transcode_tick'),
      ('cron', 'cron_health'), ('cron', 'cron_media'), ('cron', 'cron_analytics'),
      ('cron', 'cron_maintenance'), ('cron', 'cron_saas_billing'),
      ('cron', 'cron_reminders'), ('cron', 'cron_specialist_tasks')
    )
  );

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: saas_telemetry_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('cron_maintenance' in prosrc) > 0 AND position('cron_saas_billing' in prosrc) > 0 FROM pg_proc WHERE oid = 'app.report_saas_isolation_event(text,text,text,text)'::regprocedure
CREATE OR REPLACE FUNCTION app.report_saas_isolation_event(
  p_event_class text,
  p_source_service text,
  p_source_operation text,
  p_explanation_status text DEFAULT 'unexplained'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_fingerprint text;
  v_event_id uuid;
  v_bucket_start timestamptz := date_trunc('hour', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_event_class NOT IN (
    'missing_principal','invalid_signature_or_install','role_pool_mismatch',
    'rls_denial','cleanup_failure','unclassified_background_operation'
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_event_class' USING ERRCODE = '22023'; END IF;
  IF (p_source_service, p_source_operation) NOT IN (
    ('webapp','webapp_db_request'), ('webapp','webapp_admin_system_health'),
    ('webapp','public_auth_config'), ('webapp','auth_role_config'),
    ('webapp','patient_runtime_config'),
    ('webapp','public_booking_config'), ('webapp','patient_identity_exception_check'),
    ('webapp','patient_booking_history'), ('webapp','patient_product_analytics'),
    ('webapp','patient_ui_config'), ('webapp','patient_calendar_timezone'),
    ('webapp','patient_content_catalog'), ('webapp','patient_diary'),
    ('integrator','integrator_http_request'), ('integrator','integrator_projection'),
    ('worker','worker_queue_drain'), ('worker','worker_projection_delivery'),
    ('worker','worker_outgoing_delivery'), ('scheduler','scheduler_lock'),
    ('scheduler','scheduler_dispatch_tick'), ('media_worker','media_transcode_tick'),
    ('cron','cron_health'), ('cron','cron_media'), ('cron','cron_analytics'),
    ('cron','cron_maintenance'), ('cron','cron_saas_billing'),
    ('cron','cron_reminders'), ('cron','cron_specialist_tasks')
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_service_operation' USING ERRCODE = '22023'; END IF;
  IF p_explanation_status NOT IN ('explained','unexplained') THEN
    RAISE EXCEPTION 'invalid_saas_isolation_explanation' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := 'v2:' || p_event_class || ':' || p_source_service || ':' || p_source_operation;
  INSERT INTO public.saas_isolation_events (
    fingerprint, event_class, source_service, source_operation, explanation_status
  ) VALUES (
    v_fingerprint, p_event_class, p_source_service, p_source_operation, p_explanation_status
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    explanation_status = CASE
      WHEN public.saas_isolation_events.explanation_status = 'unexplained'
        OR EXCLUDED.explanation_status = 'unexplained' THEN 'unexplained'
      ELSE 'explained'
    END,
    lifecycle_status = 'active', resolved_at = NULL, last_seen_at = now(),
    occurrence_count = public.saas_isolation_events.occurrence_count + 1
  RETURNING id INTO v_event_id;
  INSERT INTO public.saas_isolation_event_hourly (event_id, bucket_start, occurrence_count)
    VALUES (v_event_id, v_bucket_start, 1)
    ON CONFLICT (event_id, bucket_start) DO UPDATE SET
      occurrence_count = public.saas_isolation_event_hourly.occurrence_count + 1;
  DELETE FROM public.saas_isolation_event_hourly
    WHERE bucket_start < v_bucket_start - interval '8 days';
END
$function$;
