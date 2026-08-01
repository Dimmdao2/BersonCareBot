-- C5A: extend the existing dedicated platform principal with commercial administration.
-- Application code enters the already-canonical app_platform_settings role only from an
-- authenticated platform principal; clinic staff never receive these mutation privileges.

\set ON_ERROR_STOP on
\pset pager off

SELECT 1 / (
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_platform_settings'
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
  )
)::int AS c5a_platform_role_is_safe;

DO $c5a_clinic_billing_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_clinic_billing') THEN
    CREATE ROLE app_clinic_billing NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$c5a_clinic_billing_role$;
ALTER ROLE app_clinic_billing
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- app_staff is transport only. The clinic-management guard stamps a clinicBilling principal; the
-- shared DB-principal chokepoint then switches to this role for that exact-org request. An ordinary
-- staff principal remains app_staff and has no billing table ACL.
GRANT app_clinic_billing TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public, app TO app_clinic_billing;
GRANT EXECUTE ON FUNCTION
  app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text),
  app.current_org_id(),
  app.release_principal_context()
TO app_clinic_billing;

BEGIN;

-- Close ambient commercial DML left by historical overlays before extending the platform role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_tariffs FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_trial_policy FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_organization_trials FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides FROM app_staff;
GRANT SELECT ON TABLE public.saas_tariffs, public.saas_organization_trials,
  public.saas_org_entitlement_overrides TO app_staff;
GRANT SELECT ON TABLE public.be_organizations TO app_staff;

-- A-6 / #1007 (docs/_TODO/NIGHT_PLAN_2026-07-26.md): `clinical_test_measure_kinds` has no
-- `organization_id` at all -- the owner's FINAL scope decision (2026-06-17,
-- docs/_TODO/SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md) deliberately left it OUT of the
-- 84-table needs-org-id list: it is a platform-owned catalog, not per-tenant. app_staff (every
-- clinic doctor) held blanket UPDATE/DELETE from the generic P0.5b grant, with no ownership check
-- anywhere in the write path -- any clinic's doctor could bulk-relabel/reorder EVERY row, mutating
-- what every other clinic's clinical-test form renders. Doctors keep SELECT (read) and INSERT
-- (idempotent-by-code "add a new label", see POST /api/doctor/measure-kinds -- it can never edit or
-- overwrite an existing row). Only the platform operator may UPDATE (relabel/reorder existing rows);
-- DELETE is not used by any route and is not granted to either role.
--
-- Guarded, not unconditional: this overlay also runs against scratch/throwaway databases that
-- never apply the full drizzle-migrations chain (e.g. the U3S specialist-signup-provisioning smoke
-- builds a private cluster from a hand-picked migration subset that does not include 0034, where
-- this table is created). An unconditional REVOKE aborted the whole file there with `relation
-- "public.clinical_test_measure_kinds" does not exist` -- everything after it, including the
-- app.start_provisioned_organization_trial() SECURITY DEFINER function further down, silently
-- never ran. The guard stays LOUD: silently skipping a security REVOKE would be worse than failing
-- loudly, so a missing table logs a RAISE WARNING naming exactly what closure was skipped instead
-- of just passing quietly.
DO $c5a_clinical_test_measure_kinds_revoke$
BEGIN
  IF to_regclass('public.clinical_test_measure_kinds') IS NULL THEN
    RAISE WARNING 'A-6 / #1007: public.clinical_test_measure_kinds does not exist on this database -- skipping the app_staff UPDATE/DELETE write-lock revoke. If this table is later created here without rerunning this overlay, app_staff keeps its historical blanket UPDATE/DELETE on it.';
  ELSE
    REVOKE UPDATE, DELETE ON TABLE public.clinical_test_measure_kinds FROM app_staff;
  END IF;
END
$c5a_clinical_test_measure_kinds_revoke$;

DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.saas_org_entitlement_overrides;
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.saas_organization_trials;
DROP POLICY IF EXISTS saas_org_entitlement_overrides_org_wall ON public.saas_org_entitlement_overrides;
DROP POLICY IF EXISTS saas_org_entitlement_overrides_org_read ON public.saas_org_entitlement_overrides;
DROP POLICY IF EXISTS saas_organization_trials_org_wall ON public.saas_organization_trials;
DROP POLICY IF EXISTS saas_tariffs_staff_read_write ON public.saas_tariffs;
DROP POLICY IF EXISTS saas_trial_policy_staff_read_write ON public.saas_trial_policy;

GRANT USAGE ON SCHEMA public TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_tariffs TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_trial_policy TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_registration_tariff_policy TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_organization_trials TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides TO app_platform_settings;
GRANT SELECT ON TABLE public.be_organizations TO app_platform_settings;
GRANT SELECT ON TABLE public.be_organization_members TO app_platform_settings;
GRANT UPDATE (tariff_id, commercial_access_state, updated_at)
  ON TABLE public.be_organizations TO app_platform_settings;
GRANT INSERT ON TABLE public.admin_audit_log TO app_platform_settings;
GRANT EXECUTE ON FUNCTION app.list_platform_organization_members(uuid)
  TO app_platform_settings;

