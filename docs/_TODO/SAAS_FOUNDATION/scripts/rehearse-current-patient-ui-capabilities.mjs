#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const suffix = `${process.pid}_${Date.now()}`;
const database = `bcb_saas_patient_ui_scratch_${suffix}`;
if (!/^bcb_saas_patient_ui_scratch_[0-9_]+$/.test(database)) throw new Error("unsafe scratch database name");

function postgres(args, input = undefined) {
  const result = spawnSync("sudo", ["-n", "-u", "postgres", ...args], { encoding: "utf8", input });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`postgres command failed: ${result.status}`);
  }
  return result;
}

try {
  postgres(["createdb", database]);
  const setup = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA app;
CREATE TABLE app.principal_context(backend_pid integer PRIMARY KEY, org_id uuid, patient_user_id uuid, expires_epoch bigint NOT NULL);
CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT org_id FROM app.principal_context WHERE backend_pid=pg_backend_pid() AND expires_epoch>extract(epoch from clock_timestamp())::bigint $$;
CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT patient_user_id FROM app.principal_context WHERE backend_pid=pg_backend_pid() AND expires_epoch>extract(epoch from clock_timestamp())::bigint $$;
CREATE TABLE public.saas_isolation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fingerprint text UNIQUE NOT NULL, event_class text NOT NULL,
 source_service text NOT NULL, source_operation text NOT NULL, explanation_status text NOT NULL DEFAULT 'unexplained',
 lifecycle_status text NOT NULL DEFAULT 'active', occurrence_count integer NOT NULL DEFAULT 1,
 first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE public.saas_isolation_event_hourly(event_id uuid REFERENCES public.saas_isolation_events(id) ON DELETE CASCADE, bucket_start timestamptz, occurrence_count integer NOT NULL DEFAULT 1, PRIMARY KEY(event_id,bucket_start));
CREATE TABLE public.platform_users(id uuid PRIMARY KEY, role text NOT NULL, merged_into_id uuid, calendar_timezone text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.org_enrollments(organization_id uuid NOT NULL, platform_user_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.system_settings(key text NOT NULL, scope text NOT NULL, organization_id uuid, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);
CREATE UNIQUE INDEX system_settings_global_uq ON public.system_settings(key,scope) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX system_settings_org_uq ON public.system_settings(key,scope,organization_id) WHERE organization_id IS NOT NULL;
INSERT INTO public.platform_users(id,role) VALUES
 ('02020000-0000-4000-8000-00000000000a','client'), ('02020000-0000-4000-8000-00000000000b','client');
INSERT INTO public.org_enrollments VALUES
 ('02020000-0000-4000-8000-00000000001a','02020000-0000-4000-8000-00000000000a','active'),
 ('02020000-0000-4000-8000-00000000001b','02020000-0000-4000-8000-00000000000b','active');
INSERT INTO public.system_settings(key,scope,organization_id,value_json) VALUES
 ('patient_home_mood_icons','admin',NULL,'{"value":"global"}'),
 ('patient_home_mood_icons','admin','02020000-0000-4000-8000-00000000001a','{"value":"clinic-a"}'),
 ('patient_home_mood_icons','admin','02020000-0000-4000-8000-00000000001b','{"value":"clinic-b"}'),
 ('smtp_outbound','admin',NULL,'{"value":{"password":"must-not-leak"}}');
`;
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], setup);
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], readFileSync("apps/webapp/db/drizzle-migrations/0202_current_patient_ui_capabilities.sql", "utf8"));

  const proof = String.raw`
GRANT SELECT ON public.system_settings, public.org_enrollments, public.platform_users TO app_owner;
GRANT UPDATE ON public.platform_users TO app_owner;
ALTER FUNCTION app.read_current_patient_ui_setting(text,text) OWNER TO app_owner;
ALTER FUNCTION app.set_current_patient_calendar_timezone(text,boolean) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_current_patient_ui_setting(text,text), app.set_current_patient_calendar_timezone(text,boolean) FROM PUBLIC, app_patient;
GRANT USAGE ON SCHEMA app TO app_owner, app_patient;
GRANT EXECUTE ON FUNCTION app.read_current_patient_ui_setting(text,text), app.set_current_patient_calendar_timezone(text,boolean) TO app_patient;
SELECT 1 / (NOT has_table_privilege('app_patient','public.system_settings','SELECT'))::int;
SELECT 1 / (NOT has_table_privilege('app_patient','public.platform_users','UPDATE'))::int;

INSERT INTO app.principal_context VALUES(pg_backend_pid(),'02020000-0000-4000-8000-00000000001a','02020000-0000-4000-8000-00000000000a',extract(epoch from now()+interval '5 minutes')::bigint);
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT value_json->>'value' FROM app.read_current_patient_ui_setting('patient_home_mood_icons','admin'))='clinic-a')::int;
SELECT 1 / ((SELECT count(*) FROM app.read_current_patient_ui_setting('smtp_outbound','admin'))=0)::int;
SELECT 1 / app.set_current_patient_calendar_timezone('Europe/Moscow',true)::int;
SELECT 1 / (NOT app.set_current_patient_calendar_timezone('Europe/Berlin',true))::int;
SELECT 1 / (NOT app.set_current_patient_calendar_timezone('Not/A/Timezone',false))::int;
RESET SESSION AUTHORIZATION;

UPDATE app.principal_context SET org_id='02020000-0000-4000-8000-00000000001b', patient_user_id='02020000-0000-4000-8000-00000000000b' WHERE backend_pid=pg_backend_pid();
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT value_json->>'value' FROM app.read_current_patient_ui_setting('patient_home_mood_icons','admin'))='clinic-b')::int;
SELECT 1 / app.set_current_patient_calendar_timezone('Europe/Berlin',false)::int;
RESET SESSION AUTHORIZATION;

UPDATE app.principal_context SET org_id='02020000-0000-4000-8000-00000000001a', patient_user_id='02020000-0000-4000-8000-00000000000b' WHERE backend_pid=pg_backend_pid();
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT count(*) FROM app.read_current_patient_ui_setting('patient_home_mood_icons','admin'))=0)::int;
SELECT 1 / (NOT app.set_current_patient_calendar_timezone('UTC',false))::int;
RESET SESSION AUTHORIZATION;
SELECT 1 / ((SELECT calendar_timezone FROM public.platform_users WHERE id='02020000-0000-4000-8000-00000000000a')='Europe/Moscow')::int;
SELECT 1 / ((SELECT calendar_timezone FROM public.platform_users WHERE id='02020000-0000-4000-8000-00000000000b')='Europe/Berlin')::int;
`;
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], proof);
  console.log("Current-patient UI capabilities disposable PostgreSQL rehearsal: PASS");
} finally {
  postgres(["dropdb", "--if-exists", database]);
}
