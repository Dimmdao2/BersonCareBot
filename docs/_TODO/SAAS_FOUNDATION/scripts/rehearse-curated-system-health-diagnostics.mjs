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

  sql(`
CREATE SCHEMA app;
CREATE TABLE public.app_runtime_settings (key text NOT NULL, scope text NOT NULL, organization_id uuid, audience text NOT NULL, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);
CREATE UNIQUE INDEX app_runtime_settings_global_uq ON public.app_runtime_settings(key, scope) WHERE organization_id IS NULL;
CREATE TABLE public.system_settings (key text NOT NULL, scope text NOT NULL, organization_id uuid, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);
CREATE TABLE public.media_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mime_type text, status text, s3_key text, size_bytes bigint, video_processing_status text, hls_master_playlist_s3_key text);
CREATE TABLE public.media_transcode_jobs (media_id uuid, status text, created_at timestamptz NOT NULL DEFAULT now(), processing_started_at timestamptz, finished_at timestamptz);
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

  sql(await readFile("apps/webapp/db/drizzle-migrations/0190_curated_system_health_diagnostics.sql", "utf8"));
  sql(`\\set system_health_operator_runtime_role ${runtimeRole}\n${await readFile("deploy/postgres/saas-system-health-diagnostics.sql", "utf8")}`);
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
  SELECT app.read_curated_system_health() INTO snapshot;
  IF snapshot#>>'{operatorIncidents,openCount}' <> '2' THEN RAISE EXCEPTION 'incident_count_wrong'; END IF;
  IF snapshot#>>'{operatorIncidents,occurrenceCount}' <> '5' THEN RAISE EXCEPTION 'occurrence_count_wrong'; END IF;
  IF snapshot#>>'{config,vapidConfigured}' <> 'true' OR snapshot#>>'{config,smtpConfigured}' <> 'true' THEN RAISE EXCEPTION 'config_projection_wrong'; END IF;
  IF snapshot::text ~ '(PATIENT_SENTINEL|ERROR_SENTINEL|OTHER_SENTINEL|DO_NOT_EXPOSE)' THEN RAISE EXCEPTION 'raw_value_leaked'; END IF;
  IF jsonb_array_length(snapshot->'notificationDelivery'->'recentIssues') <> 0 THEN RAISE EXCEPTION 'notification_rows_leaked'; END IF;
  RESET ROLE;
END $proof$;
SELECT 1 / (NOT has_function_privilege('app_staff','app.read_curated_system_health()','EXECUTE'))::int;
SELECT 1 / has_function_privilege('${runtimeRole}','app.read_curated_system_health()','EXECUTE')::int;
SELECT 1 / (NOT has_table_privilege('${runtimeRole}','public.operator_incidents','SELECT'))::int;
`);
  process.stdout.write("Curated System Health PostgreSQL rehearsal: PASS\n");
} finally {
  if (databaseCreated) postgres(["dropdb", "--if-exists", db], undefined, true);
  for (const role of createdRoles.reverse()) {
    postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `DROP ROLE IF EXISTS ${role}`], undefined, true);
  }
  if (!ownerExisted) postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", "DROP ROLE IF EXISTS saas_system_health_owner"], undefined, true);
}