-- #1069: courses and CMS pages are toggle-only mechanics now (no numeric quota, no usage count).
-- app.cms_pages_snapshot_usage(uuid) and app.enforce_courses_snapshot_quota() were dropped by
-- migration 0277; the platform storefront no longer needs a course-row count either.
-- Keep the seat count behind one reviewed app_owner seam so the platform role cannot read
-- invited_email, token_hash, or any other column from the FORCE-RLS invite relation.
DO $c5a_enforced_quota_usage_runtime$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      VALUES
        ('public.be_organization_members'),
        ('public.organization_member_invites')
    ) AS expected(name)
    WHERE to_regclass(expected.name) IS NULL
  ) THEN
    RAISE WARNING '§10.1: enforced quota-usage relations are incomplete -- skipping the guarded count accessor.';
    RETURN;
  END IF;

  -- #1069 stage 2.6: the accessor's RETURNS TABLE list changed when the seat warning threshold was
  -- removed, and PostgreSQL refuses `CREATE OR REPLACE` across a changed return type ("cannot
  -- change return type of existing function"). The overlay is re-runnable, so it drops the old
  -- signature first; every grant this function needs is re-issued below, right after creation.
  DROP FUNCTION IF EXISTS app.read_org_enforced_quota_usage(uuid);

  EXECUTE $quota_usage_function$
    CREATE OR REPLACE FUNCTION app.read_org_enforced_quota_usage(
      p_organization_id uuid
    )
    RETURNS TABLE(clinic_team_used integer)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $function$
      SELECT
        (
          (SELECT count(*) FROM public.be_organization_members AS membership
           WHERE membership.organization_id = p_organization_id
             AND membership.status = 'active'
             AND membership.specialist_id IS NOT NULL)
          +
          (SELECT count(*) FROM public.organization_member_invites AS invite
           WHERE invite.organization_id = p_organization_id
             AND invite.status = 'pending'
             AND invite.expires_at > now()
             AND invite.invited_role = 'doctor')
          +
          (SELECT count(*) FROM public.organization_member_invites AS invite
           JOIN public.be_organization_members AS membership
             ON membership.id = invite.accepted_membership_id
           WHERE invite.organization_id = p_organization_id
             AND invite.status = 'accepted'
             AND invite.invited_role = 'doctor'
             AND membership.status = 'active'
             AND membership.specialist_id IS NULL)
        )::int AS clinic_team_used
      WHERE p_organization_id IS NOT NULL
    $function$
  $quota_usage_function$;

  ALTER FUNCTION app.read_org_enforced_quota_usage(uuid) OWNER TO app_owner;
  GRANT SELECT ON TABLE public.organization_member_invites TO app_owner;
  REVOKE ALL PRIVILEGES ON TABLE
    public.organization_member_invites
  FROM app_platform_settings;
  DROP POLICY IF EXISTS organization_member_invites_platform_quota_usage_select
    ON public.organization_member_invites;
  REVOKE ALL ON FUNCTION app.read_org_enforced_quota_usage(uuid)
    FROM PUBLIC, app_staff, app_patient, app_clinic_billing, app_platform_settings;
  GRANT EXECUTE ON FUNCTION app.read_org_enforced_quota_usage(uuid)
    TO app_platform_settings;
END
$c5a_enforced_quota_usage_runtime$;
-- A-6 / #1007: matching platform-side grant for the clinical_test_measure_kinds write-lock above.
-- SELECT/UPDATE for catalog management; the platform principal never needs a fresh INSERT path of
-- its own -- doctors already cover "add a new label" via the insert-only POST route.
-- Guarded the same way and for the same reason as the REVOKE above: some databases this overlay
-- runs against never create this table.
DO $c5a_clinical_test_measure_kinds_platform_grant$
BEGIN
  IF to_regclass('public.clinical_test_measure_kinds') IS NULL THEN
    RAISE WARNING 'A-6 / #1007: public.clinical_test_measure_kinds does not exist on this database -- skipping the app_platform_settings SELECT/UPDATE grant.';
  ELSE
    GRANT SELECT, UPDATE ON TABLE public.clinical_test_measure_kinds TO app_platform_settings;
  END IF;
END
$c5a_clinical_test_measure_kinds_platform_grant$;

-- Phase 4 SaaS billing tables arrive in migration 0259. This overlay also runs against bounded
-- scratch clusters that omit that migration, so the entire rehydration is explicitly guarded.
DO $c5a_saas_billing_runtime$
DECLARE
  relation_name text;
  relation_names constant text[] := ARRAY[
    'saas_billing_accounts',
    'saas_billing_subscriptions',
    'saas_billing_invoices',
    'saas_billing_provider_events'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(relation_names) AS expected(name)
    WHERE to_regclass('public.' || expected.name) IS NULL
  ) THEN
    RAISE WARNING 'Phase 4: one or more saas_billing_* tables do not exist -- skipping the guarded C5A billing rehydration.';
    RETURN;
  END IF;

  FOREACH relation_name IN ARRAY relation_names LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM app_staff',
      relation_name
    );
    EXECUTE format(
      'REVOKE DELETE ON TABLE public.%I FROM app_platform_settings',
      relation_name
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM app_patient',
      relation_name
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM app_clinic_billing',
      relation_name
    );
    EXECUTE format(
      'GRANT SELECT ON TABLE public.%I TO app_clinic_billing',
      relation_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO app_platform_settings',
      relation_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      relation_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      relation_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_staff_select',
      relation_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_clinic_billing_select',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO app_clinic_billing USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())',
      relation_name || '_clinic_billing_select',
      relation_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_platform_select',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO app_platform_settings USING (true)',
      relation_name || '_platform_select',
      relation_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_platform_insert',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO app_platform_settings WITH CHECK (true)',
      relation_name || '_platform_insert',
      relation_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_platform_update',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true)',
      relation_name || '_platform_update',
      relation_name
    );
  END LOOP;
