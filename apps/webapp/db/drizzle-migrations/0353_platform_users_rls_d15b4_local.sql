-- 0353: D15b/4 -- enable + FORCE row-level security on public.platform_users (identity/PII table).
-- TEMPORARY LOCAL MIGRATION NUMBER 0353 (AGENTS.md "Миграции") -- the lead renumbers at land.
--
-- Authority: docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md D15b/4. Census
-- runs/integrator-cleanup/D15B1_IDENTITY_CENSUS_2026-08-03.md SS1 re-confirmed live on DEV+TEST:
-- relrowsecurity=f, and app_patient (a patient session, no row filter) can SELECT every row --
-- a PII leak (first_name/last_name/patronymic/birth_date/gender/phone_normalized/email) AND a
-- cross-clinic tenant-boundary hole (a patient of clinic A can read clinic B's patient rows).
--
-- Every principal that legitimately touches a row, and where it lands below:
--   1. The person themself       -> platform_users_self_select / _update (id = own patient GUC).
--   2. Staff of the person's org -> platform_users_staff_org_{select,update,delete}, same
--                                    EXISTS(org_enrollments) / EXISTS(be_organization_members) shape
--                                    already live on org_enrollments itself (organization-wide, no
--                                    per-assignment predicate). NOTE: this shape is an AGENT choice,
--                                    not an owner decision -- the "variant A / owner decision
--                                    2026-07-11" attribution was retracted 04.08 (owner: "I could not
--                                    have said that, it is agent language"). It is retained here only
--                                    because the owner's own 04.08 model puts the hard wall BETWEEN
--                                    clinics and leaves in-clinic visibility to a code-level filter:
--                                    "достаточно жесткого блока на данные между клиниками ... а внутри
--                                    фильтр на уровне кода". So RLS stops at the org boundary BY
--                                    DESIGN; the in-clinic "own patient" filter belongs in code and is
--                                    not implemented yet (docs/_TODO/VISIBILITY_MODEL_GAP_2026-08-04.md).
--   3. The platform role         -> untouched. app_platform_settings has NO grant on this table
--                                    (asserted today by deploy-test-saas.sh / e1-webapp-runtime-config.sql
--                                    has_table_privilege('app_platform_settings', 'public.platform_users', ...)
--                                    = false) and only ever reads through existing app_owner
--                                    SECURITY DEFINER accessors (e.g. 0261
--                                    is_platform_registration_analytics_user_excluded, 0267
--                                    list_platform_organization_members, 0342
--                                    find_platform_user_ids_by_any_confirmed_email), which bypass RLS
--                                    via app_owner's BYPASSRLS. No new policy branch needed or added.
--   4. Operational workers       -> none read platform_users directly today (D15b/1 census SS2.3 +
--                                    live grep of apps/integrator/src/infra/runtime/worker/**: the
--                                    delivery worker gets phone/chatId from its own queued payload,
--                                    never SELECTs platform_users). No branch added; a real future
--                                    need copies the existing narrow app_worker-role-branch shape
--                                    (deploy/postgres/phase4-app-worker-narrow-rls.sql), not this one.
--   5. Migrator/bootstrap paths  -> platform_users_identity_bootstrap_{select,insert,update}, gated
--                                    on membership in a NEW role, app_identity_bootstrap. Granted
--                                    ONLY to the bare pre-session login roles (webapp's
--                                    nonstaff/bootstrap login, the integrator's login) -- never to
--                                    app_staff/app_patient themselves, so an authenticated,
--                                    SET-ROLE'd session does NOT carry this membership and cannot use
--                                    this branch to read outside its own wall. Covers: login-by-phone
--                                    /email/oauth candidate lookup (pgUserByPhone.ts, pgEmailAuth.ts,
--                                    pgOAuthUserResolve.ts, pgIdentityResolution.ts -- all confirmed
--                                    to run with zero principal set) and the one shared identity
--                                    write engine (packages/platform-merge, landed D15b/2) that
--                                    creates/enriches a person's canonical row before any org/self
--                                    context can exist (there is nothing to match app.current_org_id()
--                                    or app.current_patient_user_id() against yet -- the row IS the
--                                    context being established).
--
-- CREATE ROLE requires CREATEROLE/superuser, which neither the Drizzle migrator ($DBROLE) nor its
-- temporary app_owner membership grants (deploy/host/migrate-dev.sh asserts app_owner is itself
-- NOCREATEROLE) -- matching every other new role in this repo (app_platform_settings, app_worker,
-- the app_operational_* family), role creation and the environment-specific bare-login-role grants
-- live in a deploy/postgres/*.sql overlay applied by `sudo -u postgres`, NOT in this migration:
-- deploy/postgres/d15b4-platform-users-identity-bootstrap-role.sql. This migration only creates the
-- POLICIES that reference that role by name (CREATE POLICY does not validate the role exists; the
-- overlay must run before the policies are ever exercised, same ordering constraint the deploy script
-- already enforces for every other pre-migration role/grant overlay).
--
-- The two `c4_web_push_reminder_*` policies (c4_web_push_reminder_discovery, c4_web_push_reminder_user)
-- are dead: role app_operational_web_push_reminder and its provisioning script
-- (deploy/postgres/c4-web-push-reminder-runtime.sql) were retired 2026-08-03 (commit ff9b17e1121,
-- "chore(reminders): retire webpush-only runtime contour"); neither role name appears anywhere under
-- apps/**/deploy/**/packages/** today. Dropped here rather than left inert under the new FORCE policy
-- set (they would still combine safely as extra permissive OR-branches, but a dead role's policy is
-- pure noise on a table this sensitive).
--
-- FORCE, not just ENABLE: matches the existing pattern for be_organizations / saas_tariffs /
-- admin_audit_log (deploy/postgres/c5a-platform-operations-runtime.sql) -- the table owner is not
-- exempt. This is also what this migration's own live-proof requirement (WORK_ORDER D15b/4 step 4)
-- needs to actually mean something: ENABLE-only would be a no-op for the owner-run smoke.
--
-- Every USING/WITH CHECK below calls app.is_staff() / app.current_org_id() / app.current_patient_user_id()
-- (deploy/postgres/p2-b-protected-principal-context.sql) -- the SAME functions already used by the
-- current-generation SCOPED-table policies (e.g. migration 0344). Postgres permission-checks every
-- function referenced by an APPLICABLE policy at plan time regardless of short-circuiting
-- (documented the hard way in deploy/postgres/integrator-login-public-identity-grants.sql) -- but a
-- policy scoped `TO app_staff`/`TO app_patient` is only "applicable" to a session whose CURRENT role
-- literally IS that role (a real authenticated session always gets there via explicit SET ROLE) or
-- whose membership in it is INHERIT-eligible; it is NOT applicable to a NOINHERIT bare login role
-- that merely happens to be a role-graph member without ever SET ROLE-ing (proven live against DEV:
-- `bcb_test_integrator_login`, NOINHERIT member of app_staff, queried a `TO app_staff` FORCE-RLS
-- policy with zero EXECUTE grant on the function it calls and got a clean empty result, not 42501 --
-- the policy was skipped, not evaluated). That is exactly what lets the self/staff-org branches below
-- stay `TO app_patient`/`TO app_staff` WITHOUT re-granting is_staff()/current_org_id()/
-- current_patient_user_id() EXECUTE to the integrator's bare login -- re-granting those specifically
-- VIOLATES `assert_api_runtime_can_release_principal_context`
-- (deploy/postgres/integrator-login-public-identity-grants.sql lines ~354-364) and took TEST down
-- once already (2026-07-24) when tried. The identity-bootstrap branch, by contrast, is deliberately
-- left with NO `TO` clause (applicable to every role) and gates itself with an explicit
-- `pg_has_role(current_user, 'app_identity_bootstrap', 'member')` call, which -- unlike the implicit
-- `TO role` applicability check -- DOES resolve pure role-graph membership regardless of INHERIT; the
-- new role's own EXECUTE grants (in the deploy overlay) cover the three functions the OTHER
-- applicable branches on the same table still reference.

-- Role app_identity_bootstrap, its function EXECUTE grants and its platform_users table grant are
-- provisioned by deploy/postgres/d15b4-platform-users-identity-bootstrap-role.sql (sudo -u postgres),
-- applied before this migration runs -- see the header note above for why.

DROP POLICY IF EXISTS c4_web_push_reminder_discovery ON public.platform_users;
DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.platform_users;

ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_users FORCE ROW LEVEL SECURITY;

-- 1. The person themself.
DROP POLICY IF EXISTS platform_users_self_select ON public.platform_users;
CREATE POLICY platform_users_self_select ON public.platform_users
  FOR SELECT TO app_patient
  USING (app.current_patient_user_id() IS NOT NULL AND id = app.current_patient_user_id());

DROP POLICY IF EXISTS platform_users_self_update ON public.platform_users;
CREATE POLICY platform_users_self_update ON public.platform_users
  FOR UPDATE TO app_patient
  USING (app.current_patient_user_id() IS NOT NULL AND id = app.current_patient_user_id())
  WITH CHECK (app.current_patient_user_id() IS NOT NULL AND id = app.current_patient_user_id());

-- 2. Staff of the organization the target row belongs to (patient enrollment OR staff membership),
-- org-wide -- no per-assignment predicate, matching the existing patient-wall staff branch.
DROP POLICY IF EXISTS platform_users_staff_org_select ON public.platform_users;
CREATE POLICY platform_users_staff_org_select ON public.platform_users
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS platform_users_staff_org_update ON public.platform_users;
CREATE POLICY platform_users_staff_org_update ON public.platform_users
  FOR UPDATE TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  )
  WITH CHECK (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS platform_users_staff_org_delete ON public.platform_users;
CREATE POLICY platform_users_staff_org_delete ON public.platform_users
  FOR DELETE TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

-- Staff creating a brand-new client/staff row (e.g. doctor-created client profile): nothing to leak
-- on INSERT (the row does not exist yet), so no org predicate -- matches the unrestricted INSERT
-- app_staff already holds at the GRANT level today.
DROP POLICY IF EXISTS platform_users_staff_insert ON public.platform_users;
CREATE POLICY platform_users_staff_insert ON public.platform_users
  FOR INSERT TO app_staff
  WITH CHECK (app.is_staff());

-- 5. Migrator/bootstrap paths: pre-session identity resolution and the shared identity write engine.
DROP POLICY IF EXISTS platform_users_identity_bootstrap_select ON public.platform_users;
CREATE POLICY platform_users_identity_bootstrap_select ON public.platform_users
  FOR SELECT
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS platform_users_identity_bootstrap_insert ON public.platform_users;
CREATE POLICY platform_users_identity_bootstrap_insert ON public.platform_users
  FOR INSERT
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS platform_users_identity_bootstrap_update ON public.platform_users;
CREATE POLICY platform_users_identity_bootstrap_update ON public.platform_users
  FOR UPDATE
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'))
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));
