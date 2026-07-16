-- Least-privilege capability overlay for app.read_curated_system_health().
-- Run as PostgreSQL superuser after webapp migration 0190 and the SaaS telemetry overlay.
-- The protected diagnostics LOGIN inherits saas_telemetry_operator; ordinary app roles never do.

\set ON_ERROR_STOP on
\pset pager off

\if :{?system_health_operator_runtime_role}
\else
\echo 'FATAL: missing system_health_operator_runtime_role'
SELECT 1 / 0;
\endif

SELECT 1 / (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'system_health_operator_runtime_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_telemetry_operator')
  AND to_regprocedure('app.read_curated_system_health()') IS NOT NULL
  AND to_regprocedure('app.read_curated_playback_health()') IS NOT NULL
)::int AS curated_system_health_prerequisites_exist;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_system_health_owner') THEN
    CREATE ROLE saas_system_health_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE saas_system_health_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END
$roles$;

-- A SECURITY DEFINER owner must cross FORCE RLS to aggregate all organizations, but is deliberately
-- NOLOGIN, has no members and receives SELECT on only the closed health source inventory below.
SELECT format('REVOKE saas_system_health_owner FROM %I', member_role.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles member_role ON member_role.oid = membership.member
WHERE granted_role.rolname = 'saas_system_health_owner'
\gexec

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM saas_system_health_owner;
-- Remove any stale direct source-table capability left by an older deployment.
-- Only the sealed SECURITY DEFINER owner may read these telemetry tables.
REVOKE SELECT ON TABLE
  public.media_playback_resolution_events,
  public.media_playback_stats_hourly,
  public.media_playback_user_video_first_resolve
FROM PUBLIC, app_staff, app_patient, app_worker, saas_telemetry_operator;
REVOKE SELECT ON TABLE
  public.media_playback_resolution_events,
  public.media_playback_user_video_first_resolve
FROM app_owner;
-- The protected ON CONFLICT counter accessor reads the old aggregate values.
GRANT SELECT ON TABLE public.media_playback_stats_hourly TO app_owner;
SELECT format(
  'REVOKE SELECT ON TABLE public.media_playback_resolution_events, public.media_playback_stats_hourly, public.media_playback_user_video_first_resolve FROM %I',
  :'system_health_operator_runtime_role'
) \gexec

GRANT SELECT ON TABLE
  public.app_runtime_settings,
  public.system_settings,
  public.media_files,
  public.media_transcode_jobs,
  public.media_playback_resolution_events,
  public.media_playback_stats_hourly,
  public.media_playback_user_video_first_resolve,
  public.operator_job_status,
  public.operator_incidents,
  public.outgoing_delivery_queue,
  public.integrator_push_outbox,
  public.reminder_occurrence_history,
  public.reminder_delivery_events,
  public.idempotency_keys,
  public.user_web_push_subscriptions,
  public.notification_delivery_attempts,
  public.integration_webhook_last_status,
  public.operator_health_alert_sent
TO saas_system_health_owner;

ALTER FUNCTION app.read_curated_system_health() OWNER TO saas_system_health_owner;
ALTER FUNCTION app.read_curated_playback_health() OWNER TO saas_system_health_owner;
REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_playback_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_system_health()
  FROM app_owner, app_staff, app_patient, app_worker;
REVOKE ALL ON FUNCTION app.read_curated_playback_health()
  FROM app_owner, app_staff, app_patient, app_worker;
SELECT format(
  'REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM %I',
  :'system_health_operator_runtime_role'
) \gexec
SELECT format(
  'REVOKE ALL ON FUNCTION app.read_curated_playback_health() FROM %I',
  :'system_health_operator_runtime_role'
) \gexec

GRANT EXECUTE ON FUNCTION app.read_curated_system_health() TO saas_telemetry_operator;
GRANT EXECUTE ON FUNCTION app.read_curated_playback_health() TO saas_telemetry_operator;
GRANT USAGE ON SCHEMA app TO saas_telemetry_operator;

SELECT 1 / (
  (SELECT rolcanlogin = false AND rolsuper = false AND rolbypassrls = true
   FROM pg_roles WHERE rolname = 'saas_system_health_owner')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname = 'saas_system_health_owner'
  )
  AND pg_has_role(:'system_health_operator_runtime_role', 'saas_telemetry_operator', 'MEMBER')
  AND has_function_privilege(
    :'system_health_operator_runtime_role', 'app.read_curated_system_health()', 'EXECUTE'
  )
  AND has_function_privilege(
    :'system_health_operator_runtime_role', 'app.read_curated_playback_health()', 'EXECUTE'
  )
  AND NOT has_function_privilege('app_owner', 'app.read_curated_system_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_staff', 'app.read_curated_system_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_patient', 'app.read_curated_system_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_worker', 'app.read_curated_system_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_owner', 'app.read_curated_playback_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_staff', 'app.read_curated_playback_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_patient', 'app.read_curated_playback_health()', 'EXECUTE')
  AND NOT has_function_privilege('app_worker', 'app.read_curated_playback_health()', 'EXECUTE')
  AND NOT has_table_privilege(
    :'system_health_operator_runtime_role', 'public.operator_incidents', 'SELECT'
  )
  AND NOT has_table_privilege(
    :'system_health_operator_runtime_role', 'public.notification_delivery_attempts', 'SELECT'
  )
  AND has_table_privilege('saas_system_health_owner', 'public.operator_incidents', 'SELECT')
  AND has_table_privilege('saas_system_health_owner', 'public.notification_delivery_attempts', 'SELECT')
  AND has_table_privilege('saas_system_health_owner', 'public.media_playback_stats_hourly', 'SELECT')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS source_table
    JOIN pg_catalog.pg_namespace AS source_schema
      ON source_schema.oid = source_table.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        source_table.relacl,
        pg_catalog.acldefault('r', source_table.relowner)
      )
    ) AS source_acl
    WHERE source_schema.nspname = 'public'
      AND source_table.relname = ANY (ARRAY[
        'media_playback_resolution_events',
        'media_playback_stats_hourly',
        'media_playback_user_video_first_resolve'
      ])
      AND source_acl.privilege_type = 'SELECT'
      AND source_acl.grantee = ANY (ARRAY[
        0::oid,
        'app_staff'::regrole::oid,
        'app_patient'::regrole::oid,
        'app_worker'::regrole::oid,
        'saas_telemetry_operator'::regrole::oid,
        :'system_health_operator_runtime_role'::regrole::oid
      ])
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS source_table
    JOIN pg_catalog.pg_namespace AS source_schema
      ON source_schema.oid = source_table.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(source_table.relacl, pg_catalog.acldefault('r', source_table.relowner))
    ) AS source_acl
    WHERE source_schema.nspname = 'public'
      AND source_table.relname = ANY (ARRAY[
        'media_playback_resolution_events',
        'media_playback_user_video_first_resolve'
      ])
      AND source_acl.privilege_type = 'SELECT'
      AND source_acl.grantee = 'app_owner'::regrole::oid
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS source_table
    JOIN pg_catalog.pg_namespace AS source_schema
      ON source_schema.oid = source_table.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(source_table.relacl, pg_catalog.acldefault('r', source_table.relowner))
    ) AS source_acl
    WHERE source_schema.nspname = 'public'
      AND source_table.relname = 'media_playback_stats_hourly'
      AND source_acl.privilege_type = 'SELECT'
      AND source_acl.grantee = 'app_owner'::regrole::oid
  )
)::int AS curated_system_health_least_privilege_verified;
