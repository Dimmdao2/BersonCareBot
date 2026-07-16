#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const suffix = `${Date.now()}_${process.pid}`;
const db = `bcb_health_scratch_${suffix}`;
const runtimeRole = `${db}_operator`.slice(0, 63);
const roleNames = ["app_owner", "app_staff", "app_patient", "app_worker", "saas_telemetry_operator"];
const createdRoles = [];
let databaseCreated = false;
let ownerExisted = false;

function postgres(args, input, allowFailure = false) {
  const result = spawnSync("sudo", ["-n", "-u", "postgres", ...args], { encoding: "utf8", input });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `command_failed:${args.join(" ")}`);
  }
  return result.stdout.trim();
}
function sql(value) {
  return postgres(["psql", "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], value);
}
function roleExists(role) {
  return postgres(["psql", "-X", "-Atq", "-c", `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}')`]) === "t";
}

try {
  ownerExisted = roleExists("saas_system_health_owner");
  for (const role of roleNames) {
    if (!roleExists(role)) {
      postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`]);
      createdRoles.push(role);
    }
  }
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `CREATE ROLE ${runtimeRole} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS`]);
  createdRoles.push(runtimeRole);
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `GRANT saas_telemetry_operator TO ${runtimeRole}`]);
  postgres(["createdb", db]);
  databaseCreated = true;
  const serverVersionNum = Number(sql("SHOW server_version_num;"));
  if (serverVersionNum < 160000 || serverVersionNum >= 170000) {
    throw new Error(`postgres_16_required:${serverVersionNum}`);
  }

  sql(`
CREATE SCHEMA app;
CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.org', true), '')::uuid
$$;
CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.patient_user_id', true), '')::uuid
$$;
CREATE TABLE public.app_runtime_settings (key text NOT NULL, scope text NOT NULL, organization_id uuid, audience text NOT NULL, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);
CREATE UNIQUE INDEX app_runtime_settings_global_uq ON public.app_runtime_settings(key, scope) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX app_runtime_settings_org_uq ON public.app_runtime_settings(key, scope, organization_id) WHERE organization_id IS NOT NULL;
CREATE TABLE public.system_settings (key text NOT NULL, scope text NOT NULL, organization_id uuid, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);
CREATE TABLE public.media_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, mime_type text, status text, s3_key text, size_bytes bigint, video_processing_status text, hls_master_playlist_s3_key text, preview_status text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.media_transcode_jobs (media_id uuid, status text, created_at timestamptz NOT NULL DEFAULT now(), processing_started_at timestamptz, finished_at timestamptz);
CREATE TABLE public.media_playback_resolution_events (organization_id uuid, user_id uuid, media_id uuid, delivery text NOT NULL, fallback_used boolean NOT NULL DEFAULT false, resolved_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.media_playback_stats_hourly (bucket_hour timestamptz NOT NULL, delivery text NOT NULL, resolved_count integer NOT NULL DEFAULT 0, fallback_count integer NOT NULL DEFAULT 0, PRIMARY KEY (bucket_hour, delivery));
CREATE TABLE public.media_playback_user_video_first_resolve (user_id uuid, media_id uuid, first_resolved_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.media_playback_client_events (organization_id uuid, user_id uuid, media_id uuid, event_class text NOT NULL, delivery text, error_detail text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.media_hls_proxy_error_events (organization_id uuid, user_id uuid, media_id uuid, reason_code text NOT NULL, artifact_kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.operator_job_status (job_key text, job_family text, last_status text, last_finished_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz, last_duration_ms integer, meta_json jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.operator_incidents (occurrence_count integer NOT NULL DEFAULT 1, last_seen_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz);
CREATE TABLE public.outgoing_delivery_queue (status text, next_retry_at timestamptz, failure_class text, created_at timestamptz NOT NULL DEFAULT now(), channel text, kind text, sent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.integrator_push_outbox (status text, next_try_at timestamptz, kind text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.reminder_occurrence_history (status text, occurred_at timestamptz);
CREATE TABLE public.reminder_delivery_events (status text, created_at timestamptz);
CREATE TABLE public.idempotency_keys (key text, expires_at timestamptz);
CREATE TABLE public.user_web_push_subscriptions (user_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.notification_delivery_attempts (channel text, status text, created_at timestamptz NOT NULL DEFAULT now(), recipient_ref text, error_message text);
CREATE TABLE public.integration_webhook_last_status (source text, received_at timestamptz, processed_ok integer, http_status_returned integer, detail text);
CREATE TABLE public.operator_health_alert_sent (sent_at timestamptz, dedup_key text);
ALTER TABLE public.operator_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY deny_all_incidents ON public.operator_incidents USING (false);
`);

  sql(await readFile("apps/webapp/db/drizzle-migrations/0189_patient_runtime_cooldown_playback_accessors.sql", "utf8"));
  sql(await readFile("deploy/postgres/patient-media-playback-telemetry-accessors.sql", "utf8"));
  sql("GRANT USAGE ON SCHEMA app TO app_owner, app_patient;");
  sql(await readFile("apps/webapp/db/drizzle-migrations/0190_curated_system_health_diagnostics.sql", "utf8"));
  sql(await readFile("apps/webapp/db/drizzle-migrations/0192_curated_playback_and_patient_program_runtime.sql", "utf8"));
  sql(`
SELECT 1 / (
  NOT (app.read_curated_system_health() ? 'mediaPreview')
  AND NOT (app.read_curated_system_health() ? 'videoPlaybackClient')
  AND NOT (app.read_curated_playback_health() ? 'hlsProxy')
)::int AS pre_0196_existing_db_state_verified;
`);
  sql(await readFile("apps/webapp/db/drizzle-migrations/0196_curated_system_health_media_upgrade.sql", "utf8"));
  sql(`
SELECT 1 / (
  app.read_curated_system_health() ? 'mediaPreview'
  AND app.read_curated_system_health() ? 'videoPlaybackClient'
  AND app.read_curated_playback_health() ? 'hlsProxy'
)::int AS migration_0196_existing_db_upgrade_verified;
`);
  const overlay = `\\set system_health_operator_runtime_role ${runtimeRole}\n${await readFile("deploy/postgres/saas-system-health-diagnostics.sql", "utf8")}`;
  const stalePlaybackAcl = `
GRANT SELECT ON TABLE
  public.media_playback_resolution_events,
  public.media_playback_stats_hourly,
  public.media_playback_user_video_first_resolve,
  public.media_playback_client_events,
  public.media_hls_proxy_error_events
TO PUBLIC, app_owner, app_staff, app_patient, app_worker, saas_telemetry_operator, ${runtimeRole};
`;
  sql(stalePlaybackAcl);
  sql(overlay);
  // Prove idempotence against ACL drift reintroduced after the first application.
  sql(stalePlaybackAcl);
  sql(overlay);
  sql(`
SET ROLE ${runtimeRole};
SELECT 1 / (
  (app.read_curated_playback_health()#>>'{24,totalResolutions}') = '0'
  AND (app.read_curated_playback_health()#>>'{24,fallbackTotal}') = '0'
  AND (app.read_curated_playback_health()#>>'{1,totalResolutions}') = '0'
  AND (app.read_curated_playback_health()#>>'{hlsProxy,errorsTotal24h}') = '0'
)::int AS empty_playback_aggregate_zero_verified;
RESET ROLE;
`);
  sql(`
INSERT INTO public.media_files (id, organization_id, mime_type, status)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'video/mp4',
  'ready'
);
SELECT set_config('app.org', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('app.patient_user_id', '22222222-2222-4222-8222-222222222222', false);
SET ROLE app_patient;
SELECT app.increment_media_playback_resolution_stat(
  '22222222-2222-4222-8222-222222222222'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'hls',
  false
);
SELECT app.increment_media_playback_resolution_stat(
  '22222222-2222-4222-8222-222222222222'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'hls',
  true
);
RESET ROLE;
SELECT 1 / (
  (SELECT resolved_count FROM public.media_playback_stats_hourly WHERE delivery = 'hls') = 2
  AND (SELECT fallback_count FROM public.media_playback_stats_hourly WHERE delivery = 'hls') = 1
)::int AS playback_counter_on_conflict_verified;
DO $owner_identifier_denial$
BEGIN
  SET LOCAL ROLE app_owner;
  BEGIN
    PERFORM * FROM public.media_playback_resolution_events;
    RAISE EXCEPTION 'app_owner_playback_events_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.media_playback_user_video_first_resolve;
    RAISE EXCEPTION 'app_owner_playback_first_resolve_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.media_playback_client_events;
    RAISE EXCEPTION 'app_owner_playback_client_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.media_hls_proxy_error_events;
    RAISE EXCEPTION 'app_owner_hls_proxy_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM * FROM public.media_playback_stats_hourly;
  RESET ROLE;
END
$owner_identifier_denial$;
`);
  sql(`
INSERT INTO public.app_runtime_settings(key,scope,organization_id,audience,value_json) VALUES
 ('video_hls_pipeline_enabled','admin',NULL,'server','{"value":true}');
INSERT INTO public.system_settings(key,scope,organization_id,value_json) VALUES
 ('web_push_vapid','admin',NULL,'{"value":{"publicKey":"pub","privateKey":"DO_NOT_EXPOSE"}}'),
 ('smtp_outbound','admin',NULL,'{"value":{"host":"smtp","user":"u","password":"DO_NOT_EXPOSE","from":"f","port":587}}');
INSERT INTO public.operator_incidents(occurrence_count,last_seen_at) VALUES (2,now()),(3,now());
INSERT INTO public.notification_delivery_attempts(channel,status,recipient_ref,error_message) VALUES
 ('telegram','failed','PATIENT_SENTINEL','ERROR_SENTINEL'),('email','success','OTHER_SENTINEL',NULL);
INSERT INTO public.outgoing_delivery_queue(status,next_retry_at,channel,kind) VALUES ('pending',now()-interval '1 minute','telegram','reminder_dispatch');
INSERT INTO public.operator_job_status(job_key,job_family,last_status,last_finished_at,last_success_at,meta_json) VALUES
 ('health.outbound_probe.run','health','success',now(),now(),'{"rubitime":"ok","secret":"DO_NOT_EXPOSE"}');
INSERT INTO public.media_files(id,organization_id,mime_type,status,preview_status,created_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','image/heic','ready','failed',now()),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','video/quicktime','ready','pending',now()-interval '31 minutes');
INSERT INTO public.media_playback_client_events(organization_id,user_id,media_id,event_class,delivery,error_detail,created_at) VALUES
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hls_fatal','hls','CLIENT_ERROR_SENTINEL',now()),
 ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hls_fatal','hls','CLIENT_ERROR_SENTINEL',now()),
 ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hls_fatal','hls','CLIENT_ERROR_SENTINEL',now());
INSERT INTO public.media_hls_proxy_error_events(organization_id,user_id,media_id,reason_code,artifact_kind,created_at) VALUES
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','missing_object','segment',now()),
 ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','s3_read_failed','variant',now());
`);

  sql(`
DO $proof$ DECLARE snapshot jsonb; BEGIN
  SET LOCAL ROLE app_staff;
  BEGIN PERFORM app.read_curated_system_health(); RAISE EXCEPTION 'staff_execute_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE ${runtimeRole};
  BEGIN PERFORM * FROM public.operator_incidents; RAISE EXCEPTION 'operator_table_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.media_playback_resolution_events; RAISE EXCEPTION 'operator_playback_events_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.media_playback_stats_hourly; RAISE EXCEPTION 'operator_playback_hourly_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.media_playback_user_video_first_resolve; RAISE EXCEPTION 'operator_playback_first_resolve_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.media_playback_client_events; RAISE EXCEPTION 'operator_playback_client_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.media_hls_proxy_error_events; RAISE EXCEPTION 'operator_hls_proxy_select_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT app.read_curated_system_health() INTO snapshot;
  IF snapshot#>>'{operatorIncidents,openCount}' <> '2' THEN RAISE EXCEPTION 'incident_count_wrong'; END IF;
  IF snapshot#>>'{operatorIncidents,occurrenceCount}' <> '5' THEN RAISE EXCEPTION 'occurrence_count_wrong'; END IF;
  IF snapshot#>>'{config,vapidConfigured}' <> 'true' OR snapshot#>>'{config,smtpConfigured}' <> 'true' THEN RAISE EXCEPTION 'config_projection_wrong'; END IF;
  IF snapshot#>>'{mediaPreview,stalePendingCount}' <> '1' OR snapshot#>>'{mediaPreview,byMimeAndStatus,image/heic,failed}' <> '1' THEN RAISE EXCEPTION 'media_preview_projection_wrong'; END IF;
  IF snapshot#>>'{videoPlaybackClient,totalErrors}' <> '3' OR jsonb_array_length(snapshot->'videoPlaybackClient'->'recent') <> 0 THEN RAISE EXCEPTION 'playback_client_projection_wrong'; END IF;
  IF snapshot::text ~ '(PATIENT_SENTINEL|ERROR_SENTINEL|OTHER_SENTINEL|DO_NOT_EXPOSE|CLIENT_ERROR_SENTINEL)' THEN RAISE EXCEPTION 'raw_value_leaked'; END IF;
  IF jsonb_array_length(snapshot->'notificationDelivery'->'recentIssues') <> 0 THEN RAISE EXCEPTION 'notification_rows_leaked'; END IF;
  RESET ROLE;
END $proof$;
SET ROLE ${runtimeRole};
SELECT 1 / (
  (app.read_curated_playback_health()#>>'{hlsProxy,errorsTotal24h}') = '2'
  AND (app.read_curated_playback_health()#>>'{hlsProxy,errorsTotal1h}') = '2'
  AND jsonb_array_length(app.read_curated_playback_health()->'hlsProxy'->'recent') = 0
  AND app.read_curated_playback_health()::text !~ '(aaaaaaaa|bbbbbbbb|CLIENT_ERROR_SENTINEL)'
)::int;
RESET ROLE;
SELECT 1 / (NOT has_function_privilege('app_staff','app.read_curated_system_health()','EXECUTE'))::int;
SELECT 1 / has_function_privilege('${runtimeRole}','app.read_curated_system_health()','EXECUTE')::int;
SELECT 1 / (NOT has_table_privilege('${runtimeRole}','public.operator_incidents','SELECT'))::int;
SELECT 1 / (
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS source_table
    JOIN pg_catalog.pg_namespace AS source_schema ON source_schema.oid = source_table.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(source_table.relacl, pg_catalog.acldefault('r', source_table.relowner))
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
        'app_staff'::regrole::oid,
        'app_patient'::regrole::oid,
        'app_worker'::regrole::oid,
        'saas_telemetry_operator'::regrole::oid,
        '${runtimeRole}'::regrole::oid
      ])
  )
)::int;
SELECT 1 / (
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS source_table
    JOIN pg_catalog.pg_namespace AS source_schema ON source_schema.oid = source_table.relnamespace
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
)::int;
SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS source_table
    JOIN pg_catalog.pg_namespace AS source_schema ON source_schema.oid = source_table.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(source_table.relacl, pg_catalog.acldefault('r', source_table.relowner))
    ) AS source_acl
    WHERE source_schema.nspname = 'public'
      AND source_table.relname = 'media_playback_stats_hourly'
      AND source_acl.privilege_type = 'SELECT'
      AND source_acl.grantee = 'app_owner'::regrole::oid
  )
)::int;
`);
  process.stdout.write("Curated System Health PostgreSQL rehearsal: PASS\n");
} finally {
  if (databaseCreated) postgres(["dropdb", "--if-exists", db], undefined, true);
  for (const role of createdRoles.reverse()) {
    postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `DROP ROLE IF EXISTS ${role}`], undefined, true);
  }
  if (!ownerExisted) postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", "DROP ROLE IF EXISTS saas_system_health_owner"], undefined, true);
}
