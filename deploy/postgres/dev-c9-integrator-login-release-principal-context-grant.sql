-- DEV-only C9: grant bcb_webapp_dev_user (the integrator/worker login) AND the
-- app_operational_delivery_worker capability role EXECUTE on app.release_principal_context().
--
-- Why this exists (2026-08-04, D30 §Ш7): after dev-c5/dev-c6/dev-c7/dev-c8 closed every capability-role
-- grant gap and the FOR-UPDATE-in-READ-ONLY bug in operationalPoolReadiness.ts's probe itself was fixed,
-- and DATABASE_URL_DELIVERY_WORKER was wired into apps/webapp/.env.dev so the integrator's technical-role
-- pool routing (apps/integrator/src/infra/db/integratorPoolProvider.ts) has a delivery-worker pool to route
-- into at all, a live `pnpm run worker:dev` attempt still failed on its very first DB checkout:
-- `permission denied for function release_principal_context`.
--
-- `packages/db-principal`'s `applySignedDbPrincipal` calls `SELECT app.release_principal_context()`
-- directly on the connection's CURRENT role, on both apply (before `SET ROLE`, as the login itself --
-- `apps/integrator/src/infra/db/withClient.ts:124-131`, `checkoutIntegratorPoolClient` ->
-- `prepareIntegratorClient`) and cleanup (AFTER `prepareIntegratorTechnicalPoolClient`'s
-- `SET ROLE app_operational_delivery_worker` has already run, so as the capability role --
-- `releasePreparedIntegratorClient` -> `clearDbPrincipalFromConnection`). Both edges hit the same
-- `permission denied`, in sequence, as each prior grant closed the previous one:
--   1. Apply-time, as the login: the exact same failure mode dev-c1-bootstrap-schema-app-grants.sql
--      already fixed for the webapp's two runtime logins (bcb_dev_runtime_staff_login/
--      bcb_dev_runtime_nonstaff_login) -- but the integrator process uses a THIRD, separate login
--      (bcb_webapp_dev_user, per DATABASE_URL in apps/webapp/.env.dev), which dev-c1 never covered because
--      at the time no DEV overlay had reached the point of actually running the integrator worker
--      end-to-end.
--   2. Cleanup-time, as the capability role: SET ROLE has already switched the connection to
--      app_operational_delivery_worker by the time cleanup runs, and that role has its own separate ACL
--      entry (PostgreSQL EXECUTE grants do not follow role membership).
--
-- The canonical fix for both edges, on TEST/PROD, is c4-operational-runtime.sql:
--   - lines 842-846: `GRANT EXECUTE ON FUNCTION app.release_principal_context() TO
--     app_operational_diagnostic, app_operational_delivery_worker, app_operational_scheduler,
--     app_operational_media_worker;` (the capability roles, cleanup-time edge)
--   - the three distinct operator-provisioned DB LOGIN roles receive the same cleanup grant at apply time.
--     `app_operational_media_worker` is selected only inside the webapp control seam and has no LOGIN.
-- DEV has one shared login standing in for all three DB logins (see dev-c5's header) -- this file gives that
-- one login the same direct grant, and gives app_operational_delivery_worker (the only capability role this
-- DEV unblock has exercised end-to-end) the matching capability-role grant. The other three capability
-- roles (diagnostic/scheduler/media_worker) are left untouched -- out of this unblock's scope, same as
-- dev-c7's boundary.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database.
--
-- Rollback: `REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM bcb_webapp_dev_user,
-- app_operational_delivery_worker;`
--
-- Idempotent: GRANT is natively idempotent; re-running against an already-aligned database is a no-op.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C9 integrator-login release_principal_context grant requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C9 integrator-login release_principal_context grant requires the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bcb_webapp_dev_user' AND rolcanlogin) THEN
    RAISE EXCEPTION 'bcb_webapp_dev_user login role is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_operational_delivery_worker' AND NOT rolcanlogin AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'app_operational_delivery_worker capability role is missing or unsafe';
  END IF;

  IF to_regprocedure('app.release_principal_context()') IS NULL THEN
    RAISE EXCEPTION 'app.release_principal_context() is missing; run the p2-b-protected-principal-context.sql overlay first';
  END IF;
END
$guard$;

GRANT EXECUTE ON FUNCTION app.release_principal_context() TO bcb_webapp_dev_user;
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO app_operational_delivery_worker;

DO $assertions$
BEGIN
  IF NOT has_function_privilege('bcb_webapp_dev_user', 'app.release_principal_context()', 'EXECUTE') THEN
    RAISE EXCEPTION 'DEV C9 integrator-login release_principal_context grant did not take effect';
  END IF;

  IF NOT has_function_privilege(
    'app_operational_delivery_worker', 'app.release_principal_context()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'DEV C9 delivery-worker capability release_principal_context grant did not take effect';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C9 integrator-login + delivery-worker capability release_principal_context grants: OK'
