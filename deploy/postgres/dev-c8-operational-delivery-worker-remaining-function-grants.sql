-- DEV-only C8: close the last two app_operational_delivery_worker function gaps found by the 04.08 audit
-- while chasing the readiness-probe crash-loop (D30 §Ш7).
--
-- Why this exists (2026-08-04, D30 §Ш7): after dev-c5/dev-c6/dev-c7 unblocked worker startup and the
-- operationalPoolReadiness.ts probe itself was fixed (it called two SELECT ... FOR UPDATE functions inside
-- its shared BEGIN READ ONLY, which is structurally impossible on any environment -- see that file's
-- comment), a replay of the delivery-worker's actual runtime SQL surface (not just the eight readiness
-- probes, which never touch these two calls) found two more DEV-only grant gaps on the reclaim-tick path:
--
--   1. `app.read_outgoing_delivery_reclaim_config()` does not exist on bcb_webapp_dev at all. Unlike every
--      other function this D30 grant chain has touched, this one is declared ONLY inside
--      c4-operational-runtime.sql (deploy/postgres/c4-operational-runtime.sql:711-731) -- no drizzle
--      migration creates it, so DEV never got it from the normal migration ledger the way it got
--      resolve_outgoing_delivery_scope/operator_incident_alert_already_sent/etc. Its caller
--      (apps/integrator/src/infra/db/repos/outgoingDeliveryReclaimSettings.ts) degrades to
--      DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG on any error, so its absence does not crash the worker --
--      but the reclaim tick then silently runs on hardcoded thresholds instead of the admin-configured ones,
--      which is exactly the D10b regression the function exists to prevent. Body below is copied verbatim
--      from c4-operational-runtime.sql; only the CREATE + the one EXECUTE grant this DEV role needs are
--      applied, matching that file's own guard comment: "a single-purpose argless capability, exclusive to
--      this worker role."
--   2. `app.open_or_touch_operator_incident(text,text,text,text,text)` already exists on DEV (created by
--      migration 0329_integrator_login_delivery_capabilities_local.sql), but app_operational_delivery_worker
--      never received EXECUTE on it -- that grant, like the others in this chain, lives only in
--      c4-operational-runtime.sql:735-739, which has never run in full on DEV (see dev-c7's header for the
--      same class of gap). No function body is touched here, only the missing GRANT.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database, after dev-c5/dev-c6/dev-c7.
--
-- Rollback: `DROP FUNCTION app.read_outgoing_delivery_reclaim_config();` and
-- `REVOKE EXECUTE ON FUNCTION app.open_or_touch_operator_incident(text,text,text,text,text) FROM
-- app_operational_delivery_worker;`
--
-- Idempotent: CREATE OR REPLACE + natively-idempotent GRANT; re-running against an already-aligned database
-- is a no-op (the function body is byte-identical to the canonical declaration, so CREATE OR REPLACE never
-- changes anything on a converged database).

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C8 delivery-worker remaining function grants require the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C8 delivery-worker remaining function grants require the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_operational_delivery_worker' AND NOT rolcanlogin AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'app_operational_delivery_worker capability role is missing or unsafe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE EXCEPTION 'app_owner role is missing -- required as the owner of the function created below';
  END IF;

  IF to_regprocedure('app.open_or_touch_operator_incident(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'app.open_or_touch_operator_incident(text,text,text,text,text) is missing -- expected from migration 0329';
  END IF;

  IF to_regclass('public.system_settings') IS NULL THEN
    RAISE EXCEPTION 'public.system_settings is missing';
  END IF;
END
$guard$;

-- 1. Create the missing single-purpose reclaim-config reader, verbatim from c4-operational-runtime.sql.
CREATE OR REPLACE FUNCTION app.read_outgoing_delivery_reclaim_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'outgoing_delivery_reclaim_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
ALTER FUNCTION app.read_outgoing_delivery_reclaim_config() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_outgoing_delivery_reclaim_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_outgoing_delivery_reclaim_config() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.read_outgoing_delivery_reclaim_config()
  TO app_operational_delivery_worker;

-- 2. Grant the missing EXECUTE on the already-existing incident accessor.
REVOKE ALL ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text)
  TO app_operational_delivery_worker;

DO $assertions$
BEGIN
  IF to_regprocedure('app.read_outgoing_delivery_reclaim_config()') IS NULL THEN
    RAISE EXCEPTION 'DEV C8: app.read_outgoing_delivery_reclaim_config() was not created';
  END IF;

  IF NOT has_function_privilege(
    'app_operational_delivery_worker',
    'app.read_outgoing_delivery_reclaim_config()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'DEV C8: app_operational_delivery_worker EXECUTE on read_outgoing_delivery_reclaim_config did not take effect';
  END IF;

  IF NOT has_function_privilege(
    'app_operational_delivery_worker',
    'app.open_or_touch_operator_incident(text,text,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'DEV C8: app_operational_delivery_worker EXECUTE on open_or_touch_operator_incident did not take effect';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C8 delivery-worker remaining function grants: OK'
