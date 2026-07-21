-- C5A: isolated platform-commercial capability for the existing webapp staff login.
-- The login keeps its ordinary SET-only app_staff edge and explicitly SET ROLEs into this
-- terminal capability only for authenticated platform operations.

\set ON_ERROR_STOP on
\pset pager off

\if :{?c5a_platform_login_role}
\else
\echo 'FATAL: missing c5a_platform_login_role'
SELECT 1 / 0 AS c5a_platform_login_role_missing;
\endif

SELECT 1 / (
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = :'c5a_platform_login_role'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
  )
)::int AS c5a_platform_login_role_is_safe;

BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_operations') THEN
    CREATE ROLE app_platform_operations NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE app_platform_operations
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- The capability is a terminal leaf and has one exact SET-only login edge.
SELECT format('REVOKE app_platform_operations FROM %I', member.rolname)
FROM pg_auth_members membership
JOIN pg_roles member ON member.oid = membership.member
JOIN pg_roles granted ON granted.oid = membership.roleid
WHERE granted.rolname = 'app_platform_operations'
  AND member.rolname <> :'c5a_platform_login_role'
\gexec

SELECT format('REVOKE %I FROM app_platform_operations', granted.rolname)
FROM pg_auth_members membership
JOIN pg_roles member ON member.oid = membership.member
JOIN pg_roles granted ON granted.oid = membership.roleid
WHERE member.rolname = 'app_platform_operations'
\gexec

REVOKE app_platform_operations FROM :"c5a_platform_login_role";
GRANT app_platform_operations TO :"c5a_platform_login_role"
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

REVOKE ALL ON SCHEMA public, app FROM app_platform_operations;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_platform_operations;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_platform_operations;
REVOKE ALL ON ALL ROUTINES IN SCHEMA app FROM app_platform_operations;

GRANT USAGE ON SCHEMA public TO app_platform_operations;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_tariffs TO app_platform_operations;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_trial_policy TO app_platform_operations;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_organization_trials TO app_platform_operations;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides TO app_platform_operations;
GRANT SELECT ON TABLE public.be_organizations TO app_platform_operations;
GRANT UPDATE (tariff_id, commercial_access_state) ON TABLE public.be_organizations TO app_platform_operations;
GRANT INSERT ON TABLE public.admin_audit_log TO app_platform_operations;

ALTER TABLE public.saas_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tariffs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_tariffs_platform_operations ON public.saas_tariffs;
CREATE POLICY saas_tariffs_platform_operations ON public.saas_tariffs
  FOR ALL TO app_platform_operations USING (true) WITH CHECK (true);

ALTER TABLE public.saas_trial_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_trial_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_trial_policy_platform_operations ON public.saas_trial_policy;
CREATE POLICY saas_trial_policy_platform_operations ON public.saas_trial_policy
  FOR ALL TO app_platform_operations USING (true) WITH CHECK (true);

ALTER TABLE public.saas_organization_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_organization_trials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_organization_trials_platform_operations ON public.saas_organization_trials;
CREATE POLICY saas_organization_trials_platform_operations ON public.saas_organization_trials
  FOR ALL TO app_platform_operations USING (true) WITH CHECK (true);

ALTER TABLE public.saas_org_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_org_entitlement_overrides_platform_operations ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_platform_operations ON public.saas_org_entitlement_overrides
  FOR ALL TO app_platform_operations USING (true) WITH CHECK (true);

ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS be_organizations_platform_operations_select ON public.be_organizations;
CREATE POLICY be_organizations_platform_operations_select ON public.be_organizations
  FOR SELECT TO app_platform_operations USING (true);
DROP POLICY IF EXISTS be_organizations_platform_operations_update ON public.be_organizations;
CREATE POLICY be_organizations_platform_operations_update ON public.be_organizations
  FOR UPDATE TO app_platform_operations USING (true) WITH CHECK (true);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_log_platform_operations_insert ON public.admin_audit_log;
CREATE POLICY admin_audit_log_platform_operations_insert ON public.admin_audit_log
  FOR INSERT TO app_platform_operations WITH CHECK (true);

SELECT 1 / (
  NOT pg_has_role('app_platform_operations', 'app_staff', 'MEMBER')
  AND NOT pg_has_role('app_staff', 'app_platform_operations', 'MEMBER')
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles granted ON granted.oid = membership.roleid
    WHERE member.rolname = :'c5a_platform_login_role'
      AND granted.rolname = 'app_platform_operations'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = 'app_platform_operations'
  )
)::int AS c5a_platform_operations_exact_role_wall;

COMMIT;

\echo 'C5A platform operations runtime: OK (isolated SET-only capability)'