END
$c5a_saas_billing_runtime$;
-- Read-only booking configuration for the global-admin overview at /app/doctor/admin/booking.
-- SELECT and nothing else, enumerated table by table; the matching cross-tenant read policies and
-- the full rationale are in the be_* platform-operations policy block further down this file.
GRANT SELECT ON TABLE
  public.be_branches,
  public.be_specialists,
  public.be_clinic_services,
  public.be_specialist_service_availability,
  public.be_service_location_availability,
  public.be_working_hours
  TO app_platform_settings;

ALTER TABLE public.saas_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tariffs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_tariffs_platform_operations ON public.saas_tariffs;
CREATE POLICY saas_tariffs_platform_operations ON public.saas_tariffs
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);

ALTER TABLE public.saas_trial_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_trial_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_trial_policy_platform_operations ON public.saas_trial_policy;
CREATE POLICY saas_trial_policy_platform_operations ON public.saas_trial_policy
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);

-- §5a item 2.6a — the registration-tariff setting is its own singleton, same shape as
-- saas_trial_policy above: platform-operations read/write, no other role touches it.
ALTER TABLE public.saas_registration_tariff_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_registration_tariff_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_registration_tariff_policy_platform_operations
  ON public.saas_registration_tariff_policy;
CREATE POLICY saas_registration_tariff_policy_platform_operations
  ON public.saas_registration_tariff_policy
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);

ALTER TABLE public.saas_organization_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_organization_trials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_organization_trials_platform_operations ON public.saas_organization_trials;
CREATE POLICY saas_organization_trials_platform_operations ON public.saas_organization_trials
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS saas_organization_trials_staff_current_org_read
  ON public.saas_organization_trials;
CREATE POLICY saas_organization_trials_staff_current_org_read
  ON public.saas_organization_trials
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );

ALTER TABLE public.saas_org_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_org_entitlement_overrides_platform_operations ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_platform_operations ON public.saas_org_entitlement_overrides
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS saas_org_entitlement_overrides_staff_current_org_read
  ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_staff_current_org_read
  ON public.saas_org_entitlement_overrides
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );

ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS be_organizations_platform_operations_select ON public.be_organizations;
CREATE POLICY be_organizations_platform_operations_select ON public.be_organizations
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_organizations_platform_operations_update ON public.be_organizations;
CREATE POLICY be_organizations_platform_operations_update ON public.be_organizations
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS be_organizations_staff_current_org_read ON public.be_organizations;
CREATE POLICY be_organizations_staff_current_org_read ON public.be_organizations
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND id = app.current_org_id()
  );

-- #1070 correction: these legacy-named tables are patient-to-clinic messaging, including
-- clinical and rehabilitation text. They are not the platform helpdesk from owner plan §11.
-- The platform role must stay outside them until the dedicated ticket schema exists.
DO $c5a_platform_support_isolation$
BEGIN
  IF to_regclass('public.support_conversations') IS NULL
    OR to_regclass('public.support_conversation_messages') IS NULL
  THEN
    RAISE WARNING '#1070: patient communication tables do not exist -- skipping platform isolation rehydration.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS support_conversations_platform_operations_select
    ON public.support_conversations;
  DROP POLICY IF EXISTS support_conversation_messages_platform_operations_select
    ON public.support_conversation_messages;

  REVOKE ALL PRIVILEGES ON TABLE
    public.support_conversations,
    public.support_conversation_messages
    FROM app_platform_settings;
END
$c5a_platform_support_isolation$;

-- Booking-configuration read for the platform principal — the second half of taskdb #1009.
--
-- Symptom. /app/doctor/admin/booking is a platform-operations page (its guard chain is
-- requireAdminDoctorPage() -> requirePlatformOperationsPage(), so it runs as app_platform_settings).
-- It was unreachable for everyone until 79a4c1f57 removed a legacy middleware redirect; reachable,
-- it still could not render, because loadBookingAdminOverview() reads booking-engine configuration
-- this role could not see.
--
-- Exactly which tables, and how that was established: by reading the loader's call graph rather
-- than guessing. loadBookingAdminOverview() calls catalog.listBranches / catalog.listSpecialists /
-- services.listServices / services.listSpecialistServiceAvailability /
-- services.listServiceLocationAvailability (infra/repos/pgBookingEngine.ts) and
-- bookingScheduling.listWorkingHoursAdmin + usesWorkingHoursFallback ->
-- port.listWorkingHours (infra/repos/pgBookingScheduling.ts). Resolving those drizzle tables through
-- db/schema/bookingEngine.ts and db/schema/bookingScheduling.ts gives the six relations below and no
-- others. getDefaultOrganizationId() reads public.system_settings, which this role already holds;
-- public.be_organizations is granted above for the commercial surface.
--
-- TWO obstacles, and a GRANT alone fixes only the first — verified on DEV, where granting SELECT
-- without a policy returned 0 rows and no error, i.e. an empty page rather than a diagnosable
-- failure. (1) privilege: the role held SELECT on be_organizations only. (2) RLS: each of these
-- tables carries a single permissive policy, saas_org_dormant_p0_8_3
-- (deploy/postgres/phase4-locked-helper-rls-policies.sql), applying to ALL ROLES and shaped
-- `app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()`.
-- A platform principal is not app_staff and carries no org context, so it matches no row.
--
-- Cross-tenant read is the intended behaviour here, by the owner's ruling that the global admin sees
-- all clinics — the same shape the saas_* tables above already use. It is deliberately narrower than
-- those: FOR SELECT, never FOR ALL, one enumerated table at a time, and no BYPASSRLS anywhere. These
-- policies are scoped TO app_platform_settings, so tenant isolation for app_staff is untouched: staff
-- still match only saas_org_dormant_p0_8_3 and still see one organization.
--
-- Why here and not a migration: p2-b-protected-principal-context.sql and p0-5b-grants.sql scrub
-- privileges on every closure, and this file is the overlay that owns app_platform_settings and runs
-- after them (deploy/host/runtime-overlay-rehydrate-lib.sh always_overlays). A grant written in a
-- migration runs once and is silently revoked by the next deploy — exactly what happened to
-- migration 0241 and is recorded at the end of this file.
--
-- ENABLE/FORCE ROW LEVEL SECURITY is deliberately NOT asserted for these six: unlike be_organizations
-- they are already in phase4-force-rls-cutover.sql's pinned target list, which owns their ENABLE/FORCE
-- state (and un-forces them on its documented DOWN path). Adding no table there leaves its expected
-- target count untouched. Note also that these policies make the EXECUTE grants at the end of this
-- file load-bearing for six more tables: saas_org_dormant_p0_8_3 is permissive and applies to ALL
-- ROLES, so Postgres evaluates app.is_staff()/app.current_org_id() for the platform role here too.
DROP POLICY IF EXISTS be_branches_platform_operations_select ON public.be_branches;
CREATE POLICY be_branches_platform_operations_select ON public.be_branches
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_specialists_platform_operations_select ON public.be_specialists;
CREATE POLICY be_specialists_platform_operations_select ON public.be_specialists
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_clinic_services_platform_operations_select ON public.be_clinic_services;
CREATE POLICY be_clinic_services_platform_operations_select ON public.be_clinic_services
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_specialist_service_availability_platform_operations_select
  ON public.be_specialist_service_availability;
