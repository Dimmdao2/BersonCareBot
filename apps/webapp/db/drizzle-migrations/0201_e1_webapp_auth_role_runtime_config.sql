-- 0201_e1_webapp_auth_role_runtime_config: closed server-only role allowlist projection.
-- Session role reconciliation must not read restricted system_settings through a patient checkout.

ALTER TABLE public.saas_isolation_events
  DROP CONSTRAINT IF EXISTS saas_isolation_events_source_operation_check;
ALTER TABLE public.saas_isolation_events
  ADD CONSTRAINT saas_isolation_events_source_operation_check CHECK (
    (source_service, source_operation) IN (
      ('webapp', 'webapp_db_request'), ('webapp', 'webapp_admin_system_health'),
      ('webapp', 'public_auth_config'), ('webapp', 'auth_role_config'),
      ('webapp', 'patient_runtime_config'), ('webapp', 'public_booking_config'),
      ('webapp', 'patient_identity_exception_check'), ('webapp', 'patient_booking_history'),
      ('webapp', 'patient_product_analytics'),
      ('integrator', 'integrator_http_request'), ('integrator', 'integrator_projection'),
      ('worker', 'worker_queue_drain'), ('worker', 'worker_projection_delivery'),
      ('worker', 'worker_outgoing_delivery'), ('scheduler', 'scheduler_lock'),
      ('scheduler', 'scheduler_dispatch_tick'), ('media_worker', 'media_transcode_tick'),
      ('cron', 'cron_health'), ('cron', 'cron_media'), ('cron', 'cron_analytics'),
      ('cron', 'cron_reminders'), ('cron', 'cron_specialist_tasks')
    )
  );

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
    ('webapp','patient_runtime_config'), ('webapp','public_booking_config'),
    ('webapp','patient_identity_exception_check'), ('webapp','patient_booking_history'),
    ('webapp','patient_product_analytics'),
    ('integrator','integrator_http_request'), ('integrator','integrator_projection'),
    ('worker','worker_queue_drain'), ('worker','worker_projection_delivery'),
    ('worker','worker_outgoing_delivery'), ('scheduler','scheduler_lock'),
    ('scheduler','scheduler_dispatch_tick'), ('media_worker','media_transcode_tick'),
    ('cron','cron_health'), ('cron','cron_media'), ('cron','cron_analytics'),
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

WITH definitions(key, default_value) AS (VALUES
  ('admin_telegram_ids', '{"value":""}'::jsonb),
  ('admin_max_ids', '{"value":""}'::jsonb),
  ('admin_phones', '{"value":""}'::jsonb),
  ('doctor_telegram_ids', '{"value":""}'::jsonb),
  ('doctor_max_ids', '{"value":""}'::jsonb),
  ('doctor_phones', '{"value":""}'::jsonb)
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  definitions.key,
  'admin',
  NULL,
  'server',
  COALESCE(setting.value_json, definitions.default_value),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM definitions
LEFT JOIN public.system_settings AS setting
  ON setting.key = definitions.key
 AND setting.scope = 'admin'
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
RETURNS TABLE (
  key text,
  scope text,
  organization_id uuid,
  audience text,
  value_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND setting.organization_id IS NULL
    AND setting.audience = 'server'
    AND setting.key IN (
      'debug_forward_to_admin', 'video_presign_ttl_seconds',
      'admin_telegram_ids', 'admin_max_ids', 'admin_phones',
      'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones'
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;
