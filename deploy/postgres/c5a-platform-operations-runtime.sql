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

BEGIN;

-- Close ambient commercial DML left by historical overlays before extending the platform role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_tariffs FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_trial_policy FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_organization_trials FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides FROM app_staff;
GRANT SELECT ON TABLE public.saas_tariffs, public.saas_organization_trials,
  public.saas_org_entitlement_overrides TO app_staff;

DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.saas_org_entitlement_overrides;
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.saas_organization_trials;
DROP POLICY IF EXISTS saas_tariffs_staff_read_write ON public.saas_tariffs;
DROP POLICY IF EXISTS saas_trial_policy_staff_read_write ON public.saas_trial_policy;

GRANT USAGE ON SCHEMA public TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_tariffs TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_trial_policy TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_organization_trials TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides TO app_platform_settings;
GRANT SELECT ON TABLE public.be_organizations TO app_platform_settings;
GRANT UPDATE (tariff_id, commercial_access_state) ON TABLE public.be_organizations TO app_platform_settings;
GRANT INSERT ON TABLE public.admin_audit_log TO app_platform_settings;

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

ALTER TABLE public.saas_organization_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_organization_trials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_organization_trials_platform_operations ON public.saas_organization_trials;
CREATE POLICY saas_organization_trials_platform_operations ON public.saas_organization_trials
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);

ALTER TABLE public.saas_org_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_org_entitlement_overrides_platform_operations ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_platform_operations ON public.saas_org_entitlement_overrides
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);

ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS be_organizations_platform_operations_select ON public.be_organizations;
CREATE POLICY be_organizations_platform_operations_select ON public.be_organizations
  FOR SELECT TO app_platform_settings USING (true);
DROP POLICY IF EXISTS be_organizations_platform_operations_update ON public.be_organizations;
CREATE POLICY be_organizations_platform_operations_update ON public.be_organizations
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);

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
  v_patient_user_id uuid := NULLIF(current_setting('app.patient_user_id', true), '')::uuid;
  v_organization_id uuid;
  v_policy record;
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
    UPDATE public.be_organizations
    SET commercial_access_state = 'no_trial',
        updated_at = now()
    WHERE id = v_organization_id;
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
GRANT EXECUTE ON FUNCTION app.current_provisioned_owner_organization() TO app_platform_settings;
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.start_provisioned_organization_trial() TO %I',
  pg_get_userbyid(procedure.proowner)
)
FROM pg_proc AS procedure
WHERE procedure.oid = 'app.provision_specialist_owner(uuid)'::regprocedure
\gexec

SELECT 1 / (
  NOT has_table_privilege('app_staff', 'public.saas_tariffs', 'INSERT')
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
)::int AS c5a_platform_operations_exact_role_wall;

COMMIT;

\echo 'C5A platform operations runtime: OK (dedicated platform principal capability)'