CREATE POLICY be_specialist_service_availability_platform_operations_select
  ON public.be_specialist_service_availability
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_service_location_availability_platform_operations_select
  ON public.be_service_location_availability;
CREATE POLICY be_service_location_availability_platform_operations_select
  ON public.be_service_location_availability
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_working_hours_platform_operations_select ON public.be_working_hours;
CREATE POLICY be_working_hours_platform_operations_select ON public.be_working_hours
  FOR SELECT TO app_platform_settings USING (true);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_log_platform_operations_insert ON public.admin_audit_log;
CREATE POLICY admin_audit_log_platform_operations_insert ON public.admin_audit_log
  FOR INSERT TO app_platform_settings WITH CHECK (true);

-- Narrow provisioning capability. The organization is derived from the signed patient principal's
-- freshly-created owner membership; callers cannot nominate an unrelated tenant. The capability
-- and the outer owner-provisioning function share one transaction, so organization+trial rollback
-- together on any failure.
CREATE OR REPLACE FUNCTION app.start_provisioned_organization_trial()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid;
  v_policy record;
  v_registration_tariff_id uuid;
  v_started_at timestamptz;
  v_trial_id uuid;
BEGIN
  IF v_patient_user_id IS NULL THEN
    RAISE EXCEPTION 'provisioning_patient_principal_required';
  END IF;

  v_organization_id := app.current_provisioned_owner_organization();
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'provisioned_owner_organization_required';
  END IF;

  -- §5a item 2.6a -- the registration-tariff setting, independent of the trial policy below. A
  -- missing row, a NULL tariff_id, or a since-archived tariff all collapse to the same NULL here:
  -- "no starting tariff configured" is a legal admin choice, not a lookup failure.
  SELECT reg.tariff_id
  INTO v_registration_tariff_id
  FROM public.saas_registration_tariff_policy AS reg
  INNER JOIN public.saas_tariffs AS tariff
    ON tariff.id = reg.tariff_id
   AND tariff.is_active
  WHERE reg.key = 'global'
  LIMIT 1
  FOR UPDATE OF reg;

  SELECT policy.*
  INTO v_policy
  FROM public.saas_trial_policy AS policy
  INNER JOIN public.saas_tariffs AS tariff
    ON tariff.id = policy.tariff_id
   AND tariff.is_active
  WHERE policy.key = 'global'
    AND policy.is_active
    AND policy.start_event = 'organization_provisioned'
  LIMIT 1
  FOR UPDATE OF policy;
  IF NOT FOUND THEN
    -- No active trial policy is configured on this platform (owner has not set one). Whether the
    -- organization instead gets a direct starting tariff is governed by the independent
    -- registration-tariff setting above -- never a hardcoded value.
    IF v_registration_tariff_id IS NOT NULL THEN
      UPDATE public.be_organizations
      SET tariff_id = v_registration_tariff_id,
          commercial_access_state = 'active',
          updated_at = now()
      WHERE id = v_organization_id;

      INSERT INTO public.admin_audit_log (
        organization_id, actor_id, action, target_id, details, status
      ) VALUES (
        v_organization_id, v_patient_user_id, 'saas_registration_tariff_assign',
        v_registration_tariff_id::text,
        jsonb_build_object(
          'reason', 'automatic organization provisioning -- registration tariff setting',
          'before', NULL,
          'after', jsonb_build_object('tariffId', v_registration_tariff_id)
        ),
        'ok'
      );
    ELSE
      -- Registration tariff is also unset: the person picks a tariff themselves. Land the
      -- organization in "compatibility" -- the same explicit state a migrated legacy clinic gets,
      -- and also `be_organizations.commercial_access_state`'s own column default, so this UPDATE
      -- only reasserts it explicitly instead of overwriting it with an agent-selected mechanic
      -- policy.
      UPDATE public.be_organizations
      SET commercial_access_state = 'compatibility',
          updated_at = now()
      WHERE id = v_organization_id;
    END IF;
    RETURN false;
  END IF;

  v_started_at := clock_timestamp();
  INSERT INTO public.saas_organization_trials (
    organization_id, tariff_id, started_at, ends_at, grace_ends_at,
    post_trial_behavior, post_trial_tariff_id, status, created_by
  ) VALUES (
    v_organization_id, v_policy.tariff_id, v_started_at,
    v_started_at + make_interval(days => v_policy.duration_days),
    v_started_at + make_interval(days => v_policy.duration_days + v_policy.grace_days),
    v_policy.post_trial_behavior, v_policy.post_trial_tariff_id, 'active', v_patient_user_id
  )
  ON CONFLICT (organization_id) DO NOTHING
  RETURNING id INTO v_trial_id;
  IF v_trial_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_organizations
  SET tariff_id = v_policy.tariff_id,
      commercial_access_state = 'active',
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id, v_patient_user_id, 'saas_trial_start', v_trial_id::text,
    jsonb_build_object(
      'reason', 'automatic organization provisioning trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', v_policy.tariff_id,
        'durationDays', v_policy.duration_days,
        'graceDays', v_policy.grace_days,
        'startEvent', v_policy.start_event,
        'postTrialBehavior', v_policy.post_trial_behavior,
        'postTrialTariffId', v_policy.post_trial_tariff_id
      )
    ),
    'ok'
  );
  RETURN true;
