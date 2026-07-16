-- 0202_current_patient_ui_capabilities: bounded current-patient reads/writes required by the patient shell.
-- No caller-supplied patient or organization identifier is accepted. Both capabilities derive identity from
-- the protected signed principal context and require an active enrollment in that exact organization.

ALTER TABLE public.saas_isolation_events
  DROP CONSTRAINT IF EXISTS saas_isolation_events_source_operation_check;
ALTER TABLE public.saas_isolation_events
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
    ('webapp','patient_product_analytics'), ('webapp','patient_ui_config'),
    ('webapp','patient_calendar_timezone'), ('webapp','patient_content_catalog'),
    ('webapp','patient_diary'),
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

CREATE OR REPLACE FUNCTION app.read_current_patient_ui_setting(
  p_key text,
  p_scope text
)
RETURNS TABLE (
  key text,
  scope text,
  organization_id uuid,
  value_json jsonb,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL OR p_scope <> 'admin' THEN
    RETURN;
  END IF;
  IF p_key NOT IN (
    'patient_home_mood_icons',
    'patient_home_daily_warmup_repeat_cooldown_minutes',
    'patient_home_daily_warmup_rotation_enabled',
    'patient_home_daily_warmup_rotation_times',
    'patient_home_daily_practice_target',
    'notifications_topics',
    'patient_default_promo_treatment_program_template_id'
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.value_json,
         setting.updated_at, setting.updated_by
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (setting.organization_id = v_organization_id OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_ui_setting(text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.set_current_patient_calendar_timezone(
  p_value text,
  p_only_if_empty boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_updated_count bigint := 0;
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL OR p_only_if_empty IS NULL THEN
    RETURN false;
  END IF;
  IF p_value IS NOT NULL AND (length(p_value) < 1 OR length(p_value) > 120) THEN
    RETURN false;
  END IF;
  IF p_value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names AS timezone WHERE timezone.name = p_value
  ) THEN
    RETURN false;
  END IF;
  IF p_only_if_empty AND p_value IS NULL THEN
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

  UPDATE public.platform_users AS platform_user
  SET calendar_timezone = p_value, updated_at = now()
  WHERE platform_user.id = v_patient_user_id
    AND platform_user.role = 'client'
    AND platform_user.merged_into_id IS NULL
    AND (NOT p_only_if_empty OR platform_user.calendar_timezone IS NULL);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END
$function$;

REVOKE ALL ON FUNCTION app.set_current_patient_calendar_timezone(text,boolean) FROM PUBLIC;
