-- DEV-only C1: schema `app` access for the C0 bootstrap/nonstaff runtime login.
--
-- Why this exists (2026-08-01, cabinet-login-first incident):
--   `packages/db-principal` calls `SELECT app.release_principal_context()` directly on the
--   connection's default role whenever the current DB principal is `bootstrap` or `infra` and
--   `DB_PRINCIPAL_CONTEXT_MODE` is `shadow`/`locked` (see `applySignedDbPrincipal` in
--   packages/db-principal/src/index.ts) — this happens on BOTH apply and cleanup, for every
--   `pool.query()` issued while a request has not yet established a session (e.g.
--   `GET /api/auth/dev-bypass`, and every other route that calls `stampBootstrapPrincipal`).
--   That call runs BEFORE any `SET ROLE`, so it executes as the login role itself, not as
--   `app_staff`/`app_patient`. `apps/webapp/src/infra/db/webappPoolProvider.ts`'s
--   `choosePoolKindForPrincipal` routes a `bootstrap` principal to the NONSTAFF pool
--   (`DATABASE_URL_NONSTAFF`), so only `bcb_dev_runtime_nonstaff_login` needs this — the staff
--   login is never used for a bootstrap principal.
--
--   `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` grants this (plus a much larger,
--   TEST-specific closure of public/booking/auth functions) to the equivalent TEST role via
--   `deploy/host/deploy-test-saas.sh` — so TEST already has this exact grant and is not affected.
--   DEV has no equivalent automated closure (`dev-c0-runtime-logins.sql` only creates/normalizes
--   the two login roles and their SET-only wall membership; it never touches schema `app`), so
--   this one call was never granted here. This file is the minimal DEV-only fix: exactly the one
--   schema + one function proven necessary by the `permission denied for schema app` trace, not
--   the full TEST closure.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database, after
-- `dev-c0-runtime-logins.sql` and the p0-5b/p2-b overlays that create `app_staff`/`app_patient`
-- and the `app.*` SECURITY DEFINER functions.
--
-- Rollback: `REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM
-- bcb_dev_runtime_nonstaff_login; REVOKE USAGE ON SCHEMA app FROM bcb_dev_runtime_nonstaff_login;`

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant requires the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'bcb_dev_runtime_nonstaff_login'
      AND rolcanlogin AND NOT rolsuper AND NOT rolinherit
  ) THEN
    RAISE EXCEPTION 'bcb_dev_runtime_nonstaff_login is missing or not the expected NOINHERIT login role; run dev-c0-runtime-logins.sql first';
  END IF;

  IF to_regprocedure('app.release_principal_context()') IS NULL THEN
    RAISE EXCEPTION 'app.release_principal_context() is missing; run the p2-b-protected-principal-context.sql overlay first';
  END IF;
END
$guard$;

GRANT USAGE ON SCHEMA app TO bcb_dev_runtime_nonstaff_login;
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO bcb_dev_runtime_nonstaff_login;

DO $assertions$
BEGIN
  IF NOT has_schema_privilege('bcb_dev_runtime_nonstaff_login', 'app', 'USAGE')
     OR NOT has_function_privilege(
       'bcb_dev_runtime_nonstaff_login', 'app.release_principal_context()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant did not take effect';
  END IF;

  -- Least-privilege guard: the staff login must stay exactly as walled off from schema `app`
  -- directly as it was before this file — its bootstrap-principal traffic never uses this pool.
  IF has_schema_privilege('bcb_dev_runtime_staff_login', 'app', 'USAGE') THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant leaked USAGE to the staff login; refusing';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C1 bootstrap schema-app grant: OK (bcb_dev_runtime_nonstaff_login can now release the bootstrap principal context)'