END
$function$;

ALTER FUNCTION app.start_provisioned_organization_trial() OWNER TO app_platform_settings;
REVOKE ALL ON FUNCTION app.start_provisioned_organization_trial() FROM PUBLIC, app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_platform_settings;
GRANT EXECUTE ON FUNCTION app.current_provisioned_owner_organization() TO app_platform_settings;

-- app.current_org_id() / app.is_staff() for app_platform_settings — and why the grant has to live
-- HERE and not in a migration.
--
-- Symptom (owner, 2026-07-26, second time): every global-admin settings page 500s with
-- `permission denied for function current_org_id`, AFTER I had already "fixed" it once.
--
-- Mechanism. public.system_settings carries TWO permissive policies:
--   u9a_platform_settings_global_only  TO app_platform_settings  USING (organization_id IS NULL)
--   saas_bootstrap_hybrid_p0_8_6       TO **ALL ROLES**          USING (organization_id IS NULL
--                                        OR (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))
-- Permissive policies are ORed, so Postgres must EVALUATE both for every reader — including the
-- platform role, which therefore needs EXECUTE on a tenant-scoped function it can never benefit
-- from (a platform principal has no org context; current_org_id() returns NULL and that branch is
-- always false, so the rows it sees come solely from the global-only policy).
--
-- Why the migration lost. 0241 granted exactly this, but p2-b-protected-principal-context.sql
-- REVOKES EXECUTE on these two functions from every grantee except the owner/staff/patient trio,
-- and it runs on EVERY closure. A migration runs once; the revoke runs every deploy — so the grant
-- survived until the next deploy and then vanished. app_worker and the app_operational_* roles are
-- already re-granted after that scrub by their own overlays (phase4-app-worker-narrow-rls.sql,
-- c4-operational-runtime.sql); this is the same pattern for the role THIS file owns.
--
-- Proper fix, deliberately NOT done here: scope saas_bootstrap_hybrid_p0_8_6 to the tenant roles
-- that actually need it instead of ALL, after auditing every reader of the table (today: app_staff,
-- saas_system_health_owner, plus the BYPASSRLS owner). Then the platform role is served by its own
-- policy alone and needs neither of these grants. Tracked with the security work — a platform-scope
-- read should not be filtered by a tenant predicate.
GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_platform_settings;
GRANT EXECUTE ON FUNCTION app.is_staff() TO app_platform_settings;
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.start_provisioned_organization_trial() TO %I',
  pg_get_userbyid(procedure.proowner)
)
FROM pg_proc AS procedure
WHERE procedure.oid = 'app.provision_specialist_owner(uuid)'::regprocedure
\gexec

