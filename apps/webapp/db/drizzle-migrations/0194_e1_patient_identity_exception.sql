-- 0194_e1_patient_identity_exception: bounded current-patient maintenance exception.
-- The patient receives only a boolean derived from signed DB principal context. Restricted
-- identifiers remain internal to this SECURITY DEFINER function and are never projected.

ALTER TABLE public.saas_isolation_events
  DROP CONSTRAINT IF EXISTS saas_isolation_events_source_operation_check;
ALTER TABLE public.saas_isolation_events
  ADD CONSTRAINT saas_isolation_events_source_operation_check CHECK (
    (source_service, source_operation) IN (
      ('webapp', 'webapp_db_request'), ('webapp', 'webapp_admin_system_health'),
      ('webapp', 'public_auth_config'), ('webapp', 'patient_runtime_config'),
      ('webapp', 'public_booking_config'), ('webapp', 'patient_identity_exception_check'),
      ('webapp', 'patient_booking_history'),
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
    ('webapp','public_auth_config'), ('webapp','patient_runtime_config'),
    ('webapp','public_booking_config'), ('webapp','patient_identity_exception_check'),
    ('webapp','patient_booking_history'),
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

CREATE OR REPLACE FUNCTION app.is_current_patient_test_account()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_identifiers jsonb;
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  SELECT setting.value_json -> 'value'
  INTO v_identifiers
  FROM public.system_settings AS setting
  WHERE setting.key = 'test_account_identifiers'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;

  IF v_identifiers IS NULL OR jsonb_typeof(v_identifiers) <> 'object' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.platform_users AS platform_user
    WHERE platform_user.id = v_patient_user_id
      AND (
        (
          platform_user.phone_normalized IS NOT NULL
          AND jsonb_typeof(v_identifiers -> 'phones') = 'array'
          AND (v_identifiers -> 'phones') ? platform_user.phone_normalized
        )
        OR EXISTS (
          SELECT 1
          FROM public.user_channel_bindings AS binding
          WHERE binding.user_id = platform_user.id
            AND (
              (
                binding.channel_code = 'telegram'
                AND jsonb_typeof(v_identifiers -> 'telegramIds') = 'array'
                AND (v_identifiers -> 'telegramIds') ? binding.external_id
              )
              OR (
                binding.channel_code = 'max'
                AND jsonb_typeof(v_identifiers -> 'maxIds') = 'array'
                AND (v_identifiers -> 'maxIds') ? binding.external_id
              )
            )
        )
      )
  );
END
$function$;

REVOKE ALL ON FUNCTION app.is_current_patient_test_account() FROM PUBLIC;
