-- 0241_platform_operations_audit_health_archive_global_view: give the dedicated platform DB
-- role (app_platform_settings, entered via the "platform" DB principal — see
-- packages/db-principal/src/index.ts createDbPlatformPrincipal / SET ROLE app_platform_settings)
-- read access to admin_audit_log (Журнал операций) and operator_health_failure_archive (Архив
-- сбоев), scoped to ALL clinics — never a single organization_id.
--
-- ROOT CAUSE (confirmed live on TEST 2026-07-25, has_table_privilege queries against
-- bersoncarebot_test):
--   has_table_privilege('app_platform_settings', 'public.admin_audit_log', 'SELECT') = false
--   has_table_privilege('app_platform_settings', 'public.operator_health_failure_archive', 'SELECT') = false
-- Both tables are FORCE ROW LEVEL SECURITY with exactly one read policy, `saas_org_dormant_p0_8_3`
-- (deploy/postgres/phase4-locked-helper-rls-policies.sql), gated on
-- `app.is_staff() AND organization_id = app.current_org_id()`. `app.is_staff()` is
-- `current_user = 'app_staff' OR pg_has_role(current_user, 'app_staff', 'member')` — true for the
-- staff pool's own login role, but false when that connection has `SET ROLE app_platform_settings`
-- (app_staff is a member OF app_platform_settings per u9a-platform-settings-role.sql, not the
-- other way around, so pg_has_role('app_platform_settings','app_staff','member') is false). So even
-- after the webapp guard/pool fix (apps/webapp/src/app-layer/guards/requireRole.ts,
-- requirePlatformOperationsPage/requirePlatformOperationsApiContext now stamp the platform
-- principal), the global admin's read still 42501'd — admin_audit_log only had an INSERT policy for
-- app_platform_settings (c5a-platform-operations-runtime.sql) and operator_health_failure_archive
-- had no grant/policy for that role at all. This is why GET /api/admin/audit-log,
-- GET /api/admin/health-failure-archive and the "Журнал операций" / "Архив сбоев" pages stayed
-- broken for the global admin even once the DB-principal stamping was fixed.
--
-- Owner ruling (carried in apps/webapp/CLAUDE.md context, "audit log / operations journal and the
-- health archive must show ALL clinics for the global admin"): the new policy is intentionally
-- `USING (true)` — unrestricted — for app_platform_settings only, mirroring the existing
-- be_organizations_platform_operations_select / saas_tariffs_platform_operations idiom from
-- deploy/postgres/c5a-platform-operations-runtime.sql. The pre-existing `saas_org_dormant_p0_8_3`
-- policy for app_staff is untouched: a clinic user still sees only their own organization_id.
--
-- SELECT-only: the global admin's UI here is a read surface (list views). Manually resolving an
-- open admin_audit_log conflict row (`POST /api/admin/audit-log/resolve`) for a clinic outside the
-- platform admin's own organization membership is a separate, more sensitive UPDATE-privilege
-- question the owner has not ruled on yet — deliberately NOT granted here (see the worker's final
-- report, "NOT DONE / RISKS").

GRANT SELECT ON TABLE public.admin_audit_log TO app_platform_settings;
GRANT SELECT ON TABLE public.operator_health_failure_archive TO app_platform_settings;

-- Both tables also carry the older, still-live `saas_org_dormant_p0_8_3` policy
-- (deploy/postgres/phase4-locked-helper-rls-policies.sql), which targets `{public}` (every role,
-- app_platform_settings included) and its USING clause calls app.is_staff() and
-- app.current_org_id(). Postgres must be able to EVALUATE that clause for our new SELECT even
-- though it is meant to end up false for this role (permissive policies are OR'd, and the
-- unrestricted policy below is what actually admits the row) -- confirmed on TEST/scratch:
-- without these two EXECUTE grants the query 42501's with "permission denied for function
-- current_org_id"/"is_staff", not a row-visibility difference. Both functions are STABLE
-- SECURITY DEFINER with no argument (app.principal_context lookup only) — granting EXECUTE
-- exposes no data, only lets the caller ask "am I staff / what is my org", same as app_staff and
-- app_patient already can.
GRANT EXECUTE ON FUNCTION app.is_staff() TO app_platform_settings;
GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_platform_settings;

DROP POLICY IF EXISTS admin_audit_log_platform_operations_select ON public.admin_audit_log;
CREATE POLICY admin_audit_log_platform_operations_select ON public.admin_audit_log
  FOR SELECT TO app_platform_settings USING (true);

DROP POLICY IF EXISTS operator_health_failure_archive_platform_operations_select
  ON public.operator_health_failure_archive;
CREATE POLICY operator_health_failure_archive_platform_operations_select
  ON public.operator_health_failure_archive
  FOR SELECT TO app_platform_settings USING (true);

-- Self-check: exactly SELECT, nothing more, for app_platform_settings on these two tables; the
-- pre-existing app_staff org-scoped policy is left completely alone.
DO $check$
BEGIN
  IF NOT (
    has_table_privilege('app_platform_settings', 'public.admin_audit_log', 'SELECT')
    AND has_table_privilege('app_platform_settings', 'public.operator_health_failure_archive', 'SELECT')
    AND NOT has_table_privilege('app_platform_settings', 'public.operator_health_failure_archive', 'INSERT')
    AND NOT has_table_privilege('app_platform_settings', 'public.operator_health_failure_archive', 'UPDATE')
    AND NOT has_table_privilege('app_platform_settings', 'public.operator_health_failure_archive', 'DELETE')
    AND NOT has_table_privilege('app_platform_settings', 'public.admin_audit_log', 'DELETE')
    AND has_table_privilege('app_staff', 'public.admin_audit_log', 'SELECT')
    AND has_table_privilege('app_staff', 'public.operator_health_failure_archive', 'SELECT')
  ) THEN
    RAISE EXCEPTION 'platform_operations_audit_health_archive_grant_wall_failed';
  END IF;
END
$check$;
