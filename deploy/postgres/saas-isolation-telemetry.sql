-- E1 true-global SaaS isolation telemetry privilege overlay.
-- Run as PostgreSQL superuser after migration 0194 and before strict/FORCE assertions.
-- Runtime roles receive EXECUTE on a closed SECURITY DEFINER API, never table DML.
-- This shared overlay contains no TEST-only fixture objects; TEST deployment must not add
-- persistent scenario state to either live database.

\set ON_ERROR_STOP on
\pset pager off

\if :{?telemetry_webapp_runtime_role}
\else
\echo 'FATAL: missing telemetry_webapp_runtime_role'
SELECT 1 / 0;
\endif
\if :{?telemetry_api_runtime_role}
\else
\echo 'FATAL: missing telemetry_api_runtime_role'
SELECT 1 / 0;
\endif
\if :{?telemetry_operator_runtime_role}
\else
\echo 'FATAL: missing telemetry_operator_runtime_role'
SELECT 1 / 0;
\endif

SELECT 1 / (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'telemetry_webapp_runtime_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'telemetry_api_runtime_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'telemetry_operator_runtime_role')
  AND to_regclass('public.saas_isolation_events') IS NOT NULL
  AND to_regclass('public.saas_isolation_event_hourly') IS NOT NULL
  AND to_regclass('public.saas_isolation_coverage_runs') IS NOT NULL
)::int AS telemetry_prerequisites_exist;
SELECT 1 / (
  :'telemetry_operator_runtime_role' <> :'telemetry_webapp_runtime_role'
  AND :'telemetry_operator_runtime_role' <> :'telemetry_api_runtime_role'
  AND :'telemetry_operator_runtime_role' NOT IN ('app_owner','app_staff','app_patient','app_worker')
  AND (SELECT rolcanlogin AND rolinherit AND NOT rolsuper AND NOT rolbypassrls
       FROM pg_roles WHERE rolname = :'telemetry_operator_runtime_role')
  AND NOT pg_has_role(:'telemetry_operator_runtime_role', 'app_owner', 'MEMBER')
  AND NOT pg_has_role(:'telemetry_operator_runtime_role', 'app_staff', 'MEMBER')
  AND NOT pg_has_role(:'telemetry_operator_runtime_role', 'app_patient', 'MEMBER')
  AND NOT pg_has_role(:'telemetry_operator_runtime_role', 'app_worker', 'MEMBER')
)::int AS telemetry_operator_role_is_separate;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_telemetry_owner') THEN
    CREATE ROLE saas_telemetry_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE saas_telemetry_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_telemetry_operator') THEN
    CREATE ROLE saas_telemetry_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE saas_telemetry_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

