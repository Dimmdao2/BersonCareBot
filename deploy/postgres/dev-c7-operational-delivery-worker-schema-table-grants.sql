-- DEV-only C7: close the app_operational_delivery_worker schema/table grant gap declared by
-- deploy/postgres/c4-operational-runtime.sql.
--
-- Why this exists (2026-08-04, D30 §Ш7): dev-c5-operational-delivery-worker-membership.sql closed the
-- membership gap (bcb_webapp_dev_user -> app_operational_delivery_worker), but starting the worker then
-- surfaced that app_operational_delivery_worker itself never received the schema/table privileges
-- c4-operational-runtime.sql declares for it -- only the SECURITY DEFINER function EXECUTE grants from
-- migrations 0260/0328/0333/0335 exist on DEV; the schema-usage and table grant section of the c4 overlay
-- was never run here. Live symptom, DEV worker startup 2026-08-04 (as bcb_webapp_dev_user, `SET ROLE
-- app_operational_delivery_worker`): `permission denied for schema integrator`.
--
-- Running the full c4-operational-runtime.sql on DEV is not applicable: it requires four DISTINCT
-- operator-provisioned LOGIN roles (DEV has none -- see dev-c5's header) and it CREATE OR REPLACEs several
-- function bodies, which is out of this DEV unblock's scope (function bodies are not to be touched here).
-- This file instead applies, verbatim, the exact four GRANT statements c4-operational-runtime.sql declares
-- for the app_operational_delivery_worker CAPABILITY role specifically (not the per-environment login):
--   GRANT USAGE ON SCHEMA app TO app_operational_delivery_worker;
--   GRANT USAGE ON SCHEMA integrator TO app_operational_delivery_worker;
--   GRANT SELECT, UPDATE ON TABLE integrator.projection_outbox TO app_operational_delivery_worker;
--   GRANT SELECT, UPDATE ON TABLE public.outgoing_delivery_queue TO app_operational_delivery_worker;
-- (USAGE ON SCHEMA public is already true on DEV -- not part of this file.) No role is created, no function
-- is touched, no other capability role (diagnostic/scheduler/media_worker) is granted anything here.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database.
--
-- Rollback: REVOKE the same four grants from app_operational_delivery_worker.
--
-- Idempotent: GRANT is natively idempotent; re-running against an already-aligned database is a no-op.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C7 delivery-worker schema/table grants require the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C7 delivery-worker schema/table grants require the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_operational_delivery_worker' AND NOT rolcanlogin AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'app_operational_delivery_worker capability role is missing or unsafe';
  END IF;
END
$guard$;

GRANT USAGE ON SCHEMA app TO app_operational_delivery_worker;
GRANT USAGE ON SCHEMA integrator TO app_operational_delivery_worker;
GRANT SELECT, UPDATE ON TABLE integrator.projection_outbox TO app_operational_delivery_worker;
GRANT SELECT, UPDATE ON TABLE public.outgoing_delivery_queue TO app_operational_delivery_worker;

DO $assertions$
BEGIN
  IF NOT has_schema_privilege('app_operational_delivery_worker', 'app', 'USAGE')
     OR NOT has_schema_privilege('app_operational_delivery_worker', 'integrator', 'USAGE')
     OR NOT has_table_privilege('app_operational_delivery_worker', 'integrator.projection_outbox', 'SELECT, UPDATE')
     OR NOT has_table_privilege('app_operational_delivery_worker', 'public.outgoing_delivery_queue', 'SELECT, UPDATE')
  THEN
    RAISE EXCEPTION 'DEV C7 delivery-worker schema/table grants did not fully take effect';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C7 delivery-worker schema/table grants: OK'