SELECT 1 / (
  has_table_privilege('app_staff', 'public.be_organizations', 'SELECT')
  AND has_table_privilege('app_staff', 'public.saas_tariffs', 'SELECT')
  AND has_table_privilege('app_staff', 'public.saas_organization_trials', 'SELECT')
  AND has_table_privilege('app_staff', 'public.saas_org_entitlement_overrides', 'SELECT')
  AND NOT has_table_privilege('app_staff', 'public.saas_tariffs', 'INSERT')
  AND NOT has_table_privilege('app_staff', 'public.saas_tariffs', 'UPDATE')
  AND NOT has_table_privilege('app_staff', 'public.saas_tariffs', 'DELETE')
  AND NOT has_table_privilege('app_staff', 'public.saas_trial_policy', 'INSERT')
  AND NOT has_table_privilege('app_staff', 'public.saas_trial_policy', 'UPDATE')
  AND NOT has_table_privilege('app_staff', 'public.saas_trial_policy', 'DELETE')
  AND NOT has_table_privilege('app_staff', 'public.saas_organization_trials', 'INSERT')
  AND NOT has_table_privilege('app_staff', 'public.saas_organization_trials', 'UPDATE')
  AND NOT has_table_privilege('app_staff', 'public.saas_organization_trials', 'DELETE')
  AND NOT has_table_privilege('app_staff', 'public.saas_org_entitlement_overrides', 'INSERT')
  AND NOT has_table_privilege('app_staff', 'public.saas_org_entitlement_overrides', 'UPDATE')
  AND NOT has_table_privilege('app_staff', 'public.saas_org_entitlement_overrides', 'DELETE')
  AND NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'SELECT')
  AND NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'INSERT')
  AND NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'UPDATE')
  AND has_table_privilege('app_platform_settings', 'public.be_organization_members', 'SELECT')
  AND NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'INSERT')
  AND NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'UPDATE')
  AND NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'DELETE')
  AND has_function_privilege(
    'app_platform_settings',
    'app.list_platform_organization_members(uuid)',
    'EXECUTE'
  )
  AND NOT has_table_privilege('app_platform_settings', 'public.be_organizations', 'UPDATE')
  AND has_column_privilege('app_platform_settings', 'public.be_organizations', 'tariff_id', 'UPDATE')
  AND has_column_privilege('app_platform_settings', 'public.be_organizations', 'commercial_access_state', 'UPDATE')
  AND has_column_privilege('app_platform_settings', 'public.be_organizations', 'updated_at', 'UPDATE')
  AND NOT has_column_privilege('app_platform_settings', 'public.be_organizations', 'title', 'UPDATE')
  AND NOT has_column_privilege('app_platform_settings', 'public.be_organizations', 'is_active', 'UPDATE')
)::int AS c5a_platform_operations_exact_role_wall;

-- §10.1 exact platform usage wall: the storefront gets EXECUTE on the count-only seat accessor and
-- no direct privilege or policy on invite rows. Courses/CMS pages are toggle-only mechanics now
-- (migration 0277) -- there is no course-row count or cms_pages_snapshot_usage accessor to guard.
DO $c5a_platform_enforced_quota_usage_exact_wall$
DECLARE
  inventory_ok boolean;
BEGIN
  IF to_regclass('public.organization_member_invites') IS NULL
     OR to_regprocedure('app.read_org_enforced_quota_usage(uuid)') IS NULL THEN
    RAISE WARNING '§10.1: enforced quota usage prerequisites are incomplete -- skipping the guarded exact wall.';
    RETURN;
  END IF;

WITH expected(relation_name) AS (
  VALUES ('organization_member_invites')
), relations AS (
  SELECT
    expected.relation_name,
    relation.oid,
    relation.relowner,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  FROM expected
  JOIN pg_class AS relation
    ON relation.relname = expected.relation_name
   AND relation.relnamespace = 'public'::regnamespace
), actual_acl AS (
  SELECT relations.relation_name, privilege.privilege_type, privilege.is_grantable
  FROM relations
  CROSS JOIN LATERAL aclexplode(
    COALESCE(relations.relacl, acldefault('r', relations.relowner))
  ) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), actual_policy AS (
  SELECT
    relations.relation_name,
    policy.polname,
    policy.polcmd,
    policy.polpermissive,
    policy.polroles,
    pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
    policy.polwithcheck
  FROM relations
  JOIN pg_policy AS policy ON policy.polrelid = relations.oid
  WHERE 'app_platform_settings'::regrole = ANY(policy.polroles)
)
SELECT (
  (SELECT count(*) FROM relations) = 1
  AND (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM relations)
  AND NOT EXISTS (SELECT 1 FROM actual_acl)
  AND NOT EXISTS (SELECT 1 FROM actual_policy)
  AND has_table_privilege('app_owner', 'public.be_organization_members', 'SELECT')
  AND has_table_privilege('app_owner', 'public.organization_member_invites', 'SELECT')
  AND has_function_privilege(
    'app_platform_settings',
    'app.read_org_enforced_quota_usage(uuid)',
    'EXECUTE'
  )
)
INTO inventory_ok;

  IF NOT inventory_ok THEN
    RAISE EXCEPTION 'C5A enforced quota usage exact ACL/policy wall failed';
  END IF;
END
$c5a_platform_enforced_quota_usage_exact_wall$;

