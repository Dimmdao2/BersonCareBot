-- DEV-only C6: grant saas_telemetry_owner the missing UPDATE on public.saas_isolation_event_hourly.
--
-- Why this exists (2026-08-04, D30 §Ш7): starting apps/integrator's worker on DEV requires
-- assertWorkerIsolationTelemetryWriterReady (active because DB_PRINCIPAL_CONTEXT_MODE=locked leaks into
-- the integrator process from apps/webapp/.env.dev, by design -- see loadEnv.ts). That probe calls the
-- SECURITY DEFINER function app.report_saas_isolation_event, owned by saas_telemetry_owner, which upserts
-- into public.saas_isolation_event_hourly via `INSERT ... ON CONFLICT (event_id, bucket_start) DO UPDATE
-- SET occurrence_count = ... + 1`. ON CONFLICT DO UPDATE requires UPDATE privilege on the target table, not
-- just INSERT. deploy/postgres/saas-isolation-telemetry.sql declares the canonical fix as
-- `ALTER TABLE public.saas_isolation_event_hourly OWNER TO saas_telemetry_owner` (table ownership implies
-- every privilege, including UPDATE) -- but on DEV the table is still owned by bcb_webapp_dev_user, so that
-- overlay never fully ran here (same drift class as dev-c4-runtime-table-grants.sql's header). Live
-- symptom, DEV worker startup 2026-08-04: `permission denied for table saas_isolation_event_hourly`,
-- `CONTEXT: ... PL/pgSQL function app.report_saas_isolation_event(text,text,text,text) line 45`.
--
-- Minimal fix, not the full canonical one: grant the one missing privilege (UPDATE) the function's own
-- statement needs, instead of transferring table ownership -- ownership transfer is a bigger, unscoped
-- change (cascades to DROP/ALTER rights) than this DEV unblock calls for. saas_telemetry_owner already
-- holds INSERT/SELECT/DELETE (see `\dp public.saas_isolation_event_hourly` before this file runs).
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database.
--
-- Rollback: `REVOKE UPDATE ON TABLE public.saas_isolation_event_hourly FROM saas_telemetry_owner;`
--
-- Idempotent: GRANT is natively idempotent; re-running against an already-aligned database is a no-op.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C6 telemetry-owner grant requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C6 telemetry-owner grant requires the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_telemetry_owner') THEN
    RAISE EXCEPTION 'saas_telemetry_owner role is missing -- run deploy/postgres/saas-isolation-telemetry.sql first';
  END IF;

  IF to_regclass('public.saas_isolation_event_hourly') IS NULL THEN
    RAISE EXCEPTION 'public.saas_isolation_event_hourly is missing';
  END IF;
END
$guard$;

GRANT UPDATE ON TABLE public.saas_isolation_event_hourly TO saas_telemetry_owner;

DO $assertions$
BEGIN
  IF NOT has_table_privilege('saas_telemetry_owner', 'public.saas_isolation_event_hourly', 'UPDATE') THEN
    RAISE EXCEPTION 'DEV C6 telemetry-owner grant did not take effect';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C6 saas_telemetry_owner UPDATE grant: OK'
