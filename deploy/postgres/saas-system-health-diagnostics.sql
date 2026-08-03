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
  AND to_regprocedure('app.read_curated_system_health_pre_0196()') IS NOT NULL
  AND to_regprocedure('app.read_curated_playback_health_pre_0196()') IS NOT NULL
)::int AS curated_system_health_prerequisites_exist;

-- Refresh the protected aggregate only in this privileged overlay. Ordinary Drizzle
-- migrations deliberately cannot replace the sealed NOLOGIN-owned function.
CREATE OR REPLACE FUNCTION app.read_curated_system_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
WITH media_preview AS MATERIALIZED (
  SELECT jsonb_build_object(
    'stalePendingCount', count(*) FILTER (
      WHERE mime_type IN ('video/quicktime', 'image/heic', 'image/heif')
        AND preview_status = 'pending'
        AND created_at < now() - interval '30 minutes'
    ),
    'byMimeAndStatus', jsonb_build_object(
      'video/quicktime', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'skipped')
      ),
      'image/heic', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'skipped')
      ),
      'image/heif', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'skipped')
      )
    )
  ) AS value
  FROM public.media_files
),
playback_client AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'totalErrors', count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
    'totalErrorsLast1h', count(*) FILTER (WHERE created_at >= now() - interval '1 hour'),
    'byEvent', jsonb_build_object(
      'hls_fatal', count(*) FILTER (WHERE event_class = 'hls_fatal' AND created_at >= now() - interval '24 hours'),
      'video_error', count(*) FILTER (WHERE event_class = 'video_error' AND created_at >= now() - interval '24 hours'),
      'hls_import_failed', count(*) FILTER (WHERE event_class = 'hls_import_failed' AND created_at >= now() - interval '24 hours'),
      'playback_refetch_failed', count(*) FILTER (WHERE event_class = 'playback_refetch_failed' AND created_at >= now() - interval '24 hours'),
      'playback_refetch_exception', count(*) FILTER (WHERE event_class = 'playback_refetch_exception' AND created_at >= now() - interval '24 hours'),
      'hls_js_unsupported', count(*) FILTER (WHERE event_class = 'hls_js_unsupported' AND created_at >= now() - interval '24 hours')
    ),
    'byEventLast1h', jsonb_build_object(
      'hls_fatal', count(*) FILTER (WHERE event_class = 'hls_fatal' AND created_at >= now() - interval '1 hour'),
      'video_error', count(*) FILTER (WHERE event_class = 'video_error' AND created_at >= now() - interval '1 hour'),
      'hls_import_failed', count(*) FILTER (WHERE event_class = 'hls_import_failed' AND created_at >= now() - interval '1 hour'),
      'playback_refetch_failed', count(*) FILTER (WHERE event_class = 'playback_refetch_failed' AND created_at >= now() - interval '1 hour'),
      'playback_refetch_exception', count(*) FILTER (WHERE event_class = 'playback_refetch_exception' AND created_at >= now() - interval '1 hour'),
      'hls_js_unsupported', count(*) FILTER (WHERE event_class = 'hls_js_unsupported' AND created_at >= now() - interval '1 hour')
    ),
    'byDelivery', jsonb_build_object(
      'hls', count(*) FILTER (WHERE delivery = 'hls' AND created_at >= now() - interval '24 hours'),
      'mp4', count(*) FILTER (WHERE delivery = 'mp4' AND created_at >= now() - interval '24 hours'),
      'file', count(*) FILTER (WHERE delivery = 'file' AND created_at >= now() - interval '24 hours')
    ),
    'likelyLooping', EXISTS (
      SELECT 1
      FROM public.media_playback_client_events looping
      WHERE looping.event_class = 'hls_fatal'
        AND looping.created_at >= date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      GROUP BY looping.media_id
      HAVING count(*) >= 3
    ),
    'recent', '[]'::jsonb
  ) AS value
  FROM public.media_playback_client_events
),
base AS MATERIALIZED (
  SELECT app.read_curated_system_health_pre_0196()
    || jsonb_build_object(
      'mediaPreview', media_preview.value,
      'videoPlaybackClient', playback_client.value
    ) AS value
  FROM media_preview, playback_client
),
channel_diagnostics AS MATERIALIZED (
  SELECT jsonb_object_agg(
    channels.channel,
    (base.value #> ARRAY['notificationDelivery', 'byChannel', channels.channel])
      || jsonb_build_object(
        'lastProviderStatusCode', CASE
          WHEN diagnostic.provider_status_code BETWEEN 100 AND 599
            THEN diagnostic.provider_status_code
          ELSE NULL
        END,
        'lastErrorReason', CASE
          WHEN diagnostic.reason = 'provider_error' THEN diagnostic.reason
          ELSE NULL
        END,
        'lastErrorMessage', CASE
          WHEN diagnostic.error_message IN (
            'BadJwtToken', 'BadCertificate', 'BadCertificateEnvironment',
            'ExpiredProviderToken', 'InvalidProviderToken', 'MissingProviderToken',
            'TopicDisallowed', 'DeviceTokenNotForTopic', 'Unregistered'
          ) THEN diagnostic.error_message
          ELSE NULL
        END
      )
  ) AS value
  FROM base
  CROSS JOIN (VALUES ('telegram'), ('max'), ('web_push'), ('email')) AS channels(channel)
  LEFT JOIN LATERAL (
    SELECT attempt.provider_status_code, attempt.reason, attempt.error_message
    FROM public.notification_delivery_attempts AS attempt
    WHERE attempt.channel = channels.channel
      AND attempt.status IN ('failed', 'skipped')
      AND attempt.created_at >= now() - interval '24 hours'
    ORDER BY attempt.created_at DESC
    LIMIT 1
  ) AS diagnostic ON true
  GROUP BY base.value
),
digest_delivery AS MATERIALIZED (
  SELECT max(sent_at) AS last_sent_at
  FROM public.outgoing_delivery_queue
  WHERE kind = 'operator_health_digest'
    AND status = 'sent'
)
SELECT jsonb_set(
  jsonb_set(
    base.value,
    ARRAY['notificationDelivery', 'byChannel'],
    channel_diagnostics.value,
    false
  ),
  ARRAY['operatorHealthDigestLastSentAt'],
  COALESCE(to_jsonb(digest_delivery.last_sent_at), 'null'::jsonb),
  true
)
FROM base, channel_diagnostics, digest_delivery
$function$;

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
-- app_staff already owns the matching INSERT/UPDATE/DELETE surface for the first
-- three tables; its SELECT is intentionally restored below for doctor analytics.
REVOKE SELECT ON TABLE
  public.media_playback_resolution_events,
  public.media_playback_stats_hourly,
  public.media_playback_user_video_first_resolve,
  public.media_playback_client_events,
  public.media_hls_proxy_error_events
FROM PUBLIC, app_patient, app_worker, saas_telemetry_operator;
REVOKE SELECT ON TABLE
  public.media_playback_client_events,
  public.media_hls_proxy_error_events
FROM app_staff;
GRANT SELECT ON TABLE
  public.media_playback_resolution_events,
  public.media_playback_stats_hourly,
  public.media_playback_user_video_first_resolve
TO app_staff;
REVOKE SELECT ON TABLE
  public.media_playback_resolution_events,
  public.media_playback_user_video_first_resolve,
  public.media_playback_client_events,
  public.media_hls_proxy_error_events
FROM app_owner;
-- The protected ON CONFLICT counter accessor reads the old aggregate values.
GRANT SELECT ON TABLE public.media_playback_stats_hourly TO app_owner;
SELECT format(
  'REVOKE SELECT ON TABLE public.media_playback_resolution_events, public.media_playback_stats_hourly, public.media_playback_user_video_first_resolve, public.media_playback_client_events, public.media_hls_proxy_error_events FROM %I',
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
  public.media_playback_client_events,
  public.media_hls_proxy_error_events,
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
GRANT USAGE ON SCHEMA app TO saas_system_health_owner;

ALTER FUNCTION app.read_curated_system_health() OWNER TO saas_system_health_owner;
ALTER FUNCTION app.read_curated_playback_health() OWNER TO saas_system_health_owner;
ALTER FUNCTION app.read_curated_system_health_pre_0196() OWNER TO saas_system_health_owner;
ALTER FUNCTION app.read_curated_playback_health_pre_0196() OWNER TO saas_system_health_owner;
REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_playback_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_curated_system_health()
  FROM app_owner, app_staff, app_patient, app_worker;
REVOKE ALL ON FUNCTION app.read_curated_playback_health()
  FROM app_owner, app_staff, app_patient, app_worker;
REVOKE ALL ON FUNCTION app.read_curated_system_health_pre_0196()
  FROM PUBLIC, app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator;
REVOKE ALL ON FUNCTION app.read_curated_playback_health_pre_0196()
  FROM PUBLIC, app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator;
SELECT format(
  'REVOKE ALL ON FUNCTION app.read_curated_system_health() FROM %I',
  :'system_health_operator_runtime_role'
) \gexec
SELECT format(
  'REVOKE ALL ON FUNCTION app.read_curated_playback_health() FROM %I',
  :'system_health_operator_runtime_role'
) \gexec
SELECT format(
  'REVOKE ALL ON FUNCTION app.read_curated_system_health_pre_0196() FROM %I',
  :'system_health_operator_runtime_role'
) \gexec
SELECT format(
  'REVOKE ALL ON FUNCTION app.read_curated_playback_health_pre_0196() FROM %I',
  :'system_health_operator_runtime_role'
) \gexec

GRANT EXECUTE ON FUNCTION app.read_curated_system_health() TO saas_telemetry_operator;
GRANT EXECUTE ON FUNCTION app.read_curated_playback_health() TO saas_telemetry_operator;
GRANT EXECUTE ON FUNCTION app.read_outbound_provider_incident_health() TO saas_telemetry_operator;
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
  AND NOT has_function_privilege(
    :'system_health_operator_runtime_role', 'app.read_curated_system_health_pre_0196()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'system_health_operator_runtime_role', 'app.read_curated_playback_health_pre_0196()', 'EXECUTE'
  )
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
        'media_playback_user_video_first_resolve',
        'media_playback_client_events',
        'media_hls_proxy_error_events'
      ])
      AND source_acl.privilege_type = 'SELECT'
      AND source_acl.grantee = ANY (ARRAY[
        0::oid,
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
        'media_playback_client_events',
        'media_hls_proxy_error_events'
      ])
      AND source_acl.privilege_type = 'SELECT'
      AND source_acl.grantee = 'app_staff'::regrole::oid
  )
  AND NOT EXISTS (
    SELECT source_table.relname
    FROM unnest(ARRAY[
      'media_playback_resolution_events',
      'media_playback_stats_hourly',
      'media_playback_user_video_first_resolve'
    ]) AS expected_table(relname)
    LEFT JOIN pg_catalog.pg_class AS source_table
      JOIN pg_catalog.pg_namespace AS source_schema
        ON source_schema.oid = source_table.relnamespace
      ON source_schema.nspname = 'public'
        AND source_table.relname = expected_table.relname
    LEFT JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(source_table.relacl, pg_catalog.acldefault('r', source_table.relowner))
    ) AS source_acl
      ON source_acl.privilege_type = 'SELECT'
        AND source_acl.grantee = 'app_staff'::regrole::oid
    WHERE source_acl.grantee IS NULL
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
        'media_playback_user_video_first_resolve',
        'media_playback_client_events',
        'media_hls_proxy_error_events'
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