-- #1068 / owner D-5: exact platform clinic-account directory wall. The table remains on its
-- established bootstrap/RLS-off path; platform access is therefore pinned at the ACL boundary to
-- one non-grantable SELECT and no column grants. Identity is projected only through the reviewed
-- SECURITY DEFINER function, whose ACL is likewise exact and never exposes platform_users itself.
WITH target_relation AS (
  SELECT relation.oid, relation.relowner, relation.relacl
  FROM pg_class AS relation
  WHERE relation.oid = 'public.be_organization_members'::regclass
), expected_table_acl(privilege_type, is_grantable) AS (
  VALUES ('SELECT'::text, false)
), actual_table_acl AS (
  SELECT privilege.privilege_type, privilege.is_grantable
  FROM target_relation
  CROSS JOIN LATERAL aclexplode(
    COALESCE(target_relation.relacl, acldefault('r', target_relation.relowner))
  ) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), actual_column_acl AS (
  SELECT attribute.attname, privilege.privilege_type, privilege.is_grantable
  FROM target_relation
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = target_relation.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
  WHERE privilege.grantee = 'app_platform_settings'::regrole
), target_function AS (
  SELECT procedure.oid, procedure.proowner, procedure.proacl, procedure.prosecdef
  FROM pg_proc AS procedure
  WHERE procedure.oid = 'app.list_platform_organization_members(uuid)'::regprocedure
), expected_function_acl(grantee, privilege_type, is_grantable) AS (
  VALUES
    ('app_owner'::text, 'EXECUTE'::text, false),
    ('app_platform_settings'::text, 'EXECUTE'::text, false)
), actual_function_acl AS (
  SELECT
    COALESCE(grantee.rolname, privilege.grantee::text) AS grantee,
    privilege.privilege_type,
    privilege.is_grantable
  FROM target_function
  CROSS JOIN LATERAL aclexplode(
    COALESCE(target_function.proacl, acldefault('f', target_function.proowner))
  ) AS privilege
  LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
)
SELECT 1 / (
  (SELECT count(*) FROM target_relation) = 1
  AND NOT EXISTS (
    (SELECT * FROM actual_table_acl EXCEPT SELECT * FROM expected_table_acl)
    UNION ALL
    (SELECT * FROM expected_table_acl EXCEPT SELECT * FROM actual_table_acl)
  )
  AND NOT EXISTS (SELECT 1 FROM actual_column_acl)
  AND (SELECT count(*) FROM target_function) = 1
  AND (SELECT bool_and(prosecdef AND pg_get_userbyid(proowner) = 'app_owner') FROM target_function)
  AND NOT EXISTS (
    (SELECT * FROM actual_function_acl EXCEPT SELECT * FROM expected_function_acl)
    UNION ALL
    (SELECT * FROM expected_function_acl EXCEPT SELECT * FROM actual_function_acl)
  )
  AND NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'SELECT')
)::int AS c5a_platform_organization_members_directory_exact_wall;

WITH expected(policy_name, relation_name, org_predicate) AS (
  VALUES
    (
      'be_organizations_staff_current_org_read',
      'be_organizations',
      'id = app.current_org_id()'
    ),
    (
      'saas_organization_trials_staff_current_org_read',
      'saas_organization_trials',
      'organization_id = app.current_org_id()'
    ),
    (
      'saas_org_entitlement_overrides_staff_current_org_read',
      'saas_org_entitlement_overrides',
      'organization_id = app.current_org_id()'
    )
), actual AS (
  SELECT
    expected.*,
    policy.polname,
    policy.polcmd,
    policy.polroles,
    policy.polqual,
    policy.polwithcheck,
    pg_get_expr(policy.polqual, policy.polrelid) AS predicate
  FROM expected
  LEFT JOIN pg_class AS relation ON relation.relname = expected.relation_name
    AND relation.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_policy AS policy ON policy.polrelid = relation.oid
    AND policy.polname = expected.policy_name
)
SELECT 1 / (
  count(actual.polname) = 3
  AND bool_and(
    actual.polcmd = 'r'
    AND actual.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'app_staff')]
    AND actual.polqual IS NOT NULL
    AND actual.polwithcheck IS NULL
    AND position('app.is_staff()' IN actual.predicate) > 0
    AND position('app.current_org_id()' IN actual.predicate) > 0
    AND position(actual.org_predicate IN actual.predicate) > 0
  )
)::int AS c5a_staff_current_org_read_policy_wall
FROM actual;

-- Booking-configuration read wall (#1009). Pins BOTH halves of the fix and, just as importantly,
-- its narrowness: read-only, exactly these six relations, FOR SELECT only, scoped to the platform
-- role, no WITH CHECK. A future FOR ALL or a stray INSERT/UPDATE/DELETE grant fails the closure here
-- instead of quietly handing the platform principal cross-tenant write.
WITH booking_config(relation_name) AS (
  VALUES
    ('be_branches'),
    ('be_specialists'),
    ('be_clinic_services'),
    ('be_specialist_service_availability'),
    ('be_service_location_availability'),
    ('be_working_hours')
), privilege_wall AS (
  SELECT bool_and(
    has_table_privilege('app_platform_settings', 'public.' || relation_name, 'SELECT')
    AND NOT has_table_privilege('app_platform_settings', 'public.' || relation_name, 'INSERT')
    AND NOT has_table_privilege('app_platform_settings', 'public.' || relation_name, 'UPDATE')
    AND NOT has_table_privilege('app_platform_settings', 'public.' || relation_name, 'DELETE')
  ) AS ok
  FROM booking_config
), policy_wall AS (
  SELECT
    count(policy.polname) AS present,
    bool_and(
      policy.polcmd = 'r'
      AND policy.polpermissive
      AND policy.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'app_platform_settings')]
      AND policy.polwithcheck IS NULL
      AND pg_get_expr(policy.polqual, policy.polrelid) = 'true'
    ) AS ok
  FROM booking_config
  LEFT JOIN pg_class AS relation ON relation.relname = booking_config.relation_name
    AND relation.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_policy AS policy ON policy.polrelid = relation.oid
    AND policy.polname = booking_config.relation_name || '_platform_operations_select'
)
SELECT 1 / (
  privilege_wall.ok
  AND policy_wall.present = 6
  AND policy_wall.ok
)::int AS c5a_platform_booking_config_read_only_wall
FROM privilege_wall, policy_wall;

