-- DEV-only C10: grant app_operational_delivery_worker EXECUTE on
-- app.read_integrator_platform_integration_availability().
--
-- Why this exists (2026-08-04, D30 §Ш7): after dev-c5 through dev-c9 closed every grant gap the
-- eight readiness probes touch and the readiness-probe FOR-UPDATE bug itself was fixed, the delivery
-- worker's actual job-drain tick (apps/integrator/src/app/di.ts:256, `isPlatformIntegrationAvailable` ->
-- `app.read_integrator_platform_integration_availability()`) still failed live on DEV with
-- `permission denied for function read_integrator_platform_integration_availability` -- this call runs on
-- EVERY dispatch attempt (legacy `worker:job-queue-drain` and unified `worker:outgoing-delivery-tick`
-- alike, both classified to the `app_operational_delivery_worker` technical role by
-- apps/integrator/src/infra/db/withClient.ts's `workerInfraSources`), so it is on the critical path of the
-- Ш7 drain, not an edge case.
--
-- This function is NOT part of the eight readiness probes (operationalPoolReadiness.ts never calls it), so
-- it never surfaced during the readiness-probe investigation -- only running the worker to an actual delivery
-- attempt exposed it. Its only existing grant is `deploy/postgres/integrator-server-runtime-config.sql`'s
-- `GRANT EXECUTE ON FUNCTION app.read_integrator_platform_integration_availability() TO
-- :"integrator_runtime_config_role"` -- a DIFFERENT role (the integrator API's own base login, not any of
-- the four C4 operational capability roles). No deploy/postgres/*.sql overlay grants this function to
-- app_operational_delivery_worker anywhere, including c4-operational-runtime.sql -- this looks like a gap in
-- the canonical grant set itself, not just a DEV-provisioning drift, and is worth the owner/lead flagging for
-- TEST/PROD once the readiness-probe fix lands there (TEST's worker has been crash-looping on the earlier
-- FOR-UPDATE bug since 2026-08-03 and has never reached this call to hit it).
--
-- This file applies only the one grant DEV needs to unblock the drain, to the capability role (not any base
-- login), matching how dev-c8's read_outgoing_delivery_reclaim_config grant was scoped.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database.
--
-- Rollback: `REVOKE EXECUTE ON FUNCTION app.read_integrator_platform_integration_availability() FROM
-- app_operational_delivery_worker;`
--
-- Idempotent: GRANT is natively idempotent; re-running against an already-aligned database is a no-op.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C10 platform-integration-availability grant requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C10 platform-integration-availability grant requires the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_operational_delivery_worker' AND NOT rolcanlogin AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'app_operational_delivery_worker capability role is missing or unsafe';
  END IF;

  IF to_regprocedure('app.read_integrator_platform_integration_availability()') IS NULL THEN
    RAISE EXCEPTION 'app.read_integrator_platform_integration_availability() is missing; run migration 0329 first';
  END IF;
END
$guard$;

GRANT EXECUTE ON FUNCTION app.read_integrator_platform_integration_availability()
  TO app_operational_delivery_worker;

DO $assertions$
BEGIN
  IF NOT has_function_privilege(
    'app_operational_delivery_worker',
    'app.read_integrator_platform_integration_availability()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'DEV C10 platform-integration-availability grant did not take effect';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C10 delivery-worker platform-integration-availability grant: OK'
