-- D15b/4: role for pre-session identity resolution on public.platform_users.
--
-- CREATE ROLE requires CREATEROLE/superuser, which neither the Drizzle migrator role nor its
-- temporary app_owner membership grants (app_owner itself is NOCREATEROLE, asserted by
-- deploy/host/migrate-dev.sh) -- so, matching every other new role in this repo
-- (u9a-platform-settings-role.sql, phase4-app-worker-narrow-rls.sql), this lives in its own
-- sudo -u postgres overlay, applied BEFORE apps/webapp/db/drizzle-migrations/0353_platform_users_rls_d15b4_local.sql
-- (that migration's CREATE POLICY statements reference this role by name).
--
-- Membership is granted to the bare pre-session login roles by the callers of this file
-- (d3-4-bootstrap-base-login-read-grants.sql for the webapp nonstaff/bootstrap login,
-- integrator-login-public-identity-grants.sql for the integrator login) -- NOT here, since those
-- role names are environment-specific (`-v` substituted) and this file must be idempotent and
-- environment-agnostic like its siblings.
\set ON_ERROR_STOP on

DO $d15b4_identity_bootstrap_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_identity_bootstrap') THEN
    CREATE ROLE app_identity_bootstrap NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$d15b4_identity_bootstrap_role$;
ALTER ROLE app_identity_bootstrap NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

COMMENT ON ROLE app_identity_bootstrap IS
  'D15b/4: pre-session identity resolution on public.platform_users only (login-by-phone/email/oauth '
  'candidate lookup, and the shared platform-merge write engine). Granted only to bare bootstrap login '
  'roles, never to app_staff/app_patient -- see migration 0353.';

GRANT USAGE ON SCHEMA public, app TO app_identity_bootstrap;

-- Every USING/WITH CHECK on public.platform_users (self, staff-org, bootstrap branches together)
-- calls these three; Postgres permission-checks every function an applicable policy references at
-- plan time regardless of short-circuiting, so any role that may query the table needs EXECUTE on
-- all three even though this role's own branch only calls pg_has_role().
GRANT EXECUTE ON FUNCTION app.is_staff() TO app_identity_bootstrap;
GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_identity_bootstrap;
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_identity_bootstrap;

GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_users TO app_identity_bootstrap;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_identity TO app_identity_bootstrap;