-- Exact Phase 4 billing wall. Guarded for the same partial-cluster reason as the rehydration block.
DO $c5a_saas_billing_exact_wall$
DECLARE
  relation_names constant text[] := ARRAY[
    'saas_billing_accounts',
    'saas_billing_subscriptions',
    'saas_billing_invoices',
    'saas_billing_provider_events'
  ];
  inventory_ok boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(relation_names) AS expected(name)
    WHERE to_regclass('public.' || expected.name) IS NULL
  ) THEN
    RAISE WARNING 'Phase 4: one or more saas_billing_* tables do not exist -- skipping the guarded C5A billing exact wall.';
    RETURN;
  END IF;

  WITH expected(relation_name) AS (
    SELECT unnest(relation_names)
  ), relations AS (
    SELECT
      expected.relation_name,
      relation.oid,
      relation.relowner,
      owner.rolname AS owner_name,
      relation.relacl,
      relation.relrowsecurity,
      relation.relforcerowsecurity
    FROM expected
    JOIN pg_class AS relation
      ON relation.relname = expected.relation_name
     AND relation.relnamespace = 'public'::regnamespace
    JOIN pg_roles AS owner ON owner.oid = relation.relowner
  ), role_oids AS (
    SELECT
      (SELECT oid FROM pg_roles WHERE rolname = 'app_clinic_billing') AS clinic_billing_oid,
      (SELECT oid FROM pg_roles WHERE rolname = 'app_platform_settings') AS platform_oid
  ), expected_table_acl(relation_name, grantee, privilege_type, is_grantable) AS (
    SELECT relation_name, owner_name, privilege_type, false
    FROM relations
    CROSS JOIN unnest(ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]::text[]) AS privilege_type
    UNION
    SELECT relation_name, 'app_clinic_billing', 'SELECT', false FROM relations
    UNION
    SELECT relation_name, 'app_platform_settings', privilege_type, false
    FROM relations
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]) AS privilege_type
  ), actual_table_acl AS (
    SELECT
      relations.relation_name,
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(grantee.rolname, acl.grantee::text)
      END AS grantee,
      acl.privilege_type,
      acl.is_grantable
    FROM relations
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relations.relacl, acldefault('r', relations.relowner))
    ) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
  ), actual_column_acl AS (
    SELECT
      relations.relation_name,
      attribute.attname,
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(grantee.rolname, acl.grantee::text)
      END AS grantee,
      acl.privilege_type,
      acl.is_grantable
    FROM relations
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = relations.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL aclexplode(attribute.attacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
  ), expected_policy_inventory AS (
    SELECT
      relations.relation_name,
      relations.relation_name || expected_policy.suffix AS policy_name,
      true AS permissive,
      expected_policy.command,
      expected_policy.roles,
      expected_policy.using_expression,
      expected_policy.check_expression
    FROM relations
    CROSS JOIN role_oids
    CROSS JOIN LATERAL (
      VALUES
        (
          '_clinic_billing_select',
          'r'::"char",
          ARRAY[role_oids.clinic_billing_oid]::oid[],
          '((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))'::text,
          NULL::text
        ),
        ('_platform_select', 'r'::"char", ARRAY[role_oids.platform_oid]::oid[], 'true'::text, NULL::text),
        ('_platform_insert', 'a'::"char", ARRAY[role_oids.platform_oid]::oid[], NULL::text, 'true'::text),
        ('_platform_update', 'w'::"char", ARRAY[role_oids.platform_oid]::oid[], 'true'::text, 'true'::text)
    ) AS expected_policy(suffix, command, roles, using_expression, check_expression)
  ), actual_policy_inventory AS (
    SELECT
      relations.relation_name,
      policy.polname AS policy_name,
      policy.polpermissive AS permissive,
      policy.polcmd AS command,
      policy.polroles AS roles,
      pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
      pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
    FROM relations
    JOIN pg_policy AS policy ON policy.polrelid = relations.oid
  )
  SELECT (
    (SELECT count(*) FROM relations) = 4
    AND (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM relations)
    AND EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'app_clinic_billing'
        AND NOT rolcanlogin
        AND NOT rolsuper
        AND NOT rolcreaterole
        AND NOT rolcreatedb
        AND NOT rolinherit
        AND NOT rolreplication
        AND NOT rolbypassrls
    )
    AND 1 = (
      SELECT count(*)
      FROM pg_auth_members AS membership
      WHERE membership.roleid = 'app_clinic_billing'::regrole
        AND membership.member = 'app_staff'::regrole
        AND NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
    )
    AND has_function_privilege(
      'app_clinic_billing',
      'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
      'EXECUTE'
    )
    AND has_function_privilege('app_clinic_billing', 'app.current_org_id()', 'EXECUTE')
    AND has_function_privilege('app_clinic_billing', 'app.release_principal_context()', 'EXECUTE')
    AND NOT EXISTS (
      (SELECT * FROM actual_table_acl EXCEPT SELECT * FROM expected_table_acl)
      UNION ALL
      (SELECT * FROM expected_table_acl EXCEPT SELECT * FROM actual_table_acl)
    )
    AND NOT EXISTS (SELECT 1 FROM actual_column_acl)
    AND NOT EXISTS (
      (SELECT * FROM actual_policy_inventory EXCEPT SELECT * FROM expected_policy_inventory)
      UNION ALL
      (SELECT * FROM expected_policy_inventory EXCEPT SELECT * FROM actual_policy_inventory)
    )
  )
  INTO inventory_ok;

  IF NOT inventory_ok THEN
    RAISE EXCEPTION 'C5A SaaS billing exact table/column ACL, policy, or FORCE RLS inventory failed';
  END IF;
END
$c5a_saas_billing_exact_wall$;

COMMIT;

\echo 'C5A platform operations runtime: OK (dedicated platform principal capability)'
