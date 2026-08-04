-- DEV-only C5: grant bcb_webapp_dev_user the missing SET-only membership in
-- app_operational_delivery_worker.
--
-- Why this exists (2026-08-04, D30 §Ш7): the canonical provisioning path for this membership is
-- deploy/postgres/c4-operational-runtime.sql via its deploy/host/provision-c4-operational-runtime.sh
-- wrapper, but that wrapper is hardcoded to PROD (assert_canonical_prod_host) or --bootstrap-test-env
-- (asserts the exact /opt/env/bersoncarebot/*.test paths) and reads four DISTINCT operator-provisioned
-- LOGIN roles from /opt/env, one per process family. DEV has no such env-file topology: both webapp and
-- integrator/worker share one login, bcb_webapp_dev_user (see LOCAL_DEV_AND_AGENT_TESTING.md §1), so the
-- wrapper's four-distinct-role precondition cannot be satisfied and re-running the full c4 overlay against
-- DEV is not meaningful (it would scrub/rebuild ACLs for four roles DEV doesn't operate separately).
--
-- This file is the minimal DEV extension of that canon: same idiom as dev-c0-runtime-logins.sql (operator-run,
-- guarded, idempotent, exact-edge assertion), scoped to the ONE thing D30 Ш7 needs -- bcb_webapp_dev_user
-- able to `SET ROLE app_operational_delivery_worker` so apps/integrator's worker can pass
-- assertDeliveryWorkerPoolReady (packages/db-principal SET ROLE dispatch, apps/integrator/src/infra/db/
-- operationalPoolReadiness.ts). app_operational_delivery_worker itself and the SECURITY DEFINER functions
-- it holds EXECUTE on (migrations 0260/0328/0333/0335) already exist on bcb_webapp_dev unchanged; this file
-- creates no role, drops no role, and does not touch any GRANT/REVOKE beyond the one membership edge.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database.
--
-- Rollback: `REVOKE app_operational_delivery_worker FROM bcb_webapp_dev_user;`
--
-- Idempotent: safe to re-run -- the REVOKE-then-GRANT pair always converges on the one exact edge.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C5 delivery-worker membership requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C5 delivery-worker membership requires the exact postgres superuser operator';
  END IF;

  IF pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database()))
       <> 'bcb_webapp_dev_user' THEN
    RAISE EXCEPTION 'DEV C5 delivery-worker membership requires the canonical DEV owner topology';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_operational_delivery_worker' AND NOT rolcanlogin AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'app_operational_delivery_worker capability role is missing or unsafe -- run deploy/postgres/c4-operational-runtime.sql''s role-creation step first';
  END IF;

  IF to_regprocedure('app.resolve_outgoing_delivery_scope(uuid)') IS NULL THEN
    RAISE EXCEPTION 'app.resolve_outgoing_delivery_scope(uuid) is missing -- delivery-worker readiness probes require it';
  END IF;
END
$guard$;

-- Converge on exactly one edge: drop any prior grant of this capability (correct or not), then install
-- the one allowed SET-only edge. Idempotent.
REVOKE app_operational_delivery_worker FROM bcb_webapp_dev_user;
GRANT app_operational_delivery_worker TO bcb_webapp_dev_user WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

DO $assertions$
BEGIN
  IF 1 <> (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname = 'bcb_webapp_dev_user'
      AND granted_role.rolname = 'app_operational_delivery_worker'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  ) THEN
    RAISE EXCEPTION 'DEV C5 delivery-worker membership is not the exact SET-only edge';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C5 delivery-worker membership: OK (bcb_webapp_dev_user can SET ROLE app_operational_delivery_worker)'
