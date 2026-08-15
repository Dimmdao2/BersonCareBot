-- TEST-only SaaS isolation telemetry scenario fixture API, split out of saas-isolation-telemetry.sql
-- so the production overlay (zero references in deploy-prod.sh) can never carry these objects;
-- applied only by deploy-test-saas.sh, immediately after the production overlay these functions
-- depend on (existing saas_telemetry_owner/saas_telemetry_operator roles, isolation tables).
-- Run as PostgreSQL superuser. Functions still self-guard on current_database() = 'bersoncarebot_test'.

\set ON_ERROR_STOP on
\pset pager off

-- The initial port-context cutover needs these TEST-only routines to exist before
-- the generated declaration can assign their final owner/ACL. In that one offline
-- window the caller sets telemetry_fixture_objects_only; runtime login shells do not
-- exist yet, so only the objects and their deny-PUBLIC baseline are installed.
\if :{?telemetry_fixture_objects_only}
\else
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
\endif

-- Operator-only TEST fixture state. It is physically incapable of mutating any
-- non-TEST database and touches only reserved diagnostics fixture fingerprints/UUIDs.
CREATE OR REPLACE FUNCTION app.set_saas_isolation_test_scenario(p_scenario text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_event_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF current_database() <> 'bersoncarebot_test' THEN
    RAISE EXCEPTION 'saas_isolation_scenario_test_database_required' USING ERRCODE = '42501';
  END IF;
  IF p_scenario NOT IN ('clean','okay','incomplete','critical') THEN
    RAISE EXCEPTION 'invalid_saas_isolation_test_scenario' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.saas_isolation_events WHERE fingerprint LIKE 'test-fixture:v3:%';
  DELETE FROM public.saas_isolation_coverage_runs
    WHERE id IN (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'::uuid,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'::uuid,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'::uuid
    );
  IF p_scenario = 'clean' THEN RETURN; END IF;
  IF p_scenario = 'critical' THEN
    INSERT INTO public.saas_isolation_events (
      fingerprint, event_class, source_service, source_operation, explanation_status,
      lifecycle_status, occurrence_count, first_seen_at, last_seen_at
    ) VALUES (
      'test-fixture:v3:critical', 'rls_denial', 'webapp', 'webapp_db_request', 'unexplained',
      'active', 1, v_now, v_now
    ) RETURNING id INTO v_event_id;
    INSERT INTO public.saas_isolation_event_hourly (event_id, bucket_start, occurrence_count)
      VALUES (v_event_id, date_trunc('hour', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 1);
  END IF;
  INSERT INTO public.saas_isolation_coverage_runs (
    id, status, started_at, finished_at, services_checked, checks_count, unexpected_errors_count
  ) VALUES (
    CASE p_scenario
      WHEN 'okay' THEN 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'::uuid
      WHEN 'incomplete' THEN 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'::uuid
      ELSE 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'::uuid
    END,
    CASE WHEN p_scenario = 'incomplete' THEN 'incomplete' ELSE 'complete' END,
    v_now - interval '1 minute', v_now,
    CASE WHEN p_scenario = 'incomplete' THEN ARRAY['webapp']::text[]
      ELSE ARRAY['webapp','integrator','worker','scheduler','media_worker','cron']::text[] END,
    CASE WHEN p_scenario = 'incomplete' THEN 1 ELSE 6 END,
    0
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.read_saas_isolation_test_scenario_fixture_counts()
RETURNS TABLE (event_rows bigint, hourly_rows bigint, coverage_rows bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  IF current_database() <> 'bersoncarebot_test' THEN
    RAISE EXCEPTION 'saas_isolation_scenario_test_database_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      (SELECT count(*) FROM public.saas_isolation_events
        WHERE fingerprint LIKE 'test-fixture:v3:%'),
      (SELECT count(*) FROM public.saas_isolation_event_hourly hourly
        JOIN public.saas_isolation_events event ON event.id = hourly.event_id
        WHERE event.fingerprint LIKE 'test-fixture:v3:%'),
      (SELECT count(*) FROM public.saas_isolation_coverage_runs
        WHERE id IN (
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'::uuid,
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'::uuid,
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'::uuid
        ));
END
$function$;

ALTER FUNCTION app.set_saas_isolation_test_scenario(text) OWNER TO saas_telemetry_owner;
ALTER FUNCTION app.read_saas_isolation_test_scenario_fixture_counts() OWNER TO saas_telemetry_owner;
REVOKE ALL ON FUNCTION app.set_saas_isolation_test_scenario(text), app.read_saas_isolation_test_scenario_fixture_counts() FROM PUBLIC;
\if :{?telemetry_fixture_objects_only}
\else
  REVOKE ALL ON FUNCTION app.set_saas_isolation_test_scenario(text), app.read_saas_isolation_test_scenario_fixture_counts() FROM app_owner, app_staff, app_patient, app_worker;
  SELECT format('REVOKE ALL ON FUNCTION app.set_saas_isolation_test_scenario(text), app.read_saas_isolation_test_scenario_fixture_counts() FROM %I', :'telemetry_webapp_runtime_role') \gexec
  SELECT format('REVOKE ALL ON FUNCTION app.set_saas_isolation_test_scenario(text), app.read_saas_isolation_test_scenario_fixture_counts() FROM %I', :'telemetry_api_runtime_role') \gexec
  SELECT format('REVOKE ALL ON FUNCTION app.set_saas_isolation_test_scenario(text), app.read_saas_isolation_test_scenario_fixture_counts() FROM %I', :'telemetry_operator_runtime_role') \gexec

  -- Coverage/read require a separate infrastructure login; saas_telemetry_operator and its
  -- schema USAGE grant already exist from the production overlay applied immediately before this file.
  GRANT EXECUTE ON FUNCTION app.set_saas_isolation_test_scenario(text), app.read_saas_isolation_test_scenario_fixture_counts() TO saas_telemetry_operator;

  SELECT 1 / (
    NOT has_function_privilege(:'telemetry_webapp_runtime_role', 'app.read_saas_isolation_test_scenario_fixture_counts()', 'EXECUTE')
    AND NOT has_function_privilege('app_staff', 'app.read_saas_isolation_test_scenario_fixture_counts()', 'EXECUTE')
    AND has_function_privilege(:'telemetry_operator_runtime_role', 'app.set_saas_isolation_test_scenario(text)', 'EXECUTE')
    AND has_function_privilege(:'telemetry_operator_runtime_role', 'app.read_saas_isolation_test_scenario_fixture_counts()', 'EXECUTE')
  )::int AS test_fixture_telemetry_least_privilege_verified;
\endif