REVOKE saas_telemetry_operator FROM app_owner, app_staff, app_patient, app_worker;
SELECT format('REVOKE saas_telemetry_operator FROM %I', :'telemetry_webapp_runtime_role') \gexec
SELECT format('REVOKE saas_telemetry_operator FROM %I', :'telemetry_api_runtime_role') \gexec
-- Remove every stale direct membership edge. This also removes nested/effective access through intermediary roles;
-- only the discovered operator is granted membership back below.
SELECT format('REVOKE saas_telemetry_operator FROM %I', member_role.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles member_role ON member_role.oid = membership.member
WHERE granted_role.rolname = 'saas_telemetry_operator'
  AND member_role.rolname <> :'telemetry_operator_runtime_role'
\gexec

ALTER TABLE public.saas_isolation_events OWNER TO saas_telemetry_owner;
ALTER TABLE public.saas_isolation_event_hourly OWNER TO saas_telemetry_owner;
ALTER TABLE public.saas_isolation_coverage_runs OWNER TO saas_telemetry_owner;
REVOKE ALL ON TABLE public.saas_isolation_events, public.saas_isolation_event_hourly, public.saas_isolation_coverage_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.saas_isolation_events, public.saas_isolation_event_hourly, public.saas_isolation_coverage_runs FROM app_owner, app_staff, app_patient, app_worker;
SELECT format(
  'REVOKE ALL ON TABLE public.saas_isolation_events, public.saas_isolation_event_hourly, public.saas_isolation_coverage_runs FROM %I',
  :'telemetry_webapp_runtime_role'
) \gexec
SELECT format(
  'REVOKE ALL ON TABLE public.saas_isolation_events, public.saas_isolation_event_hourly, public.saas_isolation_coverage_runs FROM %I',
  :'telemetry_operator_runtime_role'
) \gexec
SELECT format(
  'REVOKE ALL ON TABLE public.saas_isolation_events, public.saas_isolation_event_hourly, public.saas_isolation_coverage_runs FROM %I',
  :'telemetry_api_runtime_role'
) \gexec

-- This overlay is applied after E1 runtime migrations and therefore owns the final closed
-- service/operation vocabulary as well as the writer function.
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
    -- Explanation is conservative: a later unexplained occurrence can downgrade, never auto-upgrade.
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

CREATE OR REPLACE FUNCTION app.record_saas_isolation_coverage(
  p_id uuid,
  p_status text,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_services_checked text[],
  p_checks_count integer,
  p_unexpected_errors_count integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_inserted integer;
  v_distinct_services text[];
  v_required constant text[] := ARRAY['webapp','integrator','worker','scheduler','media_worker','cron'];
BEGIN
  SELECT coalesce(array_agg(service ORDER BY service), ARRAY[]::text[])
    INTO v_distinct_services FROM (SELECT DISTINCT unnest(p_services_checked) AS service) checked;
  IF p_status NOT IN ('complete','incomplete','failed')
    OR p_finished_at < p_started_at
    OR p_checks_count < 0 OR p_unexpected_errors_count < 0
    OR NOT (v_distinct_services <@ v_required)
    OR cardinality(v_distinct_services) <> cardinality(p_services_checked)
  THEN RAISE EXCEPTION 'invalid_saas_isolation_coverage' USING ERRCODE = '22023'; END IF;
  IF p_status = 'complete' AND (NOT (v_distinct_services @> v_required) OR p_checks_count < 6) THEN
    RAISE EXCEPTION 'invalid_saas_isolation_complete_coverage' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.saas_isolation_coverage_runs (
    id, status, started_at, finished_at, services_checked, checks_count, unexpected_errors_count
  ) VALUES (
    p_id, p_status, p_started_at, p_finished_at, v_distinct_services, p_checks_count, p_unexpected_errors_count
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 AND NOT EXISTS (
    SELECT 1 FROM public.saas_isolation_coverage_runs existing
    WHERE existing.id = p_id
      AND existing.status = p_status
      AND existing.started_at = p_started_at
      AND existing.finished_at = p_finished_at
      AND existing.services_checked = v_distinct_services
      AND existing.checks_count = p_checks_count
      AND existing.unexpected_errors_count = p_unexpected_errors_count
  ) THEN
    RAISE EXCEPTION 'saas_isolation_coverage_id_conflict' USING ERRCODE = '22023';
  END IF;
  IF v_inserted = 1 AND p_status = 'complete' THEN
    UPDATE public.saas_isolation_events
      SET lifecycle_status = 'resolved', resolved_at = now()
      WHERE lifecycle_status = 'active'
        AND last_seen_at < p_started_at
        AND source_service = ANY(v_distinct_services);
  END IF;
  DELETE FROM public.saas_isolation_coverage_runs WHERE finished_at < now() - interval '90 days';
END
$function$;

CREATE OR REPLACE FUNCTION app.read_saas_isolation_events()
RETURNS TABLE (
  event_class text, source_service text, source_operation text, explanation_status text,
  lifecycle_status text, occurrence_count integer, first_seen_at timestamptz, last_seen_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT event_class, source_service, source_operation, explanation_status,
         lifecycle_status, occurrence_count, first_seen_at, last_seen_at
  FROM public.saas_isolation_events
  ORDER BY event_class, last_seen_at DESC
$function$;

CREATE OR REPLACE FUNCTION app.read_last_saas_isolation_coverage()
RETURNS TABLE (
  id uuid, status text, started_at timestamptz, finished_at timestamptz,
  services_checked text[], checks_count integer, unexpected_errors_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT id, status, started_at, finished_at, services_checked, checks_count, unexpected_errors_count
  FROM public.saas_isolation_coverage_runs ORDER BY finished_at DESC LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.read_saas_isolation_trend()
RETURNS TABLE (
  as_of timestamptz,
  current_24_hours bigint,
  previous_24_hours bigint,
  daily_7_days jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  WITH anchor AS MATERIALIZED (
    SELECT statement_timestamp() AS as_of
  ), bounds AS (
    SELECT as_of,
           date_trunc('hour', as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS current_hour,
           date_trunc('day', as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today
    FROM anchor
  ), days AS (
    SELECT day_start
    FROM bounds, generate_series(today - interval '6 days', today, interval '1 day') AS series(day_start)
  ), day_counts AS (
    SELECT days.day_start, coalesce(sum(hourly.occurrence_count), 0)::bigint AS count
    FROM days CROSS JOIN bounds
    LEFT JOIN public.saas_isolation_event_hourly hourly
      ON hourly.bucket_start >= days.day_start
      AND hourly.bucket_start < days.day_start + interval '1 day'
      AND hourly.bucket_start <= bounds.current_hour
    GROUP BY days.day_start
  )
  SELECT
    (SELECT as_of FROM bounds),
    coalesce((SELECT sum(hourly.occurrence_count) FROM public.saas_isolation_event_hourly hourly, bounds
      WHERE hourly.bucket_start >= bounds.current_hour - interval '23 hours'
        AND hourly.bucket_start <= bounds.current_hour), 0)::bigint,
    coalesce((SELECT sum(hourly.occurrence_count) FROM public.saas_isolation_event_hourly hourly, bounds
      WHERE hourly.bucket_start >= bounds.current_hour - interval '47 hours'
        AND hourly.bucket_start < bounds.current_hour - interval '23 hours'), 0)::bigint,
    (SELECT jsonb_agg(jsonb_build_object(
      'date', to_char(day_start AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      'count', count
    ) ORDER BY day_start) FROM day_counts)
$function$;

ALTER FUNCTION app.report_saas_isolation_event(text,text,text,text) OWNER TO saas_telemetry_owner;
ALTER FUNCTION app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer) OWNER TO saas_telemetry_owner;
ALTER FUNCTION app.read_saas_isolation_events() OWNER TO saas_telemetry_owner;
ALTER FUNCTION app.read_last_saas_isolation_coverage() OWNER TO saas_telemetry_owner;
ALTER FUNCTION app.read_saas_isolation_trend() OWNER TO saas_telemetry_owner;
REVOKE ALL ON FUNCTION app.report_saas_isolation_event(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_saas_isolation_events(), app.read_last_saas_isolation_coverage(), app.read_saas_isolation_trend() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer), app.read_saas_isolation_events(), app.read_last_saas_isolation_coverage(), app.read_saas_isolation_trend() FROM app_owner, app_staff, app_patient, app_worker;
SELECT format('REVOKE ALL ON FUNCTION app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer), app.read_saas_isolation_events(), app.read_last_saas_isolation_coverage(), app.read_saas_isolation_trend() FROM %I', :'telemetry_webapp_runtime_role') \gexec
SELECT format('REVOKE ALL ON FUNCTION app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer), app.read_saas_isolation_events(), app.read_last_saas_isolation_coverage(), app.read_saas_isolation_trend() FROM %I', :'telemetry_api_runtime_role') \gexec
SELECT format('REVOKE ALL ON FUNCTION app.report_saas_isolation_event(text,text,text,text), app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer), app.read_saas_isolation_events(), app.read_last_saas_isolation_coverage(), app.read_saas_isolation_trend() FROM %I', :'telemetry_operator_runtime_role') \gexec

GRANT USAGE ON SCHEMA app TO app_staff, app_patient, app_worker;
GRANT EXECUTE ON FUNCTION app.report_saas_isolation_event(text,text,text,text) TO app_staff, app_patient, app_worker;
SELECT format('GRANT USAGE ON SCHEMA app TO %I', :'telemetry_webapp_runtime_role') \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.report_saas_isolation_event(text,text,text,text) TO %I', :'telemetry_webapp_runtime_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA app TO %I', :'telemetry_api_runtime_role') \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.report_saas_isolation_event(text,text,text,text) TO %I', :'telemetry_api_runtime_role') \gexec

-- Coverage/read require a separate infrastructure login. Ambient app roles cannot read or resolve.
GRANT USAGE ON SCHEMA app TO saas_telemetry_operator;
GRANT EXECUTE ON FUNCTION app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer), app.read_saas_isolation_events(), app.read_last_saas_isolation_coverage(), app.read_saas_isolation_trend() TO saas_telemetry_operator;
SELECT format('GRANT saas_telemetry_operator TO %I', :'telemetry_operator_runtime_role') \gexec

SELECT 1 / (
  NOT has_table_privilege(:'telemetry_webapp_runtime_role', 'public.saas_isolation_events', 'SELECT')
  AND NOT has_table_privilege(:'telemetry_webapp_runtime_role', 'public.saas_isolation_events', 'INSERT')
  AND NOT has_table_privilege(:'telemetry_operator_runtime_role', 'public.saas_isolation_events', 'SELECT')
  AND NOT has_table_privilege(:'telemetry_operator_runtime_role', 'public.saas_isolation_coverage_runs', 'INSERT')
  AND NOT has_table_privilege(:'telemetry_operator_runtime_role', 'public.saas_isolation_event_hourly', 'SELECT')
  AND has_function_privilege(:'telemetry_webapp_runtime_role', 'app.report_saas_isolation_event(text,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege(:'telemetry_webapp_runtime_role', 'app.read_saas_isolation_events()', 'EXECUTE')
  AND NOT has_function_privilege(:'telemetry_webapp_runtime_role', 'app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer)', 'EXECUTE')
  AND has_function_privilege('app_staff', 'app.report_saas_isolation_event(text,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('app_staff', 'app.read_saas_isolation_events()', 'EXECUTE')
  AND NOT has_function_privilege('app_staff', 'app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer)', 'EXECUTE')
  AND NOT has_function_privilege(:'telemetry_api_runtime_role', 'app.read_saas_isolation_events()', 'EXECUTE')
  AND NOT has_function_privilege(:'telemetry_operator_runtime_role', 'app.report_saas_isolation_event(text,text,text,text)', 'EXECUTE')
  AND has_function_privilege(:'telemetry_operator_runtime_role', 'app.read_saas_isolation_events()', 'EXECUTE')
  AND has_function_privilege(:'telemetry_operator_runtime_role', 'app.read_saas_isolation_trend()', 'EXECUTE')
  AND has_function_privilege(:'telemetry_operator_runtime_role', 'app.record_saas_isolation_coverage(uuid,text,timestamptz,timestamptz,text[],integer,integer)', 'EXECUTE')
  AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'saas_telemetry_owner')
  AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'saas_telemetry_operator')
)::int AS telemetry_least_privilege_verified;

SELECT 1 / (
  pg_has_role(:'telemetry_operator_runtime_role', 'saas_telemetry_operator', 'MEMBER')
  AND pg_has_role(:'telemetry_operator_runtime_role', 'saas_telemetry_operator', 'USAGE')
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles candidate
    WHERE candidate.rolname NOT IN ('saas_telemetry_operator', :'telemetry_operator_runtime_role')
      AND NOT candidate.rolsuper
      AND (
        pg_has_role(candidate.oid, 'saas_telemetry_operator', 'MEMBER')
        OR pg_has_role(candidate.oid, 'saas_telemetry_operator', 'USAGE')
      )
  )
)::int AS telemetry_operator_sole_effective_member_verified;
